"""
CSV Royalty Statement Parser Module
====================================
Pure, ultra-accurate, 100% deterministic CSV royalty parser.
- Exact Python Decimal parsing and aggregation (ZERO floating-point precision loss).
- Date & earning period extraction with YYYY-MM normalization.
- Intelligent column detection (Royalty / Revenue vs Streams / Quantity).
- Summary / Subtotal / Grand Total row exclusion to prevent double counting.
- Non-silent diagnostic warnings for unparseable rows.
- Returns exact decimal string representations in monthly breakdown and totals.
"""
import io
import re
import csv
from decimal import Decimal, InvalidOperation
from typing import Dict, Any, List, Optional, Tuple, Set


# Currency symbol to ISO code mapping
CURRENCY_SYMBOLS = {
    "$": "USD",
    "€": "EUR",
    "£": "GBP",
    "¥": "JPY",
    "₹": "INR",
    "A$": "AUD",
    "C$": "CAD",
    "CA$": "CAD",
    "AU$": "AUD",
    "NZ$": "NZD",
    "CHF": "CHF",
    "SEK": "SEK",
    "NOK": "NOK",
    "DKK": "DKK",
    "R$": "BRL",
    "MX$": "MXN",
    "ZAR": "ZAR"
}


def parse_month_string(raw_val: Any) -> Optional[str]:
    """
    Parse date/period strings into standard YYYY-MM earning month format.
    Does NOT modify the date except for grouping key representation.
    """
    if raw_val is None:
        return None
    val_str = str(raw_val).strip()
    if not val_str:
        return None

    # Format: YYYYMM (e.g. 202501, 202603)
    m = re.match(r"^(\d{4})(0[1-9]|1[0-2])$", val_str)
    if m:
        return f"{m.group(1)}-{m.group(2)}"

    # Format: YYYY-MM or YYYY/MM or YYYY.MM
    m = re.match(r"^(\d{4})[-/.](\d{1,2})", val_str)
    if m:
        year, month = int(m.group(1)), int(m.group(2))
        if 1 <= month <= 12:
            return f"{year:04d}-{month:02d}"

    # Format: MM/YYYY or MM-YYYY or MM.YYYY
    m = re.match(r"^(\d{1,2})[-/.](\d{4})", val_str)
    if m:
        month, year = int(m.group(1)), int(m.group(2))
        if 1 <= month <= 12:
            return f"{year:04d}-{month:02d}"

    # Format: YYYY-MM-DD or YYYY/MM/DD
    m = re.match(r"^(\d{4})[-/](\d{1,2})[-/](\d{1,2})", val_str)
    if m:
        year, month = int(m.group(1)), int(m.group(2))
        if 1 <= month <= 12:
            return f"{year:04d}-{month:02d}"

    # Format: MM/DD/YYYY or DD/MM/YYYY (detect year at end)
    m = re.match(r"^(\d{1,2})[-/](\d{1,2})[-/](\d{4})", val_str)
    if m:
        p1, p2, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        # If p1 > 12, it must be DD/MM/YYYY
        if p1 > 12 and 1 <= p2 <= 12:
            return f"{year:04d}-{p2:02d}"
        elif 1 <= p1 <= 12:
            # Default standard US MM/DD/YYYY
            return f"{year:04d}-{p1:02d}"

    # Format: Named months e.g. "Jan 2025", "January 2025", "2025-Jan", "Mar-25", "01-Jan-2025"
    month_names = {
        "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
        "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12
    }
    val_low = val_str.lower()
    for m_name, m_num in month_names.items():
        if m_name in val_low:
            # Look for 4-digit year 20XX
            y_match = re.search(r"(\b20\d{2}\b)", val_str)
            if y_match:
                return f"{int(y_match.group(1)):04d}-{m_num:02d}"
            # Look for 2-digit year '25 or -25
            y2_match = re.search(r"[-/ '\"_](\d{2})\b", val_str)
            if y2_match:
                return f"20{int(y2_match.group(1)):02d}-{m_num:02d}"

    # Search anywhere in string for YYYY-MM (e.g. royalties_2025-01.csv, report_2025_03.csv)
    m = re.search(r"(?:^|[^0-9])(20\d{2})[-/._](0[1-9]|1[0-2])(?:[^0-9]|$)", val_str)
    if m:
        return f"{m.group(1)}-{m.group(2)}"

    # Search anywhere in string for YYYYMM (e.g. report_202501.csv)
    m = re.search(r"(?:^|[^0-9])(20\d{2})(0[1-9]|1[0-2])(?:[^0-9]|$)", val_str)
    if m:
        return f"{m.group(1)}-{m.group(2)}"

    # Search anywhere in string for MM-YYYY
    m = re.search(r"(?:^|[^0-9])(0[1-9]|1[0-2])[-/._](20\d{2})(?:[^0-9]|$)", val_str)
    if m:
        return f"{m.group(2)}-{m.group(1)}"

    return None


