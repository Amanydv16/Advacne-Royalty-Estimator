"""
Comprehensive Unit Test Suite for Multimodal LLM Royalty Statement Parser.
Uses mocked LLM calls so tests execute fast and offline without real API usage.
"""
import pytest
import json
from unittest.mock import patch
from backend.services.preprocessor import detect_file_type, extract_content_from_file, sample_content_for_llm
from backend.services.llm_parser import parse_royalty_statement, normalize_date_to_yyyy_mm, detect_currency


def test_detect_file_type_magic_bytes():
    """Test file type detection from extension and magic bytes."""
    assert detect_file_type("statement.pdf", b"%PDF-1.4 header") == "pdf"
    assert detect_file_type("scan.png", b"\x89PNG\r\n\x1a\n") == "image"
    assert detect_file_type("data.csv", b"sale_month,store,isrc,title,earnings_usd\n") == "csv"
    assert detect_file_type("sheet.xlsx", b"PK\x03\x04\x14\x00") == "xlsx"


def test_date_normalization_formats():
    """Test robust date normalization into YYYY-MM."""
    assert normalize_date_to_yyyy_mm("January 2026") == "2026-01"
    assert normalize_date_to_yyyy_mm("Jan-26") == "2026-01"
    assert normalize_date_to_yyyy_mm("01/2026") == "2026-01"
    assert normalize_date_to_yyyy_mm("2026-01") == "2026-01"
    assert normalize_date_to_yyyy_mm("2026-01-31") == "2026-01"
    assert normalize_date_to_yyyy_mm("Statement period: Jan 1 - Jan 31, 2026") == "2026-01"


def test_currency_detection():
    """Test currency detection from text headers."""
    assert detect_currency("Total payable in EUR: €1,450.00") == "EUR"
    assert detect_currency("Royalty statement GBP £500") == "GBP"
    assert detect_currency("Standard USD report $350.00") == "USD"


@patch("backend.services.llm_parser._call_openai_multimodal")
def test_pdf_statement_parsing_with_mocked_llm(mock_llm):
    """Test PDF statement parsing with mocked multimodal LLM response."""
    mock_response = {
        "statement_metadata": {
            "artist": "Test Artist",
            "label": "Indie Records",
            "period": "Jan 2026 - Feb 2026",
            "currency": "USD",
            "statement_total_declared": 2632.72
        },
        "extracted_records": [
            {
                "sale_month": "2026-01",
                "store": "Spotify",
                "isrc": "USQX92100001",
                "title": "Hit Track 1",
                "earnings": 1245.30,
                "streams": 450000,
                "downloads": 0,
                "territory": "US",
                "royalty_type": "Streaming"
            },
            {
                "sale_month": "2026-02",
                "store": "Apple Music",
                "isrc": "USQX92100002",
                "title": "Hit Track 2",
                "earnings": 1387.42,
                "streams": 510000,
                "downloads": 15,
                "territory": "WW",
                "royalty_type": "Download"
            }
        ],
        "totals": {
            "declared_gross": None,
            "declared_net": 2632.72
        },
        "extraction_notes": []
    }
    mock_llm.return_value = json.dumps(mock_response)

    pdf_bytes = b"%PDF-1.5 fake statement bytes"
    result = parse_royalty_statement("statement.pdf", pdf_bytes)

    assert result["status"] == "parsed"
    assert result["statement_metadata"]["artist"] == "Test Artist"
    assert len(result["monthly_breakdown"]) == 2
    assert result["monthly_breakdown"][0]["month"] == "2026-01"
    assert result["monthly_breakdown"][0]["net_royalty"] == 1245.30
    assert result["totals"]["net"] == 2632.72
    assert result["reconciliation"]["status"] == "reconciled"
    assert len(result["rows"]) == 2


@patch("backend.services.llm_parser._call_openai_multimodal")
def test_reconciliation_mismatch_warning(mock_llm):
    """Test reconciliation mismatch detection when calculated total differs from declared total."""
    mock_response = {
        "statement_metadata": {
            "artist": "Test Artist",
            "currency": "USD",
            "statement_total_declared": 3000.00
        },
        "extracted_records": [
            {
                "sale_month": "2026-01",
                "store": "Spotify",
                "isrc": "USQX92100001",
                "title": "Single A",
                "earnings": 1500.00
            }
        ],
        "totals": {
            "declared_net": 3000.00
        }
    }
    mock_llm.return_value = json.dumps(mock_response)

    result = parse_royalty_statement("mismatch.csv", b"# statement_total_declared: 3000.00\nsale_month,store,earnings\n2026-01,Spotify,1500")

    assert result["reconciliation"]["status"] == "mismatch"
    assert result["status"] == "needs_review"
    assert result["reconciliation"]["difference"] == 1500.00
    assert any("Reconciliation Mismatch" in w for w in result["warnings"])


@patch("backend.services.llm_parser._call_openai_multimodal")
def test_scanned_image_statement_parsing(mock_llm):
    """Test scanned document image parsing via vision multimodal model."""
    mock_response = {
        "statement_metadata": {
            "artist": "Scanned Artist",
            "currency": "EUR",
            "statement_total_declared": 850.00
        },
        "extracted_records": [
            {
                "sale_month": "2026-03",
                "store": "Deezer",
                "isrc": "FR1234567890",
                "title": "Chanson Un",
                "earnings": 850.00
            }
        ],
        "totals": {"declared_net": 850.00}
    }
    mock_llm.return_value = json.dumps(mock_response)

    img_bytes = b"\x89PNG\r\n\x1a\n fake image bytes"
    result = parse_royalty_statement("scanned_statement.png", img_bytes)

    assert result["statement_metadata"]["currency"] == "EUR"
    assert result["monthly_breakdown"][0]["month"] == "2026-03"
    assert result["totals"]["net"] == 850.00


def test_unsupported_or_empty_file():
    """Test handling of empty or corrupted files."""
    result = parse_royalty_statement("empty.csv", b"")
    assert result["status"] == "failed"
    assert len(result["warnings"]) > 0
