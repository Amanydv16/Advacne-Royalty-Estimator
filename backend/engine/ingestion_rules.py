"""
Ingestion Rules module for the Advance Royalty Engine.
Implements Step 3 of the build order from the Advance Engine Implementation Plan:
(a) Multi-source distributor feed deduplication
(b) Partial trailing month exclusion
(c) Missing feed exclusion
(d) Usable history gating (INSUFFICIENT_HISTORY, SHORT_HISTORY)
"""
from typing import List, Dict, Any, Tuple, Set, Optional
from collections import defaultdict
import re
from .config import DEFAULT_CONFIG, median


class IngestionResult:
    def __init__(
        self,
        usable_rows: List[Dict[str, Any]],
        monthly_totals: Dict[str, float],
        usable_months: List[str],
        dropped_months: List[str],
        excluded_stores: List[str],
        source_feeds_found: List[str],
        kept_feed: Optional[str],
        flags: List[str],
        is_priceable: bool,
        rejection_reason: Optional[str] = None
    ):
        self.usable_rows = usable_rows
        self.monthly_totals = monthly_totals
        self.usable_months = usable_months
        self.dropped_months = dropped_months
        self.excluded_stores = excluded_stores
        self.source_feeds_found = source_feeds_found
        self.kept_feed = kept_feed
        self.flags = flags
        self.is_priceable = is_priceable
        self.rejection_reason = rejection_reason