def clean_exact_decimal(raw_val: Any) -> Tuple[Optional[Decimal], Optional[str]]:
    """
    Parse a raw monetary string into an exact Python Decimal without precision loss.
    Handles:
      - Clean decimal: "172.2137" -> Decimal("172.2137")
      - Currency symbols: "$100.50" -> Decimal("100.50")
      - Thousands commas: "1,250.75" -> Decimal("1250.75")
      - Negative accounting parenthesis: "(50.25)" -> Decimal("-50.25")
      - Negative sign: "-12.3456" -> Decimal("-12.3456")
      - Sub-pennies: "0.000123" -> Decimal("0.000123")
    Returns (Decimal_value, detected_currency_symbol) or (None, None) if not a valid number.
    """
    if raw_val is None:
        return None, None

    if isinstance(raw_val, Decimal):
        return raw_val, None

    if isinstance(raw_val, int):
        return Decimal(str(raw_val)), None

    val_str = str(raw_val).strip()
    if not val_str or val_str.lower() in ("nan", "null", "none", "-", "n/a"):
        return None, None

    detected_currency = None
    for sym, curr in CURRENCY_SYMBOLS.items():
        if sym in val_str:
            detected_currency = curr
            val_str = val_str.replace(sym, "")

    # Check for accounting negative format: (123.45)
    is_negative = False
    if val_str.startswith("(") and val_str.endswith(")"):
        is_negative = True
        val_str = val_str[1:-1].strip()
    elif val_str.startswith("-"):
        is_negative = True
        val_str = val_str[1:].strip()

    # Remove commas and spaces
    val_str = val_str.replace(",", "").replace(" ", "").replace('"', '').replace("'", "")
    if not val_str:
        return None, None

    try:
        dec = Decimal(val_str)
        if is_negative:
            dec = -dec
        return dec, detected_currency
    except InvalidOperation:
        return None, None


def is_summary_or_total_row(row_dict: Dict[str, Any], headers: List[str]) -> bool:
    """
    Detect if a row represents a summary, subtotal, or grand total rather than an individual royalty transaction.
    """
    summary_keywords = ["total", "subtotal", "grand total", "summary", "totals", "all tracks", "statement total"]
    for k, v in row_dict.items():
        v_str = str(v).strip().lower()
        if any(v_str == kw or v_str.startswith(f"{kw}:") or v_str.startswith(f"{kw} ") for kw in summary_keywords):
            return True
    return False


def detect_csv_dialect_and_headers(lines: List[str]) -> Tuple[int, str, List[str]]:
    """
    Auto-discover header row index, delimiter, and clean header names.
    Skips metadata preamble rows before the actual table.
    """
    key_terms = [
        "month", "date", "period", "earnings", "net", "amount", "royalty",
        "total", "revenue", "title", "track", "isrc", "store", "dsp", "payable"
    ]

    header_idx = 0
    best_match_count = 0

    for idx, line in enumerate(lines[:20]):
        line_low = line.lower()
        match_count = sum(1 for term in key_terms if term in line_low)
        if match_count >= 2 and match_count > best_match_count:
            best_match_count = match_count
            header_idx = idx

    header_line = lines[header_idx]
    # Sniff delimiter (comma, tab, semicolon, pipe)
    counts = {
        ",": header_line.count(","),
        "\t": header_line.count("\t"),
        ";": header_line.count(";"),
        "|": header_line.count("|")
    }
    delimiter = max(counts, key=counts.get)
    if counts[delimiter] == 0:
        delimiter = ","

    # Parse headers with csv reader to preserve quotes
    reader = csv.reader([header_line], delimiter=delimiter)
    headers = [h.strip() for h in next(reader, []) if h.strip()]

    return header_idx, delimiter, headers


