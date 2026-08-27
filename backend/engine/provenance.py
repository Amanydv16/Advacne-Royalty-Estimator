"""
Flags and Provenance module for the Advance Royalty Engine.
Implements Step 12 of the Advance Engine Implementation Plan.
Defines plain-English descriptions for all 24+ system flags and formats the complete provenance block.
"""
from typing import List, Dict, Any, Optional
import json


FLAG_DESCRIPTIONS: Dict[str, Dict[str, str]] = {
    "PARAM_WEIGHTS_UNCALIBRATED": {
        "severity": "advisory",
        "title": "Uncalibrated Pricing Weights",
        "description": "The valuation weights are finance-defined policy settings and have not been fitted against realized deal outcomes."
    },
    "FORECAST_NOT_MEASUREMENT": {
        "severity": "advisory",
        "title": "New-Release Forecast Applied",
        "description": "The new-release advance component is a forward forecast of unreleased music, not a measurement of historical catalog revenue."
    },
    "DELIVERY_TIMING_ASSUMED": {
        "severity": "advisory",
        "title": "Immediate Delivery Assumed",
        "description": "New singles are assumed to be delivered in month 0 of the deal horizon, which provides the full term for recoupment."
    },
    "INSUFFICIENT_HISTORY": {
        "severity": "blocking",
        "title": "Insufficient Statement History",
        "description": "Fewer than 6 usable statement months were provided. Sizing an advance requires a minimum of 6 full months of history."
    },
    "SHORT_HISTORY": {
        "severity": "advisory",
        "title": "Limited Statement History (< 12 Months)",
        "description": "Between 6 and 11 statement months were provided. Historical diagnostics have lower statistical certainty."
    },
    "DECAY_UNSTABLE": {
        "severity": "advisory",
        "title": "Short Window for Decay Fitting",
        "description": "Fewer than 6 usable months available; decay curve fitting may exhibit high sensitivity to month-over-month noise."
    },
    "PARTIAL_MONTH_EXCLUDED": {
        "severity": "advisory",
        "title": "Partial Trailing Month Dropped",
        "description": "The most recent month fell below 25% of the prior 3-month median and was excluded as an incomplete reporting artifact."
    },
    "MISSING_FEED_DETECTED": {
        "severity": "advisory",
        "title": "Discontinued DSP Store Excluded",
        "description": "A digital store that reported positive revenue in earlier months reported zero in the latest month and was excluded across all months."
    },
    "MULTI_SOURCE_FEED": {
        "severity": "advisory",
        "title": "Multiple Distributor Feeds Resolved",
        "description": "Overlapping distributor statement feeds were detected. The engine selected the primary revenue feed and dropped redundant feeds."
    },
    "GROSS_BASIS_APPLIED": {
        "severity": "advisory",
        "title": "Distributor Fee Deducted (Gross Basis)",
        "description": "Gross statement revenue was provided and converted to net using the supplied distributor fee percentage."
    },
    "NO_RELEASE_DATES": {
        "severity": "advisory",
        "title": "Dollar Age Not Available",
        "description": "Per-track release dates were not provided in statements; dollar age indicator is omitted from risk discount."
    },
    "PARTIAL_RELEASE_DATES": {
        "severity": "advisory",
        "title": "Partial Release Dates",
        "description": "Release date metadata covers less than 80% of catalog revenue."
    },
    "NO_STREAMING_DATA": {
        "severity": "advisory",
        "title": "Audience Follower Stream Data Excluded",
        "description": "Live streaming growth signals are excluded from catalog sizing and will only be activated when Soundcharts is wired."
    },
    "CONCENTRATED_CATALOG": {
        "severity": "warning",
        "title": "High Catalog Concentration (Gini > 0.70)",
        "description": "Catalog revenue is heavily concentrated in a small number of top tracks (G* > 0.70)."
    },
    "THIN_CATALOG": {
        "severity": "warning",
        "title": "Thin Catalog (< 4 Tracks)",
        "description": "Catalog contains fewer than 4 distinct songs; Gini concentration index is statistically noisy."
    },
    "TERM_SNAPPED": {
        "severity": "advisory",
        "title": "Deal Term Snapped to Standard Horizon",
        "description": "Requested contract term was snapped to the nearest supported term (1, 2, 3, or 5 years)."
    },
    "E_CAPPED": {
        "severity": "advisory",
        "title": "Early-Recoupment Multiplier Capped",
        "description": "The early-recoupment uplift reached the maximum safety ceiling (E_MAX = 1.30)."
    },
    "NO_OBSERVABLE_RELEASES": {
        "severity": "warning",
        "title": "No Observable Releases Born in Window",
        "description": "No new tracks were released within the statement window, preventing empirical decay curve estimation."
    },
    "THIN_RELEASE_SAMPLE": {
        "severity": "advisory",
        "title": "Small Release Sample (< 8 Releases)",
        "description": "Fewer than 8 usable new releases were observed; empirical shape is derived from a limited sample."
    },
    "HIGH_RELEASE_DISPERSION": {
        "severity": "warning",
        "title": "High Release Volatility (> 3x Spread)",
        "description": "The largest track opening month exceeds 3x the smallest, indicating wide variance in release outcomes."
    },
    "SHORT_RELEASE_CURVES": {
        "severity": "advisory",
        "title": "Short Observation Curves (< 5 Months)",
        "description": "Some usable releases have fewer than 5 months of post-peak history."
    },
    "FLAT_TAIL_NOT_EXTRAPOLATED": {
        "severity": "advisory",
        "title": "Flat Tail Guard Triggered",
        "description": "Observed survival ratio r_tail exceeded 0.90; geometric extrapolation into perpetuity was safely capped."
    },
    "NO_TAIL_EXTRAPOLATION": {
        "severity": "advisory",
        "title": "Tail Extrapolation Unavailable",
        "description": "Insufficient post-peak sequential pairs were available to estimate a stable geometric survival ratio."
    },
    "NO_DECAY_SHAPE": {
        "severity": "blocking",
        "title": "No New-Release Decay Shape Available",
        "description": "Could not measure a valid empirical decay shape; new-release advance cannot be computed."
    },
    "NO_RPS": {
        "severity": "blocking",
        "title": "Missing Revenue Per Stream (RPS)",
        "description": "Fallback follower path requires a revenue-per-stream benchmark which was not supplied."
    },
    "NO_AUDIENCE_DATA": {
        "severity": "advisory",
        "title": "No Audience Bias Applied",
        "description": "Audience adjustment factor set to zero pending third-party analytics integration."
    },
    "SCHEDULE_INVALID": {
        "severity": "blocking",
        "title": "Invalid Payment Tranche Schedule",
        "description": "The payment schedule failed validation constraints (shares must sum to 100% and delivery milestones must be valid)."
    },
    "HIGH_AT_RISK_SHARE": {
        "severity": "warning",
        "title": "High Upfront At-Risk Cash (> 50%)",
        "description": "More than 50% of the new-release advance is scheduled to be paid prior to track delivery verification."
    },
    "SCHEDULE_NOT_DELIVERY_GATED": {
        "severity": "warning",
        "title": "No Delivery-Gated Tranches",
        "description": "None of the scheduled payment milestones are tied to track delivery."
    },
    "OUT_OF_SCOPE": {
        "severity": "blocking",
        "title": "Out of Sizing Scope",
        "description": "Requested rights scope or distributor change option is outside the empirical sound-recording sizing engine."
    },
    "ANCHOR_DIVERGENCE": {
        "severity": "warning",
        "title": "High Anchor Divergence (> 25%)",
        "description": "The trailing median R0 and single-month R0_last diverge by more than 25%."
    },
    "MARGIN_IS_UPPER_BOUND": {
        "severity": "advisory",
        "title": "Margin Assumes Flat Baseline (Upper Bound)",
        "description": "Expected return calculations assume catalog revenue holds flat at R0 throughout recoupment. Real decay lowers realized margin."
    },
    "RECOUP_OUTSIDE_TERM": {
        "severity": "warning",
        "title": "Recoupment Exceeds Contract Term",
        "description": "Expected recoupment duration m* exceeds the contracted term length (12T months); the balance cannot clear inside the deal."
    },
    "LOW_DECAY_COVERAGE": {
        "severity": "warning",
        "title": "Low Decay Measurement Coverage (< 60%)",
        "description": "The share of catalog revenue covered by measurable active song decay slopes is below 60%."
    },
    "INVALID_RHO": {
        "severity": "blocking",
        "title": "Invalid Recoupment Split",
        "description": "Pre-recoupment split must be one of the supported menu values (0.40, 0.45, 0.50, 0.55, 0.60)."
    }
}


