"""
Statement Normalizer module for the Advance Royalty Engine.
Implements the six format mappings from Section 4.1 of the specification.
Every file is normalized to rows of five fields:
- sale_month (YYYY-MM, earning month NOT payment month)
- store (platform name)
- isrc (track identifier)
- title (track title)
- earnings_usd (numeric net earnings in USD)
"""
from typing import List, Dict, Any, Tuple, Optional
import io
import re
import csv


class NormalizationError(Exception):
    pass


def parse_month_string(raw_val: Any) -> Optional[str]:
    """Parse various date formats into standard YYYY-MM."""
    if raw_val is None:
        return None
    val_str = str(raw_val).strip()
    if not val_str:
        return None

    # Format: YYYYMM (e.g. 202601)
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

    # Format: YYYY-MM-DD or MM/DD/YYYY
    m = re.match(r"^(\d{4})[-/](\d{1,2})[-/](\d{1,2})", val_str)
    if m:
        year, month = int(m.group(1)), int(m.group(2))
        if 1 <= month <= 12:
            return f"{year:04d}-{month:02d}"
    
    m = re.match(r"^(\d{1,2})[-/](\d{1,2})[-/](\d{4})", val_str)
    if m:
        month, day, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= month <= 12:
            return f"{year:04d}-{month:02d}"

    # Format: Jan 2026 / Mar-2024 / Jan-26
    month_names = {
        "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
        "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12
    }
    val_low = val_str.lower()
    for m_name, m_num in month_names.items():
        if m_name in val_low:
            y_match = re.search(r"(\b20\d{2}\b)", val_str)
            if y_match:
                return f"{int(y_match.group(1)):04d}-{m_num:02d}"
            y2_match = re.search(r"[-/ '](\d{2})\b", val_str)
            if y2_match:
                return f"20{int(y2_match.group(1)):02d}-{m_num:02d}"

    return None


from decimal import Decimal, InvalidOperation


def clean_decimal(raw_val: Any) -> Decimal:
    """Parse numeric currency strings safely into exact Decimal without floating-point precision loss."""
    if raw_val is None:
        return Decimal("0.0")
    if isinstance(raw_val, Decimal):
        return raw_val
    if isinstance(raw_val, int):
        return Decimal(str(raw_val))
    if isinstance(raw_val, float):
        # Convert float to string representation to avoid binary floating-point noise
        val_s = f"{raw_val:.8f}".rstrip("0").rstrip(".")
        try:
            return Decimal(val_s)
        except InvalidOperation:
            return Decimal(str(raw_val))

    val_str = str(raw_val).strip().replace("$", "").replace("€", "").replace("£", "").replace("₹", "").replace(",", "")
    if not val_str or val_str == "-" or val_str.lower() == "nan":
        return Decimal("0.0")
    try:
        return Decimal(val_str)
    except InvalidOperation:
        return Decimal("0.0")


def clean_currency(raw_val: Any) -> float:
    """Parse numeric currency strings safely into float (for backwards compatibility)."""
    dec = clean_decimal(raw_val)
    return float(dec)