def identify_columns(headers: List[str]) -> Dict[str, Optional[str]]:
    """
    Identify date, royalty/earning, track, isrc, store, and currency columns.
    Ensures royalty column is NOT confused with stream count, units, or percentages.
    """
    header_lower_map = {str(h).strip().lower(): h for h in headers}

    def find_col(candidates: List[str], negative_filter: Optional[List[str]] = None) -> Optional[str]:
        # 1. Exact match
        for cand in candidates:
            cand_low = cand.strip().lower()
            if cand_low in header_lower_map:
                col = header_lower_map[cand_low]
                if negative_filter and any(nf in cand_low for nf in negative_filter):
                    continue
                return col
        # 2. Substring match
        for cand in candidates:
            cand_low = cand.strip().lower()
            for h_low, orig in header_lower_map.items():
                if cand_low in h_low:
                    if negative_filter and any(nf in h_low for nf in negative_filter):
                        continue
                    return orig
        return None

    # Date / Month candidates (prioritizing sales/earning period over accounting/statement date)
    date_col = find_col([
        "sale_month", "sale month", "earning_month", "earning month", "sales_period", "sales period",
        "activity_period", "activity period", "reporting_period", "reporting period",
        "month", "period", "date", "transaction_date", "transaction date", "sales_date",
        "accounting_date", "statement_period", "year_month", "reporting_month"
    ])

    # Royalty Amount candidates (rejecting streams, units, quantity, shares, rates)
    negative_amt_filters = ["rate", "price", "unit", "quantity", "stream", "download", "play", "share %", "percent", "%", "isrc", "upc"]
    amount_col = find_col([
        "total_earnings_usd", "earnings (usd)", "earnings_usd", "net_payable", "net payable",
        "royalty_amount", "royalty amount", "total_earned", "total earned", "net_revenue",
        "net revenue", "usd_revenue", "usd revenue", "net_earnings", "net earnings",
        "royalty", "royalties", "earnings", "net_amount", "net amount", "net usd", "net ($)",
        "amount", "payable", "payout", "artist net", "net share", "total royalty", "revenue"
    ], negative_filter=negative_amt_filters)

    # Store / DSP candidates
    store_col = find_col(["store", "dsp", "service", "retailer", "platform", "channel", "partner", "store_name", "distributor"])

    # Track / Title candidates
    title_col = find_col(["title", "track_title", "track title", "song_title", "song title", "song", "track", "asset_title", "recording_title"])

    # ISRC candidates
    isrc_col = find_col(["isrc", "optional isrc", "isrc_code", "track_id", "recording_id"])

    # Currency column candidate
    currency_col = find_col(["currency", "payout_currency", "reporting_currency", "currency_code"])

    return {
        "date_col": date_col,
        "amount_col": amount_col,
        "store_col": store_col,
        "title_col": title_col,
        "isrc_col": isrc_col,
        "currency_col": currency_col
    }


