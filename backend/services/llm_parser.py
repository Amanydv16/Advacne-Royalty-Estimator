"""
LLM-Powered Royalty Statement Parser
=====================================
Uses GPT-4o-mini to parse royalty statement CSVs/text files from any distributor,
even non-standard or exotic formats that the rule-based normalizer cannot handle.

Flow:
  1. Rule-based normalizer attempts to parse the file first (fast & free).
  2. If it fails or returns < 3 rows, LLM Parser is called as fallback.
  3. GPT receives the first 40 rows of the raw file + column headers and returns
     structured JSON that maps to the standard 5-field schema.
  4. Results are validated before being passed to the valuation engine.

Standard output schema:
    [
      {
        "sale_month": "YYYY-MM",
        "store": "Spotify" | "Apple Music" | etc.,
        "isrc": "USXXX0000000" | "",
        "title": "Song Title",
        "earnings_usd": 12.34
      },
      ...
    ]
"""

import os
import re
import json
import csv
import io
import urllib.request
import urllib.error
from typing import List, Dict, Any, Optional, Tuple


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_openai_key() -> str:
    """Load OpenAI API key from environment or .env file."""
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if key:
        return key

    # Try .env in project root
    import pathlib
    for env_path in [
        pathlib.Path(__file__).resolve().parent.parent.parent / ".env",
        pathlib.Path(os.getcwd()) / ".env",
    ]:
        if env_path.exists():
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("OPENAI_API_KEY="):
                            val = line.split("=", 1)[1].strip().strip("'\"")
                            if val:
                                os.environ["OPENAI_API_KEY"] = val
                                return val
            except Exception:
                pass

    return ""