def apply_ingestion_rules(
    raw_rows: List[Dict[str, Any]],
    config: Optional[Dict[str, Any]] = None
) -> IngestionResult:
    """
    Applies the four ingestion rules in strict dependency order:
    1. Multi-source distributor resolution (Rule 3a)
    2. Missing feeds exclusion (Rule 3c)
    3. Partial trailing months exclusion (Rule 3b)
    4. Statement window history gate (M_MIN = 6)
    """
    cfg = config or DEFAULT_CONFIG
    flags: List[str] = []
    
    if not raw_rows:
        flags.append("INSUFFICIENT_HISTORY")
        return IngestionResult(
            usable_rows=[], monthly_totals={}, usable_months=[], dropped_months=[],
            excluded_stores=[], source_feeds_found=[], kept_feed=None, flags=flags,
            is_priceable=False, rejection_reason="No statement rows provided."
        )

    # -------------------------------------------------------------
    # Rule 3(a): Multi-source distributor resolution
    # -------------------------------------------------------------
    # Group rows by source folder / file
    groups = defaultdict(list)
    for r in raw_rows:
        src = r.get("source_file", "default")
        # Normalize folder / prefix if present
        group_key = src.split("/")[0].split("\\")[0] if ("/" in src or "\\" in src) else src
        groups[group_key].append(r)

    source_feeds_found = list(groups.keys())
    kept_feed = None
    rows_after_source: List[Dict[str, Any]] = []

    # Check if all group names are years (e.g., "2024", "2025")
    is_all_years = len(source_feeds_found) > 0 and all(
        bool(re.match(r"^\d{4}$", str(k).strip())) for k in source_feeds_found
    )

    if len(groups) == 1 or is_all_years:
        # Merge all
        for r_list in groups.values():
            rows_after_source.extend(r_list)
        kept_feed = "merged_annual_feeds" if is_all_years else source_feeds_found[0]
    else:
        # Score each group = mean revenue over latest 3 months it reports
        group_scores = {}
        for g_name, g_rows in groups.items():
            # Get months in this group
            g_month_totals = defaultdict(float)
            for r in g_rows:
                g_month_totals[r["sale_month"]] += r["earnings_usd"]
            sorted_m = sorted(g_month_totals.keys())
            latest_3 = sorted_m[-3:] if len(sorted_m) >= 3 else sorted_m
            score = sum(g_month_totals[m] for m in latest_3) / len(latest_3) if latest_3 else 0.0
            group_scores[g_name] = score

        # Keep highest-scoring group, drop the rest
        best_group = max(group_scores.keys(), key=lambda k: group_scores[k])
        kept_feed = best_group
        rows_after_source = groups[best_group]
        flags.append("MULTI_SOURCE_FEED")

    # -------------------------------------------------------------
    # Rule 3(c): Exclude missing feeds
    # If a store reported > 0 rows in earlier months and exactly 0 rows in the latest month,
    # exclude that store from EVERY month.
    # -------------------------------------------------------------
    # Get all distinct months
    all_months = sorted(list(set(r["sale_month"] for r in rows_after_source)))
    excluded_stores: List[str] = []
    
    if len(all_months) >= 2:
        latest_month = all_months[-1]
        earlier_months = set(all_months[:-1])
        
        stores_in_earlier = set()
        stores_in_latest = set()
        for r in rows_after_source:
            s_name = r.get("store", "Unknown")
            if r["sale_month"] in earlier_months:
                stores_in_earlier.add(s_name)
            elif r["sale_month"] == latest_month:
                stores_in_latest.add(s_name)

        dropped_stores = stores_in_earlier - stores_in_latest
        if dropped_stores:
            excluded_stores = sorted(list(dropped_stores))
            flags.append("MISSING_FEED_DETECTED")
            rows_after_source = [r for r in rows_after_source if r.get("store", "Unknown") not in dropped_stores]

    # Recompute monthly totals after store exclusions
    monthly_totals_map = defaultdict(float)
    for r in rows_after_source:
        monthly_totals_map[r["sale_month"]] += r["earnings_usd"]

    sorted_months = sorted(monthly_totals_map.keys())

    # -------------------------------------------------------------
    # Rule 3(b): Drop partial trailing months
    # while len(months) >= 4:
    #   ref = median(revenue of 3 months before last)
    #   if revenue(last month) < PHI_PARTIAL * ref:
    #       drop last month; raise PARTIAL_MONTH_EXCLUDED
    #   else: stop
    # -------------------------------------------------------------
    phi_partial = cfg.get("PHI_PARTIAL", 0.25)
    dropped_months: List[str] = []

    while len(sorted_months) >= 4:
        last_m = sorted_months[-1]
        prior_3 = sorted_months[-4:-1]
        ref = median([monthly_totals_map[m] for m in prior_3])
        
        last_rev = monthly_totals_map[last_m]
        if ref > 0 and last_rev < phi_partial * ref:
            dropped_months.append(last_m)
            sorted_months.pop()
            if "PARTIAL_MONTH_EXCLUDED" not in flags:
                flags.append("PARTIAL_MONTH_EXCLUDED")
        else:
            break

    usable_months = sorted_months
    usable_rows = [r for r in rows_after_source if r["sale_month"] in usable_months]
    
    # Final usable monthly totals
    final_monthly_totals = {m: monthly_totals_map[m] for m in usable_months}
    m_count = len(usable_months)

    # -------------------------------------------------------------
    # History Gates (Section 3.2)
    # -------------------------------------------------------------
    m_min = cfg.get("M_MIN", 6)
    if m_count < m_min:
        flags.append("INSUFFICIENT_HISTORY")
        return IngestionResult(
            usable_rows=usable_rows,
            monthly_totals=final_monthly_totals,
            usable_months=usable_months,
            dropped_months=dropped_months,
            excluded_stores=excluded_stores,
            source_feeds_found=source_feeds_found,
            kept_feed=kept_feed,
            flags=flags,
            is_priceable=False,
            rejection_reason=f"Only {m_count} usable month(s) found. Minimum required is {m_min} months."
        )

    if m_count < 12:
        flags.append("SHORT_HISTORY")

    if m_count < 6:
        flags.append("DECAY_UNSTABLE")

    return IngestionResult(
        usable_rows=usable_rows,
        monthly_totals=final_monthly_totals,
        usable_months=usable_months,
        dropped_months=dropped_months,
        excluded_stores=excluded_stores,
        source_feeds_found=source_feeds_found,
        kept_feed=kept_feed,
        flags=flags,
        is_priceable=True,
        rejection_reason=None
    )
