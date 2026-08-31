"""
Monthly Aggregator Module (Stage 2)
====================================
Architecture Role:
Takes parsed royalty statements from Stage 1 (PARSER), combines and reconciles all files,
aggregates duplicate months using exact Decimal arithmetic on (year, month) keys,
preserves negative/reversal adjustments, maintains distinct genuine $0 vs missing months,
and produces the single sorted Canonical Monthly Earnings Dataset for Stage 3 (VALUATION ENGINE).

Boundary Logging:
- [PARSER] File extraction summary
- [MONTHLY AGGREGATOR] Canonical aggregation & chronological ordering
- [VALUATION ENGINE] Canonical dataset handover
"""
import logging
from decimal import Decimal, InvalidOperation
from typing import List, Dict, Any, Optional, Tuple, Set
from collections import defaultdict
import re

logger = logging.getLogger("royalty_pipeline")
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter("[%(levelname)s] %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


class CanonicalMonthlyItem:
    def __init__(
        self,
        month: str,
        earnings: float,
        earnings_dec: Decimal,
        currency: str = "USD",
        track_count: int = 1,
        primary_source: str = "Catalog",
        sources: Optional[List[Dict[str, Any]]] = None,
        source_files: Optional[List[str]] = None
    ):
        self.month = month
        self.earnings = earnings
        self.earnings_dec = earnings_dec
        self.currency = currency
        self.track_count = track_count
        self.primary_source = primary_source
        self.sources = sources or []
        self.source_files = source_files or []

    def to_dict(self) -> Dict[str, Any]:
        return {
            "month": self.month,
            "earnings": str(self.earnings_dec),
            "net_royalty": float(self.earnings_dec),
            "currency": self.currency,
            "track_count": self.track_count,
            "primary_source": self.primary_source,
            "sources": self.sources,
            "source_files": self.source_files
        }


class AggregationResult:
    def __init__(
        self,
        canonical_series: List[Dict[str, Any]],
        monthly_totals_map: Dict[str, float],
        combined_rows: List[Dict[str, Any]],
        total_net_dec: Decimal,
        currency: str,
        file_count: int,
        warnings: List[str],
        r0_median: float = 0.0,
        r0_window_months: Optional[List[str]] = None,
        r_median_full: float = 0.0
    ):
        self.canonical_series = canonical_series
        self.monthly_totals_map = monthly_totals_map
        self.combined_rows = combined_rows
        self.total_net_dec = total_net_dec
        self.currency = currency
        self.file_count = file_count
        self.warnings = warnings
        self.r0_median = r0_median
        self.r0_window_months = r0_window_months or []
        self.r_median_full = r_median_full

    def to_dict(self) -> Dict[str, Any]:
        return {
            "canonical_series": self.canonical_series,
            "monthly_totals_map": self.monthly_totals_map,
            "combined_rows": self.combined_rows,
            "total_net": float(self.total_net_dec),
            "total_net_str": str(self.total_net_dec),
            "currency": self.currency,
            "file_count": self.file_count,
            "months_count": len(self.canonical_series),
            "r0_median": self.r0_median,
            "r0_window_months": self.r0_window_months,
            "r_median_full": self.r_median_full,
            "warnings": self.warnings
        }


def clean_to_decimal(val: Any) -> Decimal:
    """Helper to convert float/int/str/Decimal cleanly into exact Decimal."""
    if val is None:
        return Decimal("0.0")
    if isinstance(val, Decimal):
        return val
    if isinstance(val, (int, float)):
        return Decimal(str(val))
    val_str = str(val).strip().replace("$", "").replace("€", "").replace("£", "").replace(",", "")
    if not val_str or val_str.lower() in ("nan", "none", "null", ""):
        return Decimal("0.0")
    try:
        return Decimal(val_str)
    except InvalidOperation:
        return Decimal("0.0")


def aggregate_parsed_statements(
    parsed_statement_results: List[Dict[str, Any]],
    default_currency: str = "USD"
) -> AggregationResult:
    """
    Stage 2: MONTHLY AGGREGATOR
    Combines parsed results from arbitrary number of statement files into a single
    chronologically sorted canonical monthly earnings dataset.

    Guarantees:
    1. Collects every file's parsed results without overwriting.
    2. Combines duplicate months across files cleanly (e.g. Statement A Jan $100 + Statement B Jan $50 = $150).
    3. Preserves exact Decimal arithmetic (zero floating-point drift).
    4. Preserves true negative/reversal rows.
    5. Preserves distinct genuine $0 months vs missing months.
    6. Formats combined rows for Stage 3 Valuation Engine.
    """
    logger.info(f"[MONTHLY AGGREGATOR] Beginning aggregation of {len(parsed_statement_results)} parsed statement(s)...")

    combined_months = defaultdict(lambda: {
        "earnings_dec": Decimal("0.0"),
        "currency": default_currency,
        "tracks": set(),
        "stores": defaultdict(Decimal),
        "source_files": set(),
        "has_genuine_records": False
    })

    all_combined_rows: List[Dict[str, Any]] = []
    combined_warnings: List[str] = []
    doc_currency = default_currency

    for idx, parsed in enumerate(parsed_statement_results):
        src_file = parsed.get("statement_metadata", {}).get("source_file") or f"file_{idx+1}.csv"
        p_curr = parsed.get("currency") or parsed.get("statement_metadata", {}).get("currency") or default_currency
        if p_curr and p_curr != "USD":
            doc_currency = p_curr

        p_rows = parsed.get("rows", [])
        p_breakdown = parsed.get("monthly_breakdown", [])
        p_warnings = parsed.get("warnings", [])

        logger.info(f"[PARSER Extraction] File {idx+1}/{len(parsed_statement_results)}: '{src_file}' -> {len(p_rows)} row(s), {len(p_breakdown)} month(s) extracted.")
        combined_warnings.extend(p_warnings)

        # 1. Process granular rows if available
        if p_rows:
            for r in p_rows:
                m_str = r.get("sale_month")
                if not m_str:
                    continue
                # Normalize YYYY-MM
                m_match = re.search(r"(?:^|[^0-9])(20\d{2})[-/._](0[1-9]|1[0-2])(?:[^0-9]|$)", m_str)
                norm_m = f"{m_match.group(1)}-{m_match.group(2)}" if m_match else m_str

                amt_dec = clean_to_decimal(r.get("earnings_exact_str") if r.get("earnings_exact_str") is not None else r.get("earnings_usd"))
                store = str(r.get("store") or "Catalog").strip()
                title = str(r.get("title") or "Catalog").strip()
                isrc = str(r.get("isrc") or "").strip()

                combined_months[norm_m]["earnings_dec"] += amt_dec
                combined_months[norm_m]["currency"] = p_curr
                combined_months[norm_m]["tracks"].add(isrc or title)
                combined_months[norm_m]["stores"][store] += amt_dec
                combined_months[norm_m]["source_files"].add(src_file)
                combined_months[norm_m]["has_genuine_records"] = True

                all_combined_rows.append({
                    "sale_month": norm_m,
                    "store": store,
                    "isrc": isrc,
                    "title": title,
                    "earnings_usd": float(amt_dec),
                    "earnings_exact_str": str(amt_dec),
                    "source_file": src_file
                })

        # 2. If no granular rows but monthly_breakdown is present (e.g. summary statements)
        elif p_breakdown:
            for b in p_breakdown:
                m_str = b.get("month")
                if not m_str:
                    continue
                m_match = re.search(r"(?:^|[^0-9])(20\d{2})[-/._](0[1-9]|1[0-2])(?:[^0-9]|$)", m_str)
                norm_m = f"{m_match.group(1)}-{m_match.group(2)}" if m_match else m_str

                raw_amt = b.get("earnings") if b.get("earnings") is not None else b.get("net_royalty")
                amt_dec = clean_to_decimal(raw_amt)
                p_store = b.get("primary_source") or "Catalog"

                combined_months[norm_m]["earnings_dec"] += amt_dec
                combined_months[norm_m]["currency"] = b.get("currency") or p_curr
                combined_months[norm_m]["stores"][p_store] += amt_dec
                combined_months[norm_m]["source_files"].add(src_file)
                combined_months[norm_m]["has_genuine_records"] = True

                # Synthesize normalized row with consistent key per track/month
                all_combined_rows.append({
                    "sale_month": norm_m,
                    "store": p_store,
                    "isrc": f"TRK_{abs(hash(norm_m)) & 0xffffff:06x}",
                    "title": f"Catalog Earnings ({norm_m})",
                    "earnings_usd": float(amt_dec),
                    "earnings_exact_str": str(amt_dec),
                    "source_file": src_file
                })

    # Sort months chronologically
    sorted_months = sorted(combined_months.keys())
    canonical_series: List[Dict[str, Any]] = []
    monthly_totals_map: Dict[str, float] = {}
    total_net_dec = Decimal("0.0")

    for m in sorted_months:
        item = combined_months[m]
        m_dec = item["earnings_dec"]
        total_net_dec += m_dec
        m_float = float(m_dec)
        monthly_totals_map[m] = m_float

        top_store = max(item["stores"], key=lambda k: item["stores"][k]) if item["stores"] else "Catalog"

        canonical_series.append({
            "month": m,
            "earnings": str(m_dec),
            "net_royalty": m_float,
            "currency": item["currency"],
            "track_count": max(1, len(item["tracks"])),
            "primary_source": top_store,
            "sources": [
                {
                    "platform": s_name,
                    "amount": float(s_amt),
                    "amount_str": str(s_amt)
                }
                for s_name, s_amt in item["stores"].items()
            ],
            "source_files": sorted(list(item["source_files"]))
        })

    # Compute trailing 3-month median (R0) and 12-month full median
    r0_median = 0.0
    r0_window_months = []
    r_median_full = 0.0

    if canonical_series:
        all_vals = [m["net_royalty"] for m in canonical_series]
        s_all = sorted(all_vals)
        n_all = len(s_all)
        r_median_full = float(s_all[n_all // 2]) if n_all % 2 == 1 else float((s_all[n_all // 2 - 1] + s_all[n_all // 2]) / 2.0)

        # Apply Rule 3(b) partial trailing month drop if trailing month is severely incomplete (< 25% of prior 3 median)
        usable_series = list(canonical_series)
        phi_partial = 0.25
        while len(usable_series) >= 4:
            prior_3_vals = [m["net_royalty"] for m in usable_series[-4:-1]]
            s_p3 = sorted(prior_3_vals)
            ref_val = float(s_p3[1])  # median of 3
            last_val = usable_series[-1]["net_royalty"]
            if ref_val > 0 and last_val < phi_partial * ref_val:
                usable_series.pop()
            else:
                break

        # Trailing 3-month window (R_WIN = 3) on usable months
        r_win = min(3, len(usable_series))
        r0_window_items = usable_series[-r_win:] if usable_series else canonical_series[-min(3, len(canonical_series)):]
        r0_window_months = [m["month"] for m in r0_window_items]
        recent_vals = [m["net_royalty"] for m in r0_window_items]
        s_rec = sorted(recent_vals)
        n_rec = len(s_rec)
        r0_median = float(s_rec[n_rec // 2]) if n_rec % 2 == 1 else float((s_rec[n_rec // 2 - 1] + s_rec[n_rec // 2]) / 2.0)

    logger.info(f"[MONTHLY AGGREGATOR] Canonical dataset constructed: {len(canonical_series)} month(s) sorted chronologically ({sorted_months[0] if sorted_months else 'N/A'} -> {sorted_months[-1] if sorted_months else 'N/A'}). Total Net: {total_net_dec} {doc_currency}")
    logger.info(f"[MONTHLY AGGREGATOR] Trailing 3M Window: {r0_window_months} -> Trailing Median R0 = ${r0_median:.2f} | Full {len(canonical_series)}M Median = ${r_median_full:.2f}")
    for c in canonical_series:
        logger.info(f"  --> Month {c['month']}: {c['earnings']} {c['currency']} (from {', '.join(c['source_files'])})")

    return AggregationResult(
        canonical_series=canonical_series,
        monthly_totals_map=monthly_totals_map,
        combined_rows=all_combined_rows,
        total_net_dec=total_net_dec,
        currency=doc_currency,
        file_count=len(parsed_statement_results),
        warnings=combined_warnings,
        r0_median=round(r0_median, 2),
        r0_window_months=r0_window_months,
        r_median_full=round(r_median_full, 2)
    )
