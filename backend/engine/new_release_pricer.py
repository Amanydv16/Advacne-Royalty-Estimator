"""
New-Release Pricing module for the Advance Royalty Engine.
Implements Phase D (Steps 7, 8, 9, and 10) of the Advance Engine Implementation Plan.
- Step 7: Find observable releases (filter left-censored songs)
- Step 8: Classify and filter releases (DERIVATIVE, SOCIAL_AUDIO, ORIGINAL)
- Step 9: Measure empirical decay curve, peak anchoring, tail ratio r_tail, and lifetime multiple L
- Step 10: New-release advance A_new, advance per single a_single, and empirical envelope [range_lo, range_hi]
"""
from typing import List, Dict, Any, Tuple, Optional
from collections import defaultdict
import re
import math
from .config import DEFAULT_CONFIG, clamp, clamp01, median


class NewReleaseValuationResult:
    def __init__(
        self,
        n_contracted: int,
        is_computed: bool,
        is_available: bool,
        a_new: Optional[float],
        a_single: Optional[float],
        range_lo: Optional[float],
        range_hi: Optional[float],
        m0_hat: Optional[float],
        m0_median: Optional[float],
        m0_min: Optional[float],
        m0_max: Optional[float],
        lifetime_multiple_l: Optional[float],
        r_tail: Optional[float],
        decay_shape: List[float],
        observable_releases_count: int,
        usable_releases_count: int,
        usable_releases_summary: List[Dict[str, Any]],
        flags: List[str]
    ):
        self.n_contracted = n_contracted
        self.is_computed = is_computed
        self.is_available = is_available
        self.a_new = a_new
        self.a_single = a_single
        self.range_lo = range_lo
        self.range_hi = range_hi
        self.m0_hat = m0_hat
        self.m0_median = m0_median
        self.m0_min = m0_min
        self.m0_max = m0_max
        self.lifetime_multiple_l = lifetime_multiple_l
        self.r_tail = r_tail
        self.decay_shape = decay_shape
        self.observable_releases_count = observable_releases_count
        self.usable_releases_count = usable_releases_count
        self.usable_releases_summary = usable_releases_summary
        self.flags = flags


def is_derivative_title(title: str) -> bool:
    """Check if title matches derivative pattern ([...], remix, speed up, slowed, reverb)."""
    t_low = title.lower()
    if "[" in title or "]" in title:
        return True
    patterns = [r"\bremix\b", r"\bspeed\s*up\b", r"\bsped\s*up\b", r"\bslowed\b", r"\breverb\b", r"\bacoustic\b", r"\binstrumental\b"]
    for p in patterns:
        if re.search(p, t_low):
            return True
    return False


def is_social_audio(store_rev_map: Dict[str, float], total_rev: float, social_max: float = 0.50) -> bool:
    """Check if social audio (Facebook, TikTok, Instagram, Snap) exceeds SOCIAL_MAX share."""
    if total_rev <= 0:
        return False
    social_stores = ["facebook", "meta", "tiktok", "instagram", "snap", "snapchat", "byte"]
    social_rev = sum(
        rev for s_name, rev in store_rev_map.items()
        if any(soc in s_name.lower() for soc in social_stores)
    )
    return (social_rev / total_rev) > social_max


