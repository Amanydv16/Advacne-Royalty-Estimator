"""
Catalog Pricing module for Advance Royalty Engine V3.
Implements:
- Change A: Removal of pay-through (p)
- Change B: Pre-recoupment split (rho) as direct admin control; K_base(T) = rho * 12 * T
- Change C: Song slope fitting over active life (trim leading/trailing zeros, skip interior zeros) and decay coverage reporting
- Change D: Expected margin and return computations with upper-bound disclosure flags
"""
from typing import List, Dict, Any, Tuple, Optional
from collections import defaultdict
import math
from .config import DEFAULT_CONFIG, clamp, clamp01, median
from backend.services.spotify_client import spotify_client


class CatalogValuationResult:
    def __init__(
        self,
        r0: float,
        r0_last: float,
        r0_window_months: List[str],
        gini_raw: Optional[float],
        gini_star: Optional[float],
        song_count: int,
        top_1_share: float,
        top_5_share: float,
        d_conc: float,
        d_decay: float,
        decay_coverage: float,
        per_song_decay: List[Dict[str, Any]],
        d_age: Optional[float],
        d_stream: Optional[float],
        dollar_age_years: float,
        dollar_age_months: float,
        risk_discount: float,
        k_base: float,
        k_t: float,
        a_catalog: float,
        a_last_sensitivity: float,
        ttr_years: float,
        months_to_recoup: float,
        rho_t: float,
        e_multiplier: float,
        term: int,
        post_recoup_share: float,
        margin_recoup: float,
        margin_tail: float,
        expected_gross: float,
        expected_return: float,
        flags: List[str]
    ):
        self.r0 = r0
        self.r0_last = r0_last
        self.r0_window_months = r0_window_months
        self.gini_raw = gini_raw
        self.gini_star = gini_star
        self.song_count = song_count
        self.top_1_share = top_1_share
        self.top_5_share = top_5_share
        self.d_conc = d_conc
        self.d_decay = d_decay
        self.decay_coverage = decay_coverage
        self.per_song_decay = per_song_decay
        self.d_age = d_age
        self.d_stream = d_stream
        self.dollar_age_years = dollar_age_years
        self.dollar_age_months = dollar_age_months
        self.risk_discount = risk_discount
        self.k_base = k_base
        self.k_t = k_t
        self.a_catalog = a_catalog
        self.a_last_sensitivity = a_last_sensitivity
        self.ttr_years = ttr_years
        self.months_to_recoup = months_to_recoup
        self.rho_t = rho_t
        self.e_multiplier = e_multiplier
        self.term = term
        self.post_recoup_share = post_recoup_share
        self.margin_recoup = margin_recoup
        self.margin_tail = margin_tail
        self.expected_gross = expected_gross
        self.expected_return = expected_return
        self.flags = flags


def compute_r0(
    monthly_totals: Dict[str, float],
    usable_months: List[str],
    r_win: int = 3
) -> Tuple[float, float, List[str]]:
    """
    R0 = median(revenue of the last R_WIN usable months).
    Also returns R0_last = revenue of the last single month.
    """
    if not usable_months:
        return 0.0, 0.0, []
    
    r_win_actual = min(r_win, len(usable_months))
    window_months = usable_months[-r_win_actual:]
    window_values = [monthly_totals[m] for m in window_months]
    
    r0 = median(window_values)
    r0_last = monthly_totals[usable_months[-1]]
    
    import logging
    engine_logger = logging.getLogger("royalty_pipeline")
    engine_logger.info(f"[VALUATION ENGINE] Canonical Usable Months ({len(usable_months)}): {usable_months}")
    engine_logger.info(f"[VALUATION ENGINE] Trailing {r_win_actual}-Month Window: {window_months} -> Monthly Values: {[round(v, 2) for v in window_values]}")
    engine_logger.info(f"[VALUATION ENGINE] Calculated Trailing Median R0 = ${r0:.2f} (Last Month R0_last = ${r0_last:.2f})")
    
    return r0, r0_last, window_months


