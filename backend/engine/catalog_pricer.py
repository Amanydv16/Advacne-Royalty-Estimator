"""
Catalog Pricing module for the Advance Royalty Engine.
Implements Steps 4, 5, and 6 of the build order from the Advance Engine Implementation Plan.
- Step 4: Current monthly revenue R0 (trailing median) and R0_last sensitivity
- Step 5: Risk indicators (Concentration Gini G*, Share-weighted decay, dollar age, streaming state)
- Step 6: Catalogue advance A_catalog, K(T), E(e), and Option A vs Option B computation
"""
from typing import List, Dict, Any, Tuple, Optional
from collections import defaultdict
import math
from .config import DEFAULT_CONFIG, clamp, clamp01, median


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
        risk_discount: float,
        k_base: float,
        k_t: float,
        a_catalog: float,
        a_last_sensitivity: float,
        ttr_years: float,
        rho_t: float,
        e_multiplier: float,
        term: int,
        pay_through: float,
        post_recoup_share: float,
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
        self.risk_discount = risk_discount
        self.k_base = k_base
        self.k_t = k_t
        self.a_catalog = a_catalog
        self.a_last_sensitivity = a_last_sensitivity
        self.ttr_years = ttr_years
        self.rho_t = rho_t
        self.e_multiplier = e_multiplier
        self.term = term
        self.pay_through = pay_through
        self.post_recoup_share = post_recoup_share
        self.flags = flags


def compute_r0(
    monthly_totals: Dict[str, float],
    usable_months: List[str],
    r_win: int = 3
) -> Tuple[float, float, List[str]]:
    """
    Step 4: R0 = median(revenue of the last R_WIN usable months).
    Also returns R0_last = revenue of the last single month.
    """
    if not usable_months:
        return 0.0, 0.0, []
    
    r_win_actual = min(r_win, len(usable_months))
    window_months = usable_months[-r_win_actual:]
    window_values = [monthly_totals[m] for m in window_months]
    
    r0 = median(window_values)
    r0_last = monthly_totals[usable_months[-1]]
    return r0, r0_last, window_months