def compute_new_release_advance(
    usable_rows: List[Dict[str, Any]],
    usable_months: List[str],
    r0: float,
    n_contracted: int = 0,
    term: int = 3,
    rho_t: float = 0.70,
    config: Optional[Dict[str, Any]] = None
) -> NewReleaseValuationResult:
    """
    Execute Phase D: New-Release Advance.
    """
    cfg = config or DEFAULT_CONFIG
    flags: List[str] = []

    # If N == 0, skip phase entirely (Section 2: returns not computed)
    if n_contracted <= 0:
        return NewReleaseValuationResult(
            n_contracted=0,
            is_computed=False,
            is_available=True,
            a_new=None,
            a_single=None,
            range_lo=None,
            range_hi=None,
            m0_hat=None,
            m0_median=None,
            m0_min=None,
            m0_max=None,
            lifetime_multiple_l=None,
            r_tail=None,
            decay_shape=[],
            observable_releases_count=0,
            usable_releases_count=0,
            usable_releases_summary=[],
            flags=[]
        )

    flags.append("FORECAST_NOT_MEASUREMENT")
    flags.append("DELIVERY_TIMING_ASSUMED")

    # -------------------------------------------------------------
    # Step 7: Find observable releases
    # -------------------------------------------------------------
    # Group song revenue per month and per store
    song_month_rev = defaultdict(lambda: defaultdict(float))
    song_store_rev = defaultdict(lambda: defaultdict(float))
    song_titles = {}

    for r in usable_rows:
        key = r.get("isrc") or r.get("title") or "Unknown"
        m = r["sale_month"]
        rev = max(0.0, r["earnings_usd"])
        song_month_rev[key][m] += rev
        song_store_rev[key][r.get("store", "Unknown")] += rev
        song_titles[key] = r.get("title") or key

    first_window_month = usable_months[0] if usable_months else ""
    observable_songs = []

    for s_key, m_map in song_month_rev.items():
        # Find active months
        active_m = [m for m in usable_months if m_map.get(m, 0.0) > 0.0]
        if not active_m:
            continue
        # Skip left-censored (first active month == first month of dataset)
        if active_m[0] == first_window_month:
            continue
        
        # Sequence from first active month onward
        first_idx = usable_months.index(active_m[0])
        seq = [m_map.get(m, 0.0) for m in usable_months[first_idx:]]
        observable_songs.append((s_key, song_titles[s_key], seq, song_store_rev[s_key]))

    if not observable_songs:
        flags.append("NO_OBSERVABLE_RELEASES")
        flags.append("NO_DECAY_SHAPE")
        return NewReleaseValuationResult(
            n_contracted=n_contracted,
            is_computed=True,
            is_available=False,
            a_new=None,
            a_single=None,
            range_lo=None,
            range_hi=None,
            m0_hat=None,
            m0_median=None,
            m0_min=None,
            m0_max=None,
            lifetime_multiple_l=None,
            r_tail=None,
            decay_shape=[],
            observable_releases_count=0,
            usable_releases_count=0,
            usable_releases_summary=[],
            flags=flags
        )

    # -------------------------------------------------------------
    # Step 8: Classify and filter releases
    # -------------------------------------------------------------
    social_max = cfg.get("SOCIAL_MAX", 0.50)
    min_m0_frac = cfg.get("MIN_M0_FRAC", 0.02)
    min_obs = cfg.get("MIN_OBS", 3)
    
    usable_releases = []
    
    for s_key, title, seq, store_map in observable_songs:
        total_rev = sum(seq)
        
        # Classification
        if is_derivative_title(title):
            classification = "DERIVATIVE"
        elif is_social_audio(store_map, total_rev, social_max=social_max):
            classification = "SOCIAL_AUDIO"
        else:
            classification = "ORIGINAL"

        # Peak anchoring (Step 9a)
        if not seq:
            continue
        pk_idx = seq.index(max(seq))
        peak_anchored_seq = seq[pk_idx:]
        m0_val = peak_anchored_seq[0] if peak_anchored_seq else 0.0
        n_obs = len(peak_anchored_seq)

        is_usable = (
            classification == "ORIGINAL" and
            m0_val >= (min_m0_frac * r0) and
            n_obs >= min_obs
        )

        if is_usable:
            usable_releases.append({
                "identifier": s_key,
                "title": title,
                "m0": m0_val,
                "seq": peak_anchored_seq,
                "n_obs": n_obs
            })

    if not usable_releases:
        flags.append("NO_DECAY_SHAPE")
        return NewReleaseValuationResult(
            n_contracted=n_contracted,
            is_computed=True,
            is_available=False,
            a_new=None,
            a_single=None,
            range_lo=None,
            range_hi=None,
            m0_hat=None,
            m0_median=None,
            m0_min=None,
            m0_max=None,
            lifetime_multiple_l=None,
            r_tail=None,
            decay_shape=[],
            observable_releases_count=len(observable_songs),
            usable_releases_count=0,
            usable_releases_summary=[],
            flags=flags
        )

    if len(usable_releases) < 8:
        flags.append("THIN_RELEASE_SAMPLE")

    if any(rel["n_obs"] < 5 for rel in usable_releases):
        flags.append("SHORT_RELEASE_CURVES")

    # -------------------------------------------------------------
    # Step 9: Measure the decay curve
    # -------------------------------------------------------------
    # (b) Normalized shape
    max_k = max(rel["n_obs"] for rel in usable_releases)
    shape_curve = []
    
    for k in range(max_k):
        vals_at_k = []
        for rel in usable_releases:
            if k < len(rel["seq"]):
                norm_val = rel["seq"][k] / rel["m0"]
                if norm_val > 0:
                    vals_at_k.append(norm_val)
        if not vals_at_k:
            break
        shape_curve.append(median(vals_at_k))

    # (c) Tail ratio
    ratios = []
    for rel in usable_releases:
        s = rel["seq"]
        for k in range(len(s) - 1):
            if s[k] > 0 and s[k + 1] > 0:
                ratios.append(s[k + 1] / s[k])

    r_tail = median(ratios) if len(ratios) >= 2 else None

    # (d) Lifetime multiple L
    horizon_months = 12 * term
    observed_sum = sum(shape_curve[:min(horizon_months, len(shape_curve))])
    
    r_tail_max = cfg.get("R_TAIL_MAX", 0.90)
    
    if r_tail is None or not (0.0 < r_tail < 1.0):
        lifetime_l = observed_sum
        flags.append("NO_TAIL_EXTRAPOLATION")
    elif r_tail >= r_tail_max:
        lifetime_l = observed_sum
        flags.append("FLAT_TAIL_NOT_EXTRAPOLATED")
    else:
        lifetime_l = observed_sum
        last_val = shape_curve[-1] if shape_curve else 0.0
        k_idx = len(shape_curve)
        while k_idx < horizon_months:
            last_val = last_val * r_tail
            lifetime_l += last_val
            k_idx += 1

    # -------------------------------------------------------------
    # Step 10: New-release advance and range
    # -------------------------------------------------------------
    m0_values = sorted([rel["m0"] for rel in usable_releases])
    m0_med = median(m0_values)
    m0_min = min(m0_values)
    m0_max = max(m0_values)

    if m0_max > (3.0 * m0_min):
        flags.append("HIGH_RELEASE_DISPERSION")

    # Audience adjustment is 0 in this phase
    adj = 0.0
    flags.append("NO_AUDIENCE_DATA")

    m0_hat = m0_med * (1.0 + adj)
    adv_frac = cfg.get("ADV_FRAC", 0.50)

    a_single = m0_hat * lifetime_l * rho_t * adv_frac
    a_new = n_contracted * a_single

    # Empirical range
    if len(m0_values) >= 5:
        idx_10 = int(0.10 * (len(m0_values) - 1))
        idx_90 = int(0.90 * (len(m0_values) - 1))
        lo_m0 = m0_values[idx_10]
        hi_m0 = m0_values[idx_90]
    else:
        lo_m0 = m0_min
        hi_m0 = m0_max

    range_lo = a_new * (lo_m0 / m0_med) if m0_med > 0 else a_new
    range_hi = a_new * (hi_m0 / m0_med) if m0_med > 0 else a_new

    usable_summary = [
        {
            "identifier": rel["identifier"],
            "title": rel["title"],
            "m0": round(rel["m0"], 2),
            "months_observed": rel["n_obs"]
        }
        for rel in usable_releases
    ]

    return NewReleaseValuationResult(
        n_contracted=n_contracted,
        is_computed=True,
        is_available=True,
        a_new=a_new,
        a_single=a_single,
        range_lo=range_lo,
        range_hi=range_hi,
        m0_hat=m0_hat,
        m0_median=m0_med,
        m0_min=m0_min,
        m0_max=m0_max,
        lifetime_multiple_l=lifetime_l,
        r_tail=r_tail,
        decay_shape=[round(x, 4) for x in shape_curve],
        observable_releases_count=len(observable_songs),
        usable_releases_count=len(usable_releases),
        usable_releases_summary=usable_summary,
        flags=flags
    )