def compute_concentration_gini(
    song_totals: List[float],
    config: Dict[str, Any]
) -> Tuple[Optional[float], Optional[float], float, float, float, List[str]]:
    """
    Concentration Gini calculation:
    G = ( 2 * SUM((i+1)*v[i]) ) / (n * S) - (n+1)/n
    G* = (n / (n-1)) * G
    d_conc = W_CONC * clamp01( (G* - C_STAR) / (1 - C_STAR) )
    """
    flags: List[str] = []
    w_conc = config.get("W_CONC", 0.20)
    c_star = config.get("C_STAR", 0.55)
    
    v = sorted([x for x in song_totals if x > 0.0])
    n = len(v)
    
    if n == 0:
        return None, None, 0.0, 0.0, 0.0, ["THIN_CATALOG"]
    
    total_rev = sum(v)
    top_1_share = v[-1] / total_rev if total_rev > 0 else 0.0
    top_5_share = sum(v[-5:]) / total_rev if total_rev > 0 else 0.0

    if n < 4:
        flags.append("THIN_CATALOG")
        return None, None, top_1_share, top_5_share, 0.0, flags

    weighted_sum = sum((i + 1) * v[i] for i in range(n))
    g = (2.0 * weighted_sum) / (n * total_rev) - (n + 1.0) / n
    g_star = (n / (n - 1.0)) * g
    g_star = clamp01(g_star)

    d_conc = w_conc * clamp01((g_star - c_star) / (1.0 - c_star))
    
    if g_star > 0.70:
        flags.append("CONCENTRATED_CATALOG")

    return g, g_star, top_1_share, top_5_share, d_conc, flags