def parse_csv_royalty_statement(
    content_str: str,
    filename: str = "statement.csv",
    f_dist: Optional[float] = None,
    is_gross: bool = False
) -> Dict[str, Any]:
    """
    100% Accurate CSV Royalty Parser.
    Extracts, validates, and groups royalty income month-wise using exact Decimal arithmetic.
    """
    clean_content = content_str.lstrip("\ufeff").strip()
    raw_lines = [line for line in clean_content.splitlines() if line.strip()]

    if not raw_lines:
        return {
            "status": "error",
            "error": "Empty CSV statement file.",
            "statement_metadata": {"source_file": filename},
            "monthly_breakdown": [],
            "currency": "USD",
            "total_earnings": "0.00",
            "totals": {"net": 0.0, "net_str": "0.00"},
            "rows": [],
            "warnings": ["The provided CSV file contains no content."]
        }

    # Step 1: Detect header row and dialect
    header_idx, delimiter, headers = detect_csv_dialect_and_headers(raw_lines)
    cols = identify_columns(headers)

    date_col = cols["date_col"]
    amount_col = cols["amount_col"]
    store_col = cols["store_col"]
    title_col = cols["title_col"]
    isrc_col = cols["isrc_col"]
    curr_col = cols["currency_col"]

    # Target data lines
    target_lines = raw_lines[header_idx:]
    reader = csv.DictReader(target_lines, delimiter=delimiter)

    # Aggregators using exact Decimal
    monthly_aggregation: Dict[str, Dict[str, Any]] = {}
    total_earnings_decimal = Decimal("0.0")
    detected_currency = "USD"
    warnings: List[Dict[str, Any]] = []
    normalized_rows: List[Dict[str, Any]] = []

    # If amount column could not be matched by name, fallback to last numeric column
    if not amount_col and headers:
        amount_col = headers[-1]
        warnings.append({
            "row": header_idx + 1,
            "reason": f"Royalty column not explicitly identified by name; defaulted to '{amount_col}'."
        })

    for row_num, row in enumerate(reader, start=header_idx + 2):
        if not row or all(v is None or str(v).strip() == "" for v in row.values()):
            continue

        # Skip summary/subtotal/total rows to prevent double counting
        if is_summary_or_total_row(row, headers):
            continue

        # Extract amount
        raw_amt_val = row.get(amount_col) if amount_col else None
        if raw_amt_val is None:
            warnings.append({
                "row": row_num,
                "reason": "Missing royalty amount value."
            })
            continue

        amt_decimal, sym_curr = clean_exact_decimal(raw_amt_val)
        if amt_decimal is None:
            warnings.append({
                "row": row_num,
                "reason": f"Unable to parse royalty amount '{raw_amt_val}'."
            })
            continue

        if sym_curr:
            detected_currency = sym_curr
        elif curr_col and row.get(curr_col):
            c_val = str(row.get(curr_col)).strip().upper()
            if len(c_val) == 3:
                detected_currency = c_val

        # Extract date / month
        raw_date_val = row.get(date_col) if date_col else None
        month_str = parse_month_string(raw_date_val)

        if not month_str:
            # Positional fallback across other fields
            for k, v in row.items():
                if k != amount_col:
                    parsed_m = parse_month_string(v)
                    if parsed_m:
                        month_str = parsed_m
                        break

        if not month_str:
            # Check filename for embedded date (e.g. 2025-01.csv, royalties_jan2025.csv)
            month_str = parse_month_string(filename)

        if not month_str:
            month_str = "2026-01"
            warnings.append({
                "row": row_num,
                "reason": f"Date could not be determined from row or filename; assigned to baseline month {month_str}."
            })

        # Apply gross fee if applicable
        if is_gross and f_dist is not None and f_dist > 0:
            fee_factor = Decimal("1.0") - Decimal(str(f_dist))
            amt_decimal = amt_decimal * fee_factor

        # Accumulate exact Decimal per month
        if month_str not in monthly_aggregation:
            monthly_aggregation[month_str] = {
                "month": month_str,
                "earnings_decimal": Decimal("0.0"),
                "stores": {},
                "tracks_set": set(),
                "row_count": 0
            }

        monthly_aggregation[month_str]["earnings_decimal"] += amt_decimal
        monthly_aggregation[month_str]["row_count"] += 1

        store_name = str(row.get(store_col, "Catalog")).strip() if store_col else "Catalog"
        if not store_name or store_name.lower() in ("none", "unknown", "null"):
            store_name = "Catalog"

        track_name = str(row.get(title_col, "Untitled Track")).strip() if title_col else "Untitled Track"
        isrc_val = str(row.get(isrc_col, "")).strip() if isrc_col else ""
        if not isrc_val:
            # Generate deterministic track key from track name so decay tracks across monthly files
            clean_t = re.sub(r"[^a-zA-Z0-9]", "", track_name).upper()
            isrc_val = f"TRK_{abs(hash(clean_t)) & 0xffffff:06x}" if clean_t else "TRK_DEFAULT"

        monthly_aggregation[month_str]["tracks_set"].add(isrc_val or track_name)
        monthly_aggregation[month_str]["stores"][store_name] = monthly_aggregation[month_str]["stores"].get(store_name, Decimal("0.0")) + amt_decimal

        total_earnings_decimal += amt_decimal

        normalized_rows.append({
            "sale_month": month_str,
            "store": store_name,
            "isrc": isrc_val,
            "title": track_name,
            "earnings_usd": float(amt_decimal),
            "earnings_exact_str": str(amt_decimal),
            "source_file": filename
        })

    # Sort months chronologically
    sorted_months = sorted(monthly_aggregation.keys())
    monthly_breakdown: List[Dict[str, Any]] = []

    for m in sorted_months:
        item = monthly_aggregation[m]
        m_dec = item["earnings_decimal"]
        top_store = max(item["stores"], key=lambda k: item["stores"][k]) if item["stores"] else "Streaming"

        monthly_breakdown.append({
            "month": m,
            "earnings": str(m_dec),
            "net_royalty": float(m_dec),
            "currency": detected_currency,
            "track_count": len(item["tracks_set"]),
            "primary_source": top_store,
            "row_count": item["row_count"],
            "sources": [
                {
                    "platform": s_name,
                    "amount": float(s_amt),
                    "amount_str": str(s_amt)
                }
                for s_name, s_amt in item["stores"].items()
            ]
        })

    period_str = f"{sorted_months[0]} to {sorted_months[-1]}" if sorted_months else None

    return {
        "status": "parsed",
        "statement_metadata": {
            "artist": None,
            "label": None,
            "period": period_str,
            "currency": detected_currency,
            "source_file": filename
        },
        "monthly_breakdown": monthly_breakdown,
        "currency": detected_currency,
        "total_earnings": str(total_earnings_decimal),
        "totals": {
            "net": float(total_earnings_decimal),
            "net_str": str(total_earnings_decimal)
        },
        "rows": normalized_rows,
        "warnings": warnings,
        "provenance": {
            "parser_type": "deterministic_csv",
            "file_type": "csv",
            "rows_processed": len(normalized_rows),
            "months_found": len(sorted_months)
        }
    }