def detect_and_normalize_table(rows: List[Dict[str, Any]], filename: str = "", f_dist: Optional[float] = None, is_gross: bool = False) -> List[Dict[str, Any]]:
    """
    Detect the distributor format from the header/columns and normalize to standard 5 fields.
    Supports DistroKid, TuneCore, DashGo, Too Lost, CD Baby, AWAL, Believe, Orchard, and generic CSV/Excel tables.
    """
    if not rows:
        return []

    headers = list(rows[0].keys())
    header_lower_map = {str(h).strip().lower(): h for h in headers}

    def get_col(*candidates: str) -> Optional[str]:
        for c in candidates:
            c_low = c.strip().lower()
            if c_low in header_lower_map:
                return header_lower_map[c_low]
        # Partial match
        for c in candidates:
            c_low = c.strip().lower()
            for h_low, orig in header_lower_map.items():
                if c_low in h_low:
                    return orig
        return None

    # Detect date & revenue columns
    month_col = get_col("Month")
    year_col = get_col("Year")

    sale_month_col = get_col(
        "sale_month", "sale month", "reporting_period", "reporting period",
        "sales_period", "sales period", "transaction_date", "transaction date",
        "accounting_date", "accounting date", "royalty_date", "royalty date",
        "date", "period", "year_month", "earning_month", "earning month",
        "statement_period", "statement period", "reporting_month", "reporting month",
        "transaction_month", "transaction month", "month"
    )

    store_col = get_col(
        "store", "channel", "dsp", "retailer", "service", "platform",
        "store_name", "store name", "partner", "distributor"
    )

    isrc_col = get_col("isrc", "optional isrc", "track_id", "recording_id", "isrc_code")
    title_col = get_col("title", "track_title", "song_title", "song", "track", "asset_title", "recording_title")

    amount_col = get_col(
        "earnings (usd)", "earnings_usd", "earnings", "net_payable", "net payable",
        "total_earned", "total earned", "usd_revenue", "usd revenue", "revenue",
        "net_amount", "net amount", "amount", "net", "total", "payable", "royalty",
        "royalties", "net_earnings", "net earnings", "share", "payout",
        "royalty_amount", "royalty ($)", "net ($)", "net usd", "earnings ($)",
        "total royalty", "net share", "artist net", "net payable (usd)"
    )

    # Positional fallback for amount column if candidate matching fails
    if not amount_col:
        for h in headers:
            h_str = str(h).lower()
            if any(term in h_str for term in ["usd", "$", "earnings", "net", "rev", "amt", "pay", "total"]):
                amount_col = h
                break

    if not amount_col:
        # Fallback to last column if numeric
        amount_col = headers[-1]

    normalized: List[Dict[str, Any]] = []

    for row in rows:
        sale_month = None
        if month_col and year_col:
            m_raw = str(row.get(month_col, "")).strip()
            y_raw = str(row.get(year_col, "")).strip()
            sale_month = parse_month_string(f"{y_raw}-{m_raw}")
        elif sale_month_col:
            sale_month = parse_month_string(row.get(sale_month_col))

        # Positional date scan if date column was missing
        if not sale_month:
            for k, val in row.items():
                parsed = parse_month_string(val)
                if parsed:
                    sale_month = parsed
                    break

        if not sale_month:
            sale_month = "2026-01"

        store = str(row.get(store_col, "Unknown")).strip() if store_col else "Unknown"
        isrc = str(row.get(isrc_col, "")).strip() if isrc_col else ""
        title = str(row.get(title_col, "Untitled Track")).strip() if title_col else "Untitled Track"

        raw_decimal = clean_decimal(row.get(amount_col, "0.0"))

        if is_gross and f_dist is not None:
            earnings_decimal = raw_decimal * (Decimal("1.0") - Decimal(str(f_dist)))
        else:
            earnings_decimal = raw_decimal

        normalized.append({
            "sale_month": sale_month,
            "store": store if store else "Unknown",
            "isrc": isrc,
            "title": title if title else "Untitled Track",
            "earnings_usd": float(earnings_decimal),
            "earnings_exact_str": str(earnings_decimal),
            "source_file": filename
        })

    return normalized


def parse_csv_or_tsv_content(content_str: str, filename: str = "", f_dist: Optional[float] = None, is_gross: bool = False) -> List[Dict[str, Any]]:
    """Parse CSV, TSV, or TXT tabular content with automatic header row auto-discovery."""
    clean_content = content_str.lstrip("\ufeff").strip()
    raw_lines = [line for line in clean_content.splitlines() if line.strip()]
    if not raw_lines:
        return []

    # Header Row Auto-Discovery: find line containing key column headers
    header_idx = 0
    key_terms = ["month", "date", "period", "earnings", "net", "amount", "royalty", "total", "payable", "revenue", "title", "track", "isrc", "store"]

    for idx, line in enumerate(raw_lines[:12]):
        line_low = line.lower()
        if sum(1 for term in key_terms if term in line_low) >= 2:
            header_idx = idx
            break

    target_lines = raw_lines[header_idx:]
    first_line = target_lines[0]
    delimiter = "\t" if "\t" in first_line and first_line.count("\t") >= first_line.count(",") else ","

    reader = csv.DictReader(target_lines, delimiter=delimiter)
    rows = list(reader)
    return detect_and_normalize_table(rows, filename=filename, f_dist=f_dist, is_gross=is_gross)