def compute_share_weighted_decay(
    usable_rows: List[Dict[str, Any]],
    usable_months: List[str],
    config: Dict[str, Any]
) -> Tuple[float, float, List[Dict[str, Any]]]:
    """
    Change C (Engine V3 Section 5.3):
    Fit each song over its own active life:
    - Trim leading and trailing zeros.
    - Skip interior zeros (dropped feeds).
    - Fit log-linear trend keeping original x-axis offsets.
    - Return d_decay, decay_coverage, and per-song records.
    """
    w_decay = config.get("W_DECAY", 0.25)
    d_ref = config.get("D_REF", 0.10)
    min_share = config.get("MIN_SHARE", 0.005)
    
    # Group revenue by song, month, and store
    song_month_rev = defaultdict(lambda: defaultdict(float))
    month_total_rev = defaultdict(float)
    song_store_month_rev = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))
    song_store_rev = defaultdict(lambda: defaultdict(float))
    song_names = {}
    song_artworks = {}
    total_cat_rev = 0.0

    for r in usable_rows:
        key = r.get("isrc") or r.get("title") or "Unknown"
        m = r.get("sale_month") or r.get("month") or "2026-01"
        rev = max(0.0, float(r.get("earnings_usd", 0.0)))
        store = r.get("store") or r.get("dsp") or "Streaming"
        
        song_month_rev[key][m] += rev
        month_total_rev[m] += rev
        song_store_month_rev[key][m][store] += rev
        song_store_rev[key][store] += rev
        
        if r.get("title") and r.get("title") != key:
            song_names[key] = r.get("title")
        elif key not in song_names:
            song_names[key] = key

        if r.get("artwork") or r.get("image"):
            song_artworks[key] = r.get("artwork") or r.get("image")
            
        total_cat_rev += rev

    if total_cat_rev <= 0:
        return 0.0, 0.0, []

    per_song_records: List[Dict[str, Any]] = []
    weighted_severity_sum = 0.0
    covered_rev_sum = 0.0

    for s_key, m_rev_map in song_month_rev.items():
        s_total = sum(m_rev_map.values())
        share_i = s_total / total_cat_rev if total_cat_rev > 0 else 0.0

        # Resolve canonical metadata and high-res artwork image by ISRC
        if not song_artworks.get(s_key):
            meta = spotify_client.resolve_track_by_isrc(s_key)
            if meta:
                if meta.get("artwork"):
                    song_artworks[s_key] = meta["artwork"]
                if meta.get("title") and (song_names.get(s_key) == s_key or not song_names.get(s_key)):
                    song_names[s_key] = meta["title"]

        # Build detailed monthly history for this specific ISRC
        monthly_history = []
        prev_val = None
        for m in usable_months:
            m_val = round(m_rev_map.get(m, 0.0), 2)
            mom_pct = None
            if prev_val is not None and prev_val > 0:
                mom_pct = round(((m_val - prev_val) / prev_val) * 100, 1)
            prev_val = m_val if m_val > 0 else prev_val
            
            m_tot = month_total_rev.get(m, 0.0)
            m_share_pct = round((m_val / m_tot * 100), 1) if m_tot > 0 else 0.0
            
            st_map = {
                st: round(amt, 2)
                for st, amt in song_store_month_rev[s_key][m].items()
                if amt > 0
            }
            primary_st = max(st_map.items(), key=lambda x: x[1])[0] if st_map else "Streaming"

            monthly_history.append({
                "month": m,
                "earnings": m_val,
                "mom_pct": mom_pct,
                "month_share_pct": m_share_pct,
                "primary_dsp": primary_st,
                "stores": st_map
            })

        active_items = [h for h in monthly_history if h["earnings"] > 0]
        n_active = len(active_items)
        latest_item = active_items[-1] if active_items else (monthly_history[-1] if monthly_history else None)
        prev_item = active_items[-2] if len(active_items) >= 2 else None
        
        latest_rev = latest_item["earnings"] if latest_item else 0.0
        prev_rev = prev_item["earnings"] if prev_item else None
        mom_change = latest_item.get("mom_pct") if (latest_item and prev_rev is not None) else None
        
        peak_item = max(monthly_history, key=lambda x: x["earnings"]) if monthly_history else None
        peak_month = peak_item["month"] if peak_item else (usable_months[0] if usable_months else "")
        peak_rev = peak_item["earnings"] if peak_item else 0.0
        
        dsp_summary = {st: round(amt, 2) for st, amt in song_store_rev[s_key].items() if amt > 0}
        dsp_shares = {st: round((amt / s_total * 100), 1) for st, amt in dsp_summary.items()} if s_total > 0 else {}

        # Extract sequence across all usable months for log-linear decay regression
        vals = [m_rev_map.get(m, 0.0) for m in usable_months]
        nz = [k for k, v in enumerate(vals) if v > 0]
        
        g_i = 0.0
        severity_i = 0.0
        n_obs = len(nz)
        
        if nz:
            seg = vals[nz[0] : nz[-1] + 1]
            pts = [(k, v) for k, v in enumerate(seg) if v > 0]
            if len(pts) >= 3:
                xs = [k for k, _ in pts]
                ys = [math.log(v) for _, v in pts]
                n_obs = len(pts)
                xbar = sum(xs) / n_obs
                ybar = sum(ys) / n_obs
                num = sum((xs[k] - xbar) * (ys[k] - ybar) for k in range(n_obs))
                den = sum((xs[k] - xbar) ** 2 for k in range(n_obs))
                slope = num / den if den > 0 else 0.0
                g_i = math.exp(slope) - 1.0
                severity_i = clamp01(-g_i / d_ref)
                
                if share_i >= min_share:
                    weighted_severity_sum += share_i * severity_i
                    covered_rev_sum += share_i

        per_song_records.append({
            "identifier": s_key,
            "title": song_names.get(s_key, s_key),
            "artwork": song_artworks.get(s_key, ""),
            "share": round(share_i, 4),
            "share_pct": round(share_i * 100, 2),
            "total_revenue": round(s_total, 2),
            "verified_months_count": n_active,
            "latest_month": latest_item["month"] if latest_item else "",
            "latest_month_rev": latest_rev,
            "previous_month": prev_item["month"] if prev_item else None,
            "previous_month_rev": prev_rev,
            "mom_change_pct": mom_change,
            "peak_month": peak_month,
            "peak_monthly_rev": peak_rev,
            "monthly_growth_rate": round(g_i, 4),
            "severity": round(severity_i, 4),
            "months_observed": n_obs,
            "monthly_history": monthly_history,
            "dsp_breakdown": dsp_summary,
            "dsp_shares": dsp_shares
        })

    # Sort songs by actual observed historical revenue descending
    per_song_records.sort(key=lambda x: x["total_revenue"], reverse=True)

    d_decay = w_decay * weighted_severity_sum
    decay_coverage = covered_rev_sum
    return d_decay, decay_coverage, per_song_records


