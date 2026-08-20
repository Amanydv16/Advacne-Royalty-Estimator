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

    # Format: YYYY-MM or YYYY/MM or YYYY.MM
    m = re.match(r"^(\d{4})[-/.](\d{1,2})", val_str)
    if m:
        year, month = int(m.group(1)), int(m.group(2))
        return f"{year:04d}-{month:02d}"

    # Format: MM/YYYY or MM-YYYY
    m = re.match(r"^(\d{1,2})[-/](\d{4})", val_str)
    if m:
        month, year = int(m.group(1)), int(m.group(2))
        return f"{year:04d}-{month:02d}"

    # Format: MM/DD/YYYY or YYYY-MM-DD
    m = re.match(r"^(\d{4})[-/](\d{1,2})[-/](\d{1,2})", val_str)
    if m:
        year, month = int(m.group(1)), int(m.group(2))
        return f"{year:04d}-{month:02d}"
    
    m = re.match(r"^(\d{1,2})[-/](\d{1,2})[-/](\d{4})", val_str)
    if m:
        month, day, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return f"{year:04d}-{month:02d}"

    # Format: 03-MAR or MAR-2024 or Mar 2024
    month_names = {
        "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
        "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12
    }
    for m_name, m_num in month_names.items():
        if m_name in val_str.lower():
            # Find year
            y_match = re.search(r"(\d{4})", val_str)
            if y_match:
                year = int(y_match.group(1))
                return f"{year:04d}-{m_num:02d}"
            # Month name found but no 4-digit year exists -> drop row instead of defaulting
            return None

    return None


def clean_currency(raw_val: Any) -> float:
    """Parse numeric currency strings safely."""
    if raw_val is None:
        return 0.0
    if isinstance(raw_val, (int, float)):
        return float(raw_val)
    val_str = str(raw_val).strip().replace("$", "").replace("€", "").replace("£", "").replace(",", "")
    if not val_str or val_str == "-" or val_str.lower() == "nan":
        return 0.0
    try:
        return float(val_str)
    except ValueError:
        return 0.0


