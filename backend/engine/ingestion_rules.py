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

    # Merge all uploaded files/batches to build the complete monthly timeseries
    for r_list in groups.values():
        rows_after_source.extend(r_list)
    kept_feed = "merged_statement_files" if len(groups) > 1 else (source_feeds_found[0] if source_feeds_found else "default")

    # -------------------------------------------------------------
    # Rule 3(b): Drop partial trailing months FIRST
    # Digital royalty statements for the most recent month often arrive incomplete
    # (e.g. some DSPs on a 30-day reporting lag vs 60-90 days for others).
    # Drop partial trailing months before feed continuity checks.
    # while len(sorted_months) >= 4:
    #   ref = median(revenue of 3 months before last)
    #   if revenue(last month) < PHI_PARTIAL * ref:
    #       drop last month; raise PARTIAL_MONTH_EXCLUDED
    #   else: stop
    # -------------------------------------------------------------
    initial_monthly_totals = defaultdict(float)
    for r in rows_after_source:
        initial_monthly_totals[r["sale_month"]] += r["earnings_usd"]

    sorted_months = sorted(initial_monthly_totals.keys())
    phi_partial = cfg.get("PHI_PARTIAL", 0.25)
    dropped_months: List[str] = []

    while len(sorted_months) >= 4:
        last_m = sorted_months[-1]
        prior_3 = sorted_months[-4:-1]
        ref = median([initial_monthly_totals[m] for m in prior_3])
        
        last_rev = initial_monthly_totals[last_m]
        if ref > 0 and last_rev < phi_partial * ref:
            dropped_months.append(last_m)
            sorted_months.pop()
            if "PARTIAL_MONTH_EXCLUDED" not in flags:
                flags.append("PARTIAL_MONTH_EXCLUDED")
        else:
            break

    # Retain only rows belonging to valid non-partial months
    rows_after_source = [r for r in rows_after_source if r["sale_month"] in sorted_months]

    # -------------------------------------------------------------
    # Rule 3(c): Exclude missing feeds on validated complete history
    # If a recognized distributor/DSP platform reported > 0 in earlier months but stopped reporting
    # in the latest month while other feeds continued, exclude that feed from all months.
    # Safeguard: Do NOT exclude generic/file-based labels or drop months entirely.
    # -------------------------------------------------------------
    GENERIC_STORE_NAMES = {"unknown", "catalog", "streaming", "sales", "digital", "merged_statement_files", "default"}
    excluded_stores: List[str] = []
    
    if len(sorted_months) >= 2:
        latest_month = sorted_months[-1]
        earlier_months = set(sorted_months[:-1])
        
        stores_in_earlier = set()
        stores_in_latest = set()
        for r in rows_after_source:
            s_name = str(r.get("store", "Catalog")).strip()
            # Skip generic labels and filename-derived stores
            s_low = s_name.lower()
            if s_low in GENERIC_STORE_NAMES or any(s_low.endswith(ext) for ext in [".csv", ".tsv", ".xlsx", ".pdf", ".txt", ".docx", ".json"]):
                continue
            if r["sale_month"] in earlier_months:
                stores_in_earlier.add(s_name)
            elif r["sale_month"] == latest_month:
                stores_in_latest.add(s_name)

        # Only drop if there are remaining valid stores in latest and dropping doesn't destroy entire months
        if stores_in_latest and stores_in_earlier:
            candidate_dropped = stores_in_earlier - stores_in_latest
            # Check that dropping these stores does not completely delete any earlier month
            if candidate_dropped:
                safe_to_drop = True
                for em in earlier_months:
                    month_stores = set(str(r.get("store", "Catalog")).strip() for r in rows_after_source if r["sale_month"] == em)
                    if month_stores.issubset(candidate_dropped):
                        safe_to_drop = False
                        break
                
                if safe_to_drop:
                    excluded_stores = sorted(list(candidate_dropped))
                    flags.append("MISSING_FEED_DETECTED")
                    rows_after_source = [r for r in rows_after_source if str(r.get("store", "Catalog")).strip() not in candidate_dropped]

    # Final usable monthly totals
    final_monthly_totals = defaultdict(float)
    for r in rows_after_source:
        final_monthly_totals[r["sale_month"]] += r["earnings_usd"]

    usable_months = sorted_months
    usable_rows = [r for r in rows_after_source if r["sale_month"] in usable_months]
    m_count = len(usable_months)

    # -------------------------------------------------------------
    # History Gates (Section 3.2)
    # -------------------------------------------------------------
    m_min = cfg.get("M_MIN", 1)
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
            rejection_reason=f"No usable statement month(s) found."
        )

    if m_count < 6:
        flags.append("SHORT_HISTORY")
        flags.append("DECAY_UNSTABLE")
    elif m_count < 12:
        flags.append("SHORT_HISTORY")

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
