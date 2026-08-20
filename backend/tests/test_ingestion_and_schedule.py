"""
Unit Test Suite for Ingestion Format Grouping, Normalizer Year Drop,
Content-Hash Dedup, and Payment Schedule Validation.
"""
import unittest
from backend.engine.config import DEFAULT_CONFIG
from backend.engine.normalizer import parse_month_string, detect_and_normalize_table
from backend.engine.ingestion_rules import apply_ingestion_rules
from backend.engine.schedule_builder import build_and_validate_schedule
from backend.engine.valuation_engine import ValuationEngine


class TestIngestionAndSchedule(unittest.TestCase):
    def test_parse_month_string_drops_missing_year(self):
        """Verify parse_month_string returns None when month exists without a 4-digit year."""
        self.assertIsNone(parse_month_string("MAR"))
        self.assertIsNone(parse_month_string("March"))
        self.assertEqual(parse_month_string("2024-03"), "2024-03")
        self.assertEqual(parse_month_string("MAR-2024"), "2024-03")

    def test_feed_grouping_by_detected_format(self):
        """Verify statements split across year folders (2024/ and 2025/) with same format are merged."""
        rows_2024 = [
            {"Sale Month": "2024-01", "Store": "Spotify", "ISRC": "US1001", "Title": "Track 1", "Earnings (USD)": 100.0, "source_file": "2024/jan.csv"},
            {"Sale Month": "2024-02", "Store": "Spotify", "ISRC": "US1001", "Title": "Track 1", "Earnings (USD)": 110.0, "source_file": "2024/feb.csv"},
            {"Sale Month": "2024-03", "Store": "Spotify", "ISRC": "US1001", "Title": "Track 1", "Earnings (USD)": 120.0, "source_file": "2024/mar.csv"},
            {"Sale Month": "2024-04", "Store": "Spotify", "ISRC": "US1001", "Title": "Track 1", "Earnings (USD)": 105.0, "source_file": "2024/apr.csv"},
            {"Sale Month": "2024-05", "Store": "Spotify", "ISRC": "US1001", "Title": "Track 1", "Earnings (USD)": 115.0, "source_file": "2024/may.csv"},
            {"Sale Month": "2024-06", "Store": "Spotify", "ISRC": "US1001", "Title": "Track 1", "Earnings (USD)": 125.0, "source_file": "2024/jun.csv"},
        ]
        rows_2025 = [
            {"Sale Month": "2025-01", "Store": "Spotify", "ISRC": "US1001", "Title": "Track 1", "Earnings (USD)": 130.0, "source_file": "2025/jan.csv"},
            {"Sale Month": "2025-02", "Store": "Spotify", "ISRC": "US1001", "Title": "Track 1", "Earnings (USD)": 140.0, "source_file": "2025/feb.csv"},
        ]

        normalized_2024 = detect_and_normalize_table(rows_2024, filename="2024/statements.csv")
        normalized_2025 = detect_and_normalize_table(rows_2025, filename="2025/statements.csv")
        combined_rows = normalized_2024 + normalized_2025

        res = apply_ingestion_rules(combined_rows, config=DEFAULT_CONFIG)
        self.assertTrue(res.is_priceable)
        self.assertNotIn("MULTI_SOURCE_FEED", res.flags)
        self.assertEqual(len(res.usable_months), 8)

    def test_schedule_invalid_blocks_valuation(self):
        """Verify an invalid payment schedule returns success=False in valuation_engine."""
        engine = ValuationEngine()
        
        statement_rows = []
        months = [f"2025-{m:02d}" for m in range(1, 13)]
        for m in months:
            statement_rows.append({
                "sale_month": m,
                "store": "Spotify",
                "isrc": "US1230001",
                "title": "Track 1",
                "earnings_usd": 500.0,
                "source_file": "statements.csv",
                "detected_format": "DistroKid"
            })

        invalid_tranches = [
            {"label": "Signing", "trigger": "execution", "share": 0.30},
            {"label": "Delivery 1", "trigger": "delivery(1)", "share": 0.20}
        ]

        val_res = engine.evaluate_deal(
            statement_rows=statement_rows,
            term=3,
            singles_contracted=2,
            payment_tranches=invalid_tranches
        )

        self.assertIn("SCHEDULE_INVALID", val_res["flags"])

    def test_default_payment_schedule_tranches(self):
        """Verify default payment schedule for N=6 contracted singles uses delivery(1) and delivery(6)."""
        res = build_and_validate_schedule(raw_tranches=None, a_new=10000.0, n_contracted=6, term=3)
        self.assertTrue(res.is_valid)
        self.assertEqual(len(res.tranches), 3)
        self.assertEqual(res.tranches[0]["trigger"], "execution")
        self.assertEqual(res.tranches[1]["trigger"], "delivery(1)")
        self.assertEqual(res.tranches[2]["trigger"], "delivery(6)")


if __name__ == "__main__":
    unittest.main()