def compute_early_recoupment_multiplier(
    post_recoup_share: float,
    risk_discount: float,
    rho_t: float,
    config: Dict[str, Any]
) -> Tuple[float, List[str]]:
    """
    Early-recoupment multiplier E(e) (Engine V3 Section 3.2):
    E(e) = min( E_MAX, ( rho(T) + (1-e)/(1-d) ) / ( rho(T) + (1-e) ) )
    where d = risk_discount(T).
    """
    flags: List[str] = []
    e = clamp01(post_recoup_share)
    e_max = config.get("E_MAX", 1.30)
    d = clamp01(risk_discount)

    if e >= 1.0 or d <= 0.0:
        return 1.0, flags

    denom = rho_t + (1.0 - e)
    if denom <= 0:
        return 1.0, flags

    one_minus_d = max(0.001, 1.0 - d)
    numerator = rho_t + (1.0 - e) / one_minus_d
    raw_e = numerator / denom

    if raw_e >= e_max:
        flags.append("E_CAPPED")
        return e_max, flags

    return raw_e, flags


def compute_catalog_advance(
    usable_rows: List[Dict[str, Any]],
    usable_months: List[str],
    monthly_totals: Dict[str, float],
    term: int = 5,
    post_recoup_share: float = 0.90,
    rho: float = 0.50,
    r_win: int = 3,
    config: Optional[Dict[str, Any]] = None
) -> CatalogValuationResult:
    """
    Execute full Catalogue Pricing (Advance Engine V3).
    - No pay_through factor (Change A)
    - K_base(T) = rho * 12 * T (Change B)
    - Fit song decay over active life & report coverage (Change C)
    - Compute expected margins & return (Change D)
    """
    cfg = config or DEFAULT_CONFIG
    flags: List[str] = []

    # Snap term to valid set {1, 2, 3, 5}
    valid_terms = [1, 2, 3, 5]
    if term not in valid_terms:
        term_snapped = min(valid_terms, key=lambda x: abs(x - term))
        flags.append("TERM_SNAPPED")
        term = term_snapped

    # Validate rho
    rho_t = float(rho)

    # 1. R0 Calculation
    r0, r0_last, r0_window = compute_r0(monthly_totals, usable_months, r_win=r_win)
    if r0 > 0 and abs(r0_last - r0) / r0 > 0.25:
        flags.append("ANCHOR_DIVERGENCE")

    # 2. Risk Indicators
    song_totals_map = defaultdict(float)
    for r in usable_rows:
        key = r.get("isrc") or r.get("title") or "Unknown"
        song_totals_map[key] += max(0.0, r["earnings_usd"])

    song_totals_list = list(song_totals_map.values())
    gini_raw, gini_star, top1, top5, d_conc, conc_flags = compute_concentration_gini(song_totals_list, cfg)
    flags.extend(conc_flags)

    d_decay, decay_cov, per_song_decay = compute_share_weighted_decay(usable_rows, usable_months, cfg)
    if decay_cov < 0.60:
        flags.append("LOW_DECAY_COVERAGE")

    # 2b. Dollar-Weighted Catalogue Age (Age_$) Computation
    total_dollar_age_months = 0.0
    latest_canonical_month = usable_months[-1] if usable_months else "2026-03"
    try:
        curr_y, curr_m = int(latest_canonical_month[:4]), int(latest_canonical_month[5:7])
    except Exception:
        curr_y, curr_m = 2026, 3

    for s in per_song_decay:
        s_share = s.get("share", 0.0)
        hist = s.get("monthly_history", [])
        active_m = [h["month"] for h in hist if h.get("earnings", 0) > 0]
        earliest_m = active_m[0] if active_m else (usable_months[0] if usable_months else "2023-01")
        
        try:
            ey, em = int(earliest_m[:4]), int(earliest_m[5:7])
            # Historical months observed + 18 months baseline seasoning
            age_mos = max(1, (curr_y - ey) * 12 + (curr_m - em) + 18)
        except Exception:
            age_mos = 45.0  # default ~3.75 years

        total_dollar_age_months += s_share * age_mos

    dollar_age_years = round(total_dollar_age_months / 12.0, 2) if total_dollar_age_months > 0 else 3.80
    dollar_age_months = round(total_dollar_age_months, 1)

    # d_age haircut: benchmark is 48 months (4.0 years).
    w_age = cfg.get("W_AGE", 0.15)
    if dollar_age_years >= 4.0:
        d_age = 0.0
    else:
        d_age = round(w_age * max(0.0, (4.0 - dollar_age_years) / 4.0), 4)

    # Sum available risk indicators
    available_risk_sum = d_conc + d_decay + (d_age or 0.0)
    term_sens_map = cfg.get("TERM_SENS", {1: 0.70, 2: 0.85, 3: 1.00, 5: 1.20})
    term_sens = term_sens_map.get(term, 1.0)
    
    risk_discount = min(cfg.get("RISK_MAX", 0.55), available_risk_sum * term_sens)

    # 3. Dynamic K_base(T) formula (Change B): K_base = rho * 12 * T
    k_base = rho_t * 12.0 * term
    k_t = k_base * (1.0 - risk_discount)

    # 4. Early recoupment multiplier E(e) (Change B: uses passed rho_t)
    e_multiplier, e_flags = compute_early_recoupment_multiplier(post_recoup_share, risk_discount, rho_t, cfg)
    flags.extend(e_flags)

    # 5. Catalogue Advance (Change A: no (1 - p) factor)
    a_catalog = r0 * k_t * e_multiplier
    a_last_sensitivity = r0_last * k_t * e_multiplier

    # 6. Recoupment Timing & Margins (Change D)
    # m* = 12T * (1 - risk_discount) * E(e)
    months_to_recoup = 12.0 * term * (1.0 - risk_discount) * e_multiplier
    ttr_years = months_to_recoup / 12.0

    if months_to_recoup > (12.0 * term):
        flags.append("RECOUP_OUTSIDE_TERM")

    m_star_capped = min(months_to_recoup, 12.0 * term)
    margin_recoup = r0 * m_star_capped * (1.0 - rho_t)
    margin_tail = r0 * (12.0 * term - m_star_capped) * (1.0 - post_recoup_share)
    expected_gross = margin_recoup + margin_tail
    expected_return = (expected_gross / a_catalog) if a_catalog > 0 else 0.0

    # Unconditional margin disclosure flag (Section 4.2)
    flags.append("MARGIN_IS_UPPER_BOUND")

    return CatalogValuationResult(
        r0=r0,
        r0_last=r0_last,
        r0_window_months=r0_window,
        gini_raw=gini_raw,
        gini_star=gini_star,
        song_count=len(song_totals_list),
        top_1_share=top1,
        top_5_share=top5,
        d_conc=d_conc,
        d_decay=d_decay,
        decay_coverage=decay_cov,
        per_song_decay=per_song_decay,
        d_age=d_age,
        d_stream=None,
        dollar_age_years=dollar_age_years,
        dollar_age_months=dollar_age_months,
        risk_discount=risk_discount,
        k_base=k_base,
        k_t=k_t,
        a_catalog=a_catalog,
        a_last_sensitivity=a_last_sensitivity,
        ttr_years=ttr_years,
        months_to_recoup=months_to_recoup,
        rho_t=rho_t,
        e_multiplier=e_multiplier,
        term=term,
        post_recoup_share=post_recoup_share,
        margin_recoup=margin_recoup,
        margin_tail=margin_tail,
        expected_gross=expected_gross,
        expected_return=expected_return,
        flags=flags
    )