def _call_openai(messages: List[Dict], model: str = "gpt-4o-mini", temperature: float = 0.0) -> Optional[str]:
    """
    Call the OpenAI Chat Completions API and return the assistant message content.
    Uses stdlib urllib so no extra dependencies are needed.
    """
    key = _load_openai_key()
    if not key:
        return None

    payload = json.dumps({
        "model": model,
        "temperature": temperature,
        "messages": messages,
        "response_format": {"type": "json_object"},
        "max_tokens": 4096,
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=payload,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "User-Agent": "MoneTunes-RoyaltyEngine/2.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data["choices"][0]["message"]["content"]
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8")
        except Exception:
            pass
        print(f"[LLMParser] OpenAI HTTP {e.code}: {body[:300]}")
        return None
    except Exception as e:
        print(f"[LLMParser] OpenAI call error: {e}")
        return None


# ---------------------------------------------------------------------------
# Core LLM Parser
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are an expert music royalty statement parser.

Your job is to read a raw royalty statement (CSV or tabular text) and extract every
revenue row into a normalized JSON array. Each element must have EXACTLY these keys:

  - "sale_month"   : string, "YYYY-MM" format (the month the royalty was EARNED, not paid)
  - "store"        : string, DSP name e.g. "Spotify", "Apple Music", "YouTube", "Amazon", "Deezer", etc.
  - "isrc"         : string, the ISRC code if present (e.g. "USQX92100001"), or "" if absent
  - "title"        : string, the track/song title
  - "earnings_usd" : number, net earnings in USD (already converted if given in other currency; use 0.0 if negative or missing)

Rules:
- Include ALL data rows (one per track per month per store).
- If multiple rows exist for the same track+month+store, keep them all (do NOT aggregate).
- If a currency other than USD is given, convert at approximate market rate or flag it in "store" as "[non-USD]".
- If "earnings_usd" is negative, set it to 0.0.
- If "sale_month" cannot be determined, skip that row.
- If "title" is missing, use "Untitled".
- Preserve ISRC exactly as found in the file.

Respond with a JSON object with a single key "rows" containing the array:
{"rows": [...]}
"""


def _prepare_sample(content_str: str, max_chars: int = 12000) -> str:
    """
    Prepare the file sample to send to GPT.
    Sends header + first ~40 data rows, truncated to max_chars.
    """
    lines = [l for l in content_str.splitlines() if l.strip()]
    if not lines:
        return content_str[:max_chars]

    # Find the header line (first line with common royalty column words)
    header_idx = 0
    header_keywords = {"month", "date", "title", "isrc", "store", "earnings", "amount",
                       "revenue", "usd", "royalty", "sale", "period", "track"}
    for i, line in enumerate(lines[:10]):
        words = set(re.sub(r"[^a-z ]", " ", line.lower()).split())
        if words & header_keywords:
            header_idx = i
            break

    # Take header + up to 40 rows
    sample_lines = lines[header_idx: header_idx + 41]
    sample = "\n".join(sample_lines)
    return sample[:max_chars]


def parse_with_llm(
    content_str: str,
    filename: str = "",
    f_dist: Optional[float] = None,
    is_gross: bool = False,
) -> Tuple[List[Dict[str, Any]], bool]:
    """
    Parse a royalty statement string using GPT-4o-mini.

    Returns:
        (rows, success)  where rows is the normalized list and success is True if GPT
        returned valid data.
    """
    sample = _prepare_sample(content_str)

    user_message = f"""Parse this royalty statement file.
Filename: {filename or 'unknown'}

--- RAW STATEMENT (first 40 rows) ---
{sample}
--- END ---

Return the normalized rows as JSON: {{"rows": [...]}}"""

    response_text = _call_openai([
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ])

    if not response_text:
        return [], False

    try:
        data = json.loads(response_text)
        raw_rows = data.get("rows", [])
    except (json.JSONDecodeError, KeyError) as e:
        print(f"[LLMParser] JSON parse error: {e} — response: {response_text[:200]}")
        return [], False

    if not isinstance(raw_rows, list) or not raw_rows:
        return [], False

    # Validate and clean each row
    normalized: List[Dict[str, Any]] = []
    month_re = re.compile(r"^\d{4}-\d{2}$")

    for row in raw_rows:
        if not isinstance(row, dict):
            continue

        sale_month = str(row.get("sale_month", "")).strip()
        if not month_re.match(sale_month):
            # Try to fix partial dates
            m = re.search(r"(\d{4})[^\d](\d{1,2})", sale_month)
            if m:
                sale_month = f"{m.group(1)}-{int(m.group(2)):02d}"
            else:
                continue  # skip unparseable dates

        store = str(row.get("store", "Unknown")).strip() or "Unknown"
        isrc = str(row.get("isrc", "")).strip()
        title = str(row.get("title", "Untitled")).strip() or "Untitled"

        try:
            raw_amt = float(row.get("earnings_usd", 0.0) or 0.0)
        except (TypeError, ValueError):
            raw_amt = 0.0

        earnings_usd = max(0.0, raw_amt)

        # Apply gross→net conversion if requested
        if is_gross and f_dist is not None:
            earnings_usd = earnings_usd * (1.0 - f_dist)

        normalized.append({
            "sale_month": sale_month,
            "store": store,
            "isrc": isrc,
            "title": title,
            "earnings_usd": round(earnings_usd, 6),
            "source_file": filename,
            "parsed_by": "llm",
        })

    print(f"[LLMParser] Parsed {len(normalized)} rows from '{filename}' via GPT-4o-mini.")
    return normalized, len(normalized) > 0


# ---------------------------------------------------------------------------
# Schema Detection (LLM-based)
# ---------------------------------------------------------------------------

SCHEMA_DETECT_SYSTEM = """You are an expert in music royalty statement formats.

Analyze the column headers and sample rows provided and return a JSON object describing:
{
  "distributor": "DistroKid" | "TuneCore" | "CD Baby" | "Too Lost" | "DashGo" | "AWAL" | "Believe" | "The Orchard" | "Sony" | "BMG" | "Vydia" | "Black17" | "Other",
  "format_confidence": 0.0-1.0,
  "sale_month_col": "exact column name for the earning month/date",
  "store_col": "exact column name for the DSP/store, or null",
  "isrc_col": "exact column name for ISRC, or null",
  "title_col": "exact column name for track title, or null",
  "amount_col": "exact column name for earnings/revenue in USD",
  "currency": "USD" | "EUR" | "GBP" | "other",
  "is_gross": true | false,
  "notes": "any important notes about the format"
}
"""


def detect_schema_with_llm(content_str: str, filename: str = "") -> Optional[Dict[str, Any]]:
    """
    Use GPT to detect the schema/column mapping of a royalty statement.
    Useful for pre-identifying format before handing off to the rule-based parser.
    """
    sample = _prepare_sample(content_str, max_chars=3000)

    user_msg = f"""Identify the royalty statement format and column mappings.
Filename: {filename or 'unknown'}

--- HEADERS AND SAMPLE ROWS ---
{sample}
--- END ---"""

    response_text = _call_openai([
        {"role": "system", "content": SCHEMA_DETECT_SYSTEM},
        {"role": "user", "content": user_msg},
    ])

    if not response_text:
        return None

    try:
        return json.loads(response_text)
    except json.JSONDecodeError:
        return None


# ---------------------------------------------------------------------------
# Smart Parser (Rule-Based + LLM Fallback)
# ---------------------------------------------------------------------------

def smart_parse(
    content_str: str,
    filename: str = "",
    f_dist: Optional[float] = None,
    is_gross: bool = False,
    min_rows_for_rule_based: int = 3,
) -> Dict[str, Any]:
    """
    Main entrypoint: Try rule-based parser first, fall back to LLM if needed.

    Returns:
        {
            "rows": [...],          # normalized rows
            "parser_used": "rule_based" | "llm" | "failed",
            "row_count": int,
            "llm_schema": {...} | None,  # schema detection result if LLM was used
        }
    """
    # Import here to avoid circular dependency
    from backend.engine.normalizer import parse_csv_or_tsv_content, NormalizationError

    rule_rows: List[Dict[str, Any]] = []
    rule_error: Optional[str] = None

    # --- Step 1: Try rule-based parser ---
    try:
        rule_rows = parse_csv_or_tsv_content(content_str, filename=filename, f_dist=f_dist, is_gross=is_gross)
    except NormalizationError as e:
        rule_error = str(e)
        print(f"[SmartParser] Rule-based parser failed for '{filename}': {e}")
    except Exception as e:
        rule_error = str(e)
        print(f"[SmartParser] Unexpected rule-based error for '{filename}': {e}")

    if rule_rows and len(rule_rows) >= min_rows_for_rule_based:
        print(f"[SmartParser] Rule-based parser succeeded: {len(rule_rows)} rows from '{filename}'.")
        return {
            "rows": rule_rows,
            "parser_used": "rule_based",
            "row_count": len(rule_rows),
            "llm_schema": None,
            "rule_error": None,
        }

    # --- Step 2: LLM Fallback ---
    openai_key = _load_openai_key()
    if not openai_key:
        print(f"[SmartParser] No OpenAI key configured — cannot use LLM fallback.")
        return {
            "rows": rule_rows,
            "parser_used": "rule_based" if rule_rows else "failed",
            "row_count": len(rule_rows),
            "llm_schema": None,
            "rule_error": rule_error,
        }

    reason = f"only {len(rule_rows)} rows" if rule_rows else (rule_error or "no data")
    print(f"[SmartParser] Rule-based gave {reason}. Calling LLM parser for '{filename}'...")

    llm_rows, llm_success = parse_with_llm(content_str, filename=filename, f_dist=f_dist, is_gross=is_gross)

    if llm_success and len(llm_rows) >= min_rows_for_rule_based:
        return {
            "rows": llm_rows,
            "parser_used": "llm",
            "row_count": len(llm_rows),
            "llm_schema": None,
            "rule_error": rule_error,
        }

    # Both failed — return best available
    best_rows = llm_rows if len(llm_rows) > len(rule_rows) else rule_rows
    return {
        "rows": best_rows,
        "parser_used": "failed",
        "row_count": len(best_rows),
        "llm_schema": None,
        "rule_error": rule_error,
    }


# ---------------------------------------------------------------------------
# Batch Parser (for multiple files)
# ---------------------------------------------------------------------------

def smart_parse_files(
    files: List[Dict[str, Any]],
    f_dist: Optional[float] = None,
    is_gross: bool = False,
) -> Dict[str, Any]:
    """
    Parse multiple files and merge rows.
    Each file dict: {"filename": str, "content_str": str}

    Returns merged rows + per-file parser summary.
    """
    all_rows: List[Dict[str, Any]] = []
    file_summaries = []

    for file_info in files:
        fname = file_info.get("filename", "unknown")
        content = file_info.get("content_str", "")
        if not content.strip():
            continue

        result = smart_parse(content, filename=fname, f_dist=f_dist, is_gross=is_gross)
        all_rows.extend(result["rows"])
        file_summaries.append({
            "filename": fname,
            "parser_used": result["parser_used"],
            "row_count": result["row_count"],
            "rule_error": result.get("rule_error"),
        })

    return {
        "rows": all_rows,
        "total_rows": len(all_rows),
        "files_processed": len(file_summaries),
        "file_summaries": file_summaries,
    }