def build_provenance_and_flags(
    catalog_res: Any,
    new_release_res: Optional[Any],
    schedule_res: Optional[Any],
    ingestion_res: Any,
    config: Dict[str, Any],
    artist_metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Constructs the full Provenance Block and compiles all unique active system flags (Engine V3).
    """
    all_flag_keys = ["PARAM_WEIGHTS_UNCALIBRATED"]
    all_flag_keys.extend(ingestion_res.flags)
    all_flag_keys.extend(catalog_res.flags)
    
    if new_release_res:
        all_flag_keys.extend(new_release_res.flags)
    if schedule_res:
        all_flag_keys.extend(schedule_res.flags)

    # Deduplicate while preserving order
    seen = set()
    unique_flag_keys = []
    for k in all_flag_keys:
        if k not in seen and k in FLAG_DESCRIPTIONS:
            seen.add(k)
            unique_flag_keys.append(k)

    detailed_flags = [
        {
            "code": k,
            "severity": FLAG_DESCRIPTIONS[k]["severity"],
            "title": FLAG_DESCRIPTIONS[k]["title"],
            "description": FLAG_DESCRIPTIONS[k]["description"]
        }
        for k in unique_flag_keys
    ]

    a_catalog = catalog_res.a_catalog
    a_new = new_release_res.a_new if (new_release_res and new_release_res.is_available) else 0.0
    a_total = a_catalog + (a_new or 0.0)

    provenance = {
        "artist": artist_metadata or {"name": "Unknown Artist", "spotify_id": None},
        "ingestion": {
            "source_feeds_found": ingestion_res.source_feeds_found,
            "kept_feed": ingestion_res.kept_feed,
            "usable_months_count": len(ingestion_res.usable_months),
            "usable_months": ingestion_res.usable_months,
            "dropped_months": ingestion_res.dropped_months,
            "excluded_stores": ingestion_res.excluded_stores
        },
        "catalog_valuation": {
            "r0_trailing_median": round(catalog_res.r0, 2),
            "r0_last_single_month": round(catalog_res.r0_last, 2),
            "r0_window_months": catalog_res.r0_window_months,
            "term_years": catalog_res.term,
            "rho": round(catalog_res.rho_t, 4),
            "post_recoup_share_e": round(catalog_res.post_recoup_share, 4),
            "k_base_t": round(catalog_res.k_base, 3),
            "k_t_active": round(catalog_res.k_t, 3),
            "early_recoup_multiplier_e": round(catalog_res.e_multiplier, 4),
            "months_to_recoup": round(catalog_res.months_to_recoup, 2),
            "ttr_years": round(catalog_res.ttr_years, 3),
            "gini_raw": round(catalog_res.gini_raw, 4) if catalog_res.gini_raw is not None else None,
            "gini_star": round(catalog_res.gini_star, 4) if catalog_res.gini_star is not None else None,
            "top_1_song_share": round(catalog_res.top_1_share, 4),
            "top_5_song_share": round(catalog_res.top_5_share, 4),
            "d_conc": round(catalog_res.d_conc, 4),
            "d_decay": round(catalog_res.d_decay, 4),
            "decay_coverage": round(catalog_res.decay_coverage, 4),
            "risk_discount": round(catalog_res.risk_discount, 4),
            "a_last_sensitivity": round(catalog_res.a_last_sensitivity, 2),
            "a_catalog_final": round(a_catalog, 2)
        },
        "expected_margin": {
            "margin_recoup": round(catalog_res.margin_recoup, 2),
            "margin_tail": round(catalog_res.margin_tail, 2),
            "expected_gross": round(catalog_res.expected_gross, 2),
            "expected_return": round(catalog_res.expected_return, 4),
            "expected_return_pct": round(catalog_res.expected_return * 100, 1),
            "months_to_recoup": round(catalog_res.months_to_recoup, 1)
        },
        "new_release_valuation": {
            "n_contracted": new_release_res.n_contracted if new_release_res else 0,
            "is_computed": new_release_res.is_computed if new_release_res else False,
            "is_available": new_release_res.is_available if new_release_res else False,
            "observable_releases_count": new_release_res.observable_releases_count if new_release_res else 0,
            "usable_releases_count": new_release_res.usable_releases_count if new_release_res else 0,
            "m0_median": round(new_release_res.m0_median, 2) if (new_release_res and new_release_res.m0_median) else None,
            "m0_hat": round(new_release_res.m0_hat, 2) if (new_release_res and new_release_res.m0_hat) else None,
            "lifetime_multiple_l": round(new_release_res.lifetime_multiple_l, 3) if (new_release_res and new_release_res.lifetime_multiple_l) else None,
            "r_tail": round(new_release_res.r_tail, 4) if (new_release_res and new_release_res.r_tail) else None,
            "a_single": round(new_release_res.a_single, 2) if (new_release_res and new_release_res.a_single) else None,
            "a_new_final": round(new_release_res.a_new, 2) if (new_release_res and new_release_res.a_new) else None,
            "range_lo": round(new_release_res.range_lo, 2) if (new_release_res and new_release_res.range_lo) else None,
            "range_hi": round(new_release_res.range_hi, 2) if (new_release_res and new_release_res.range_hi) else None
        } if new_release_res else None,
        "payment_schedule": {
            "tranches": schedule_res.tranches if schedule_res else [],
            "at_risk_share": schedule_res.at_risk_share if schedule_res else 0.0,
            "at_risk_amount": schedule_res.at_risk_amount if schedule_res else 0.0
        } if schedule_res else None,
        "summary": {
            "a_catalog": round(a_catalog, 2),
            "a_new": round(a_new, 2) if (new_release_res and new_release_res.is_available and a_new is not None) else "not computed",
            "a_total": round(a_total, 2)
        },
        "flags": unique_flag_keys,
        "detailed_flags": detailed_flags,
        "configuration_snapshot": config
    }

    return provenance