def compute_concentration_gini(
    song_totals: List[float],
    config: Dict[str, Any]
) -> Tuple[Optional[float], Optional[float], float, float, float, List[str]]:
    """
    Step 5(a): Concentration.
    G = ( 2 * SUM((i+1)*v[i]) ) / (n * S) - (n+1)/n
    G* = (n / (n-1)) * G
    d_conc = W_CONC * clamp01( (G* - C_STAR) / (1 - C_STAR) )
    """
    flags: List[str] = []
    w_conc = config.get("W_CONC", 0.20)
    c_star = config.get("C_STAR", 0.55)
    
    # Filter positive revenues only and sort ascending
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
    Step 5(b): Share-weighted song decay.
    Fits log-linear slope on monthly earnings per song.
    g_i = exp(slope) - 1
    severity_i = clamp01(-g_i / D_REF)
    d_decay = W_DECAY * SUM(share_i * severity_i)
    """
    w_decay = config.get("W_DECAY", 0.25)
    d_ref = config.get("D_REF", 0.10)
    min_share = config.get("MIN_SHARE", 0.005)
    
    # Group revenue by song (isrc or title) and month
    song_month_rev = defaultdict(lambda: defaultdict(float))
    song_names = {}
    total_cat_rev = 0.0

    for r in usable_rows:
        key = r.get("isrc") or r.get("title") or "Unknown"
        m = r["sale_month"]
        rev = max(0.0, r["earnings_usd"])
        song_month_rev[key][m] += rev
        song_names[key] = r.get("title") or key
        total_cat_rev += rev

    if total_cat_rev <= 0:
        return 0.0, 0.0, []

    per_song_records: List[Dict[str, Any]] = []
    weighted_severity_sum = 0.0
    covered_rev_sum = 0.0

    for s_key, m_rev_map in song_month_rev.items():
        s_total = sum(m_rev_map.values())
        share_i = s_total / total_cat_rev
        if share_i < min_share:
            continue

        # Extract sequence across usable months, skipping interior zero months
        vals = [m_rev_map[m] for m in usable_months if m_rev_map.get(m, 0.0) > 0]
        if len(vals) < 3:
            continue

        # Fit log-linear trend: ys = ln(vals), xs = 0, 1, 2, ...
        n_obs = len(vals)
        xs = list(range(n_obs))
        ys = [math.log(v) for v in vals]
        
        xbar = sum(xs) / n_obs
        ybar = sum(ys) / n_obs
        
        num = sum((xs[k] - xbar) * (ys[k] - ybar) for k in range(n_obs))
        den = sum((xs[k] - xbar) ** 2 for k in range(n_obs))
        
        slope = num / den if den > 0 else 0.0
        g_i = math.exp(slope) - 1.0  # Monthly growth rate
        severity_i = clamp01(-g_i / d_ref)
        
        weighted_severity_sum += share_i * severity_i
        covered_rev_sum += share_i

        per_song_records.append({
            "identifier": s_key,
            "title": song_names.get(s_key, s_key),
            "share": round(share_i, 4),
            "monthly_growth_rate": round(g_i, 4),
            "severity": round(severity_i, 4),
            "months_observed": n_obs
        })

    d_decay = w_decay * weighted_severity_sum
    return d_decay, covered_rev_sum, per_song_records


def compute_early_recoupment_multiplier(
    post_recoup_share: float,
    risk_discount: float,
    rho_t: float,
    config: Dict[str, Any]
) -> Tuple[float, List[str]]:
    """
    Early-recoupment multiplier E(e) (Section 3.4 of Advance Engine Specification):
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
    term: int = 3,
    pay_through: float = 0.0,
    post_recoup_share: float = 1.0,
    r_win: int = 3,
    config: Optional[Dict[str, Any]] = None,
    custom_rho: Optional[float] = None
) -> CatalogValuationResult:
    """
    Execute full Catalogue Pricing (Phase C, Steps 4, 5, 6).
    """
    cfg = config or DEFAULT_CONFIG
    flags: List[str] = []

    # Snap term to valid set {1, 2, 3, 5}
    valid_terms = [1, 2, 3, 5]
    if term not in valid_terms:
        term_snapped = min(valid_terms, key=lambda x: abs(x - term))
        flags.append("TERM_SNAPPED")
        term = term_snapped

    # 1. R0 Calculation
    r0, r0_last, r0_window = compute_r0(monthly_totals, usable_months, r_win=r_win)
    if r0 > 0 and abs(r0_last - r0) / r0 > 0.25:
        flags.append("ANCHOR_DIVERGENCE")

    # 2. Risk Indicators
    # Per-song totals across usable months
    song_totals_map = defaultdict(float)
    for r in usable_rows:
        key = r.get("isrc") or r.get("title") or "Unknown"
        song_totals_map[key] += max(0.0, r["earnings_usd"])

    song_totals_list = list(song_totals_map.values())
    gini_raw, gini_star, top1, top5, d_conc, conc_flags = compute_concentration_gini(song_totals_list, cfg)
    flags.extend(conc_flags)

    d_decay, decay_cov, per_song_decay = compute_share_weighted_decay(usable_rows, usable_months, cfg)

    # Dollar age & streaming state (not available in this phase)
    d_age = None
    flags.append("NO_RELEASE_DATES")
    d_stream = None
    flags.append("NO_STREAMING_DATA")

    # Sum available risk indicators
    available_risk_sum = d_conc + d_decay
    term_sens_map = cfg.get("TERM_SENS", {1: 0.70, 2: 0.85, 3: 1.00, 5: 1.20})
    term_sens = term_sens_map.get(term, 1.0)
    
    risk_discount = min(cfg.get("RISK_MAX", 0.55), available_risk_sum * term_sens)

    # Custom or Table-based Recoupment Split (rho)
    if custom_rho is not None and isinstance(custom_rho, (int, float)) and 0.0 < custom_rho <= 1.0:
        rho_t = float(custom_rho)
        k_base = rho_t * 12.0 * term
    else:
        k_table = cfg.get("K_TABLE", {1: 10.797, 2: 20.816, 3: 29.211, 5: 36.028})
        k_base = k_table.get(term, 29.211)
        rho_t = k_base / (12.0 * term)

    # K(T) = K_base(T) * (1 - risk_discount)
    k_t = k_base * (1.0 - risk_discount)

    # Early recoupment multiplier E(e)
    e_multiplier, e_flags = compute_early_recoupment_multiplier(post_recoup_share, risk_discount, rho_t, cfg)
    flags.extend(e_flags)

    # Advances
    p = clamp(pay_through, 0.0, 0.50)
    pay_factor = (1.0 - p)

    a_catalog = r0 * k_t * pay_factor * e_multiplier
    a_last_sensitivity = r0_last * k_t * pay_factor * e_multiplier

    # Time to Recoup (TTR) = T * (1 - p) * E(e)
    ttr_years = term * pay_factor * e_multiplier

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
        d_stream=d_stream,
        risk_discount=risk_discount,
        k_base=k_base,
        k_t=k_t,
        a_catalog=a_catalog,
        a_last_sensitivity=a_last_sensitivity,
        ttr_years=ttr_years,
        rho_t=rho_t,
        e_multiplier=e_multiplier,
        term=term,
        pay_through=p,
        post_recoup_share=post_recoup_share,
        flags=flags
    )