def detect_and_normalize_table(rows: List[Dict[str, Any]], filename: str = "", f_dist: Optional[float] = None, is_gross: bool = False) -> List[Dict[str, Any]]:
    """
    Detect the distributor format from the header/columns and normalize to 5 standard fields.
    Section 4.1: Six formats:
    1. DistroKid / Format 1: "Sale Month" and "Earnings (USD)"
    2. TuneCore / Format 2: "sale_date" / "accounting_date" and "total"
    3. DashGo / Format 3: "Sales Period" and "Net Payable" / "Total Earned"
    4. Format 4: "Transaction Date" and "USD Revenue" / "Revenue"
    5. Too Lost / Format 5: "Royalty Date" and "Amount" (Uses Royalty Date as earning month)
    6. CD Baby / Format 6: "Track Title", "Month", "Year"
    """
    if not rows:
        return []

    headers = list(rows[0].keys())
    header_lower_map = {h.strip().lower(): h for h in headers}

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

    # Detect format
    sale_month_col = None
    store_col = None
    isrc_col = None
    title_col = None
    amount_col = None
    month_col = None
    year_col = None

    # Format 1: DistroKid
    if get_col("Sale Month") and (get_col("Earnings (USD)") or get_col("Earnings")):
        sale_month_col = get_col("Sale Month")
        store_col = get_col("Store", "Retailer", "Platform") or "DistroKid"
        isrc_col = get_col("ISRC")
        title_col = get_col("Title", "Song Title", "Track Title")
        amount_col = get_col("Earnings (USD)", "Earnings")

    # Format 2: TuneCore / sale_date & total
    elif (get_col("sale_date") or get_col("accounting_date")) and get_col("total"):
        sale_month_col = get_col("accounting_date") or get_col("sale_date")
        store_col = get_col("channel", "store", "platform") or "TuneCore"
        isrc_col = get_col("isrc")
        title_col = get_col("track_title", "title", "song")
        amount_col = get_col("total")

    # Format 3: DashGo / Sales Period & Net Payable
    elif get_col("Sales Period") or (get_col("Net Payable") or get_col("Total Earned")):
        sale_month_col = get_col("Sales Period", "Period")
        store_col = get_col("Store Name", "Store", "DSP") or "DashGo"
        isrc_col = get_col("Optional ISRC", "ISRC")
        title_col = get_col("Song Title", "Track Title", "Title")
        amount_col = get_col("Net Payable", "Total Earned", "Payable", "Net", "Earnings")

    # Format 4: Transaction Date & Revenue
    elif get_col("Transaction Date") and (get_col("USD Revenue") or get_col("Revenue")):
        sale_month_col = get_col("Transaction Date")
        store_col = get_col("Store", "Service", "Platform") or "DSP"
        isrc_col = get_col("ISRC")
        title_col = get_col("Track Title", "Title")
        amount_col = get_col("USD Revenue", "Revenue", "Amount")

    # Format 5: Too Lost / Royalty Date & Amount (earning month vs transaction date)
    elif get_col("Royalty Date") and get_col("Amount"):
        sale_month_col = get_col("Royalty Date") # Prefer Royalty Date as earning month
        store_col = get_col("Service", "Store", "DSP") or "Too Lost"
        isrc_col = get_col("ISRC")
        title_col = get_col("Track", "Title", "Track Title")
        amount_col = get_col("Amount", "Net Amount")

    # Format 6: CD Baby / Month & Year
    elif get_col("Track Title") and get_col("Month") and get_col("Year"):
        month_col = get_col("Month")
        year_col = get_col("Year")
        store_col = get_col("Retailer", "Store", "Partner") or "CD Baby"
        isrc_col = get_col("ISRC")
        title_col = get_col("Track Title", "Title")
        amount_col = get_col("Amount", "Net Payable", "Earnings", "Total")

    # Generic Fallback Mapper
    else:
        sale_month_col = get_col("sale_month", "sales_period", "date", "royalty_date", "month", "period")
        store_col = get_col("store", "channel", "dsp", "retailer", "service", "platform")
        isrc_col = get_col("isrc", "track_id", "recording_id")
        title_col = get_col("title", "track_title", "song_title", "song", "track")
        amount_col = get_col("earnings_usd", "earnings", "net_payable", "amount", "total", "revenue", "net")

    if not amount_col or (not sale_month_col and not (month_col and year_col)):
        raise NormalizationError(
            f"Unsupported statement format in file '{filename}'. Missing required date or revenue columns. "
            f"Found columns: {headers}"
        )

    normalized: List[Dict[str, Any]] = []

    for row in rows:
        # Extract date
        if month_col and year_col:
            m_raw = str(row.get(month_col, "")).strip()
            y_raw = str(row.get(year_col, "")).strip()
            sale_month = parse_month_string(f"{y_raw}-{m_raw}")
        else:
            sale_month = parse_month_string(row.get(sale_month_col))

        if not sale_month:
            continue

        store = str(row.get(store_col, "Unknown")).strip() if store_col else "Unknown"
        isrc = str(row.get(isrc_col, "")).strip() if isrc_col else ""
        title = str(row.get(title_col, "Untitled")).strip() if title_col else "Untitled"
        
        raw_amt = clean_currency(row.get(amount_col, 0.0))
        
        # Gross vs Net adjustment (Section 4.2)
        if is_gross and f_dist is not None:
            earnings_usd = raw_amt * (1.0 - f_dist)
        else:
            earnings_usd = raw_amt

        normalized.append({
            "sale_month": sale_month,
            "store": store if store else "Unknown",
            "isrc": isrc,
            "title": title if title else "Untitled",
            "earnings_usd": earnings_usd,
            "source_file": filename
        })

    return normalized


def parse_csv_or_tsv_content(content_str: str, filename: str = "", f_dist: Optional[float] = None, is_gross: bool = False) -> List[Dict[str, Any]]:
    """Parse CSV, TSV, or TXT tabular content."""
    lines = [line for line in content_str.splitlines() if line.strip()]
    if not lines:
        return []

    # Detect delimiter
    first_line = lines[0]
    delimiter = "\t" if "\t" in first_line and first_line.count("\t") >= first_line.count(",") else ","
    
    reader = csv.DictReader(lines, delimiter=delimiter)
    rows = list(reader)
    return detect_and_normalize_table(rows, filename=filename, f_dist=f_dist, is_gross=is_gross)
