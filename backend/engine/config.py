"""
Configuration dictionary and mathematical constants for the Advance Royalty Engine.
As defined in Section 6 & 9 of the Advance Engine Implementation Plan.
Twenty-three constants are finance-owned settings loaded at startup and echoed in every output.
"""
from typing import Dict, Any, List, Optional
import math


DEFAULT_CONFIG: Dict[str, Any] = {
    # Catalog risk indicators
    "W_CONC": 0.20,         # Maximum discount from revenue concentration
    "C_STAR": 0.55,         # Concentration Gini below which nothing is charged
    "W_DECAY": 0.25,        # Maximum discount from catalogue decay
    "D_REF": 0.10,          # Per-song monthly decline that saturates severity
    "MIN_SHARE": 0.005,     # Per-song revenue share below which a song is ignored
    "W_AGE": 0.10,          # Maximum discount for a young catalogue
    "AGE_FLOOR": 12,        # At or below this dollar age (months), full W_AGE is charged
    "AGE_SAFE": 48,         # At or above this dollar age (months), age costs nothing
    "W_STREAM": 0.10,       # Maximum discount from a shrinking fanbase
    "G_FAN_REF": 0.10,      # Monthly fan decline that saturates that discount
    
    # Term sensitivity scaling
    "TERM_SENS": {
        1: 0.70,
        2: 0.85,
        3: 1.00,
        5: 1.20
    },
    
    # New-release parameters
    "ADV_FRAC": 0.50,       # Share of forecast new-release revenue advanced
    "W_AUD": 0.25,          # Maximum swing from audience signals
    "RR_CONV": 0.066,       # Followers to first-month streams
    "G_REF": 0.10,          # Monthly follower growth that saturates audience score
    "TT_REF": 1000,         # TikTok creations per song that saturates audience score
    "SOCIAL_MAX": 0.50,     # Revenue share above which a release is social-audio
    "MIN_M0_FRAC": 0.02,    # Minimum release size as a share of R0
    "MIN_OBS": 3,           # Months of history a release needs to be usable
    
    # Ingestion & Windowing
    "PHI_PARTIAL": 0.25,    # Threshold for calling a trailing month partial
    "R_WIN": 3,             # Months in the R0 median window (1 for beatBread-strict, 3 for production)
    "M_MIN": 1,             # Minimum usable months before pricing (flag SHORT_HISTORY if < 6)
    
    # Guardrails (not dials - stops absurd outputs)
    "RISK_MAX": 0.55,       # Guard: cap on total risk discount
    "R_TAIL_MAX": 0.90,     # Guard: tail ratio above which extrapolation is refused
    "E_MAX": 1.30,          # Guard: cap on early-recoupment uplift
    
    # Pre-recoupment split settings (Advance Engine V3)
    "RHO_CHOICES": (0.40, 0.45, 0.50, 0.55, 0.60),
    "RHO_DEFAULT": 0.50,
    "EARLY_RECOUP_C": 0.296880,
    "EARLY_RECOUP_K": 2.879956,
    
    # Option B specific parameters
    "T_B": 12,              # Breakpoint in months for near-term decline
    "D2": 0.025,            # Terminal monthly decay (2.5%)
    "D1_MAX": 0.50,         # Ceiling on fitted d1
    "M_FIT_MIN": 8,         # Minimum months required to fit d1
    
    # Offer band
    "OFFER_BAND_W": 0.07    # 7% width (reproduces 93% low band)
}


def clamp(x: float, lo: float, hi: float) -> float:
    """Clamp a value between lo and hi."""
    return min(hi, max(lo, x))


def clamp01(x: float) -> float:
    """Clamp a value between 0.0 and 1.0."""
    return clamp(x, 0.0, 1.0)


def median(values: List[float]) -> float:
    """Calculate the median of a list of numbers."""
    if not values:
        raise ValueError("Cannot calculate median of empty list")
    s = sorted(values)
    n = len(s)
    mid = n // 2
    if n % 2 == 1:
        return float(s[mid])
    else:
        return float((s[mid - 1] + s[mid]) / 2.0)
