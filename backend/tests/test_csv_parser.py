"""
Unit and Precision Test Suite for CSV Royalty Parser.
=====================================================
Validates exact Decimal precision, column detection, date normalization,
summary row deduplication, non-silent warnings, and sample CSV accuracy.
"""
import unittest
from decimal import Decimal
from backend.services.csv_royalty_parser import parse_csv_royalty_statement, clean_exact_decimal, parse_month_string


class TestCSVRoyaltyParser(unittest.TestCase):

    def test_explicit_precision_test(self):
        """
        Explicit Precision Test from User Specification:
        Input:
          100.1234
          72.0903
        Expected:
          172.2137
        Must FAIL if rounded to 172.21!
        """
        csv_text = """date,royalty
2025-01-05,100.1234
2025-01-15,72.0903
"""
        res = parse_csv_royalty_statement(csv_text, "precision_test.csv")
        self.assertEqual(res["status"], "parsed")
        self.assertEqual(len(res["monthly_breakdown"]), 1)
        
        jan = res["monthly_breakdown"][0]
        self.assertEqual(jan["month"], "2025-01")
        self.assertEqual(jan["earnings"], "172.2137")
        self.assertEqual(res["total_earnings"], "172.2137")
        
        # Explicit anti-rounding check
        self.assertNotEqual(jan["earnings"], "172.21")
        self.assertNotEqual(jan["earnings"], "172.214")

    def test_sub_penny_and_tiny_decimals(self):
        """Test preservation of sub-pennies (e.g. 0.000123)."""
        csv_text = """Period,Net Amount
2025-03,0.000123
2025-03,0.000456
"""
        res = parse_csv_royalty_statement(csv_text, "tiny_decimals.csv")
        self.assertEqual(len(res["monthly_breakdown"]), 1)
        self.assertEqual(res["monthly_breakdown"][0]["earnings"], "0.000579")
        self.assertEqual(res["total_earnings"], "0.000579")

    def test_multi_month_and_multi_row_aggregation(self):
        """Test aggregation across multiple rows and months."""
        csv_text = """Date,Track,DSP,Earnings USD
2025-01-05,Track A,Spotify,100.1234
2025-01-15,Track B,Apple Music,72.0903
2025-02-10,Track A,Spotify,150.5555
2025-02-20,Track C,YouTube,38.8966
2025-03-01,Track B,Amazon,200.0000
"""
        res = parse_csv_royalty_statement(csv_text, "multi_month.csv")
        self.assertEqual(len(res["monthly_breakdown"]), 3)
        
        breakdown = {m["month"]: m["earnings"] for m in res["monthly_breakdown"]}
        self.assertEqual(breakdown["2025-01"], "172.2137")
        self.assertEqual(breakdown["2025-02"], "189.4521")
        self.assertEqual(breakdown["2025-03"], "200.0000")
        self.assertEqual(res["total_earnings"], "561.6658")

    def test_currency_symbols_and_negative_adjustments(self):
        """Test stripping currency symbols and handling negative numbers / accounting format."""
        csv_text = """Month,Royalty
2025-04,$150.75
2025-04,-$20.25
2025-04,($10.50)
"""
        res = parse_csv_royalty_statement(csv_text, "currency_negative.csv")
        self.assertEqual(res["currency"], "USD")
        self.assertEqual(res["monthly_breakdown"][0]["earnings"], "120.00")
        self.assertEqual(res["total_earnings"], "120.00")

    def test_date_format_normalization(self):
        """Test normalization of various date formats without altering monetary values."""
        csv_text = """Date,Royalty
01/15/2025,10.00
2025-02-28,20.00
Mar 2025,30.00
202504,40.00
2025/05/01,50.00
"""
        res = parse_csv_royalty_statement(csv_text, "dates.csv")
        months = [m["month"] for m in res["monthly_breakdown"]]
        self.assertEqual(months, ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05"])
        self.assertEqual(res["total_earnings"], "150.00")

    def test_column_name_variants(self):
        """Test detection across various industry column naming conventions."""
        headers_variants = [
            ("Sales Month", "Net Payable"),
            ("Activity Period", "Royalty Amount"),
            ("Reporting Month", "Total Earned"),
            ("Period", "Net Share"),
            ("Date", "Revenue")
        ]
        for date_h, amt_h in headers_variants:
            csv_text = f"""{date_h},{amt_h}
2025-01,123.4567
"""
            res = parse_csv_royalty_statement(csv_text, f"{amt_h}.csv")
            self.assertEqual(res["monthly_breakdown"][0]["earnings"], "123.4567", f"Failed for header {amt_h}")

    def test_avoids_quantity_and_rate_columns(self):
        """Ensure stream count / units / rates are not picked as royalty amounts."""
        csv_text = """Month,Track,Streams,Download Units,Price Rate,Net Payable
2025-01,Song 1,50000,120,0.004,200.50
2025-01,Song 2,25000,60,0.004,100.25
"""
        res = parse_csv_royalty_statement(csv_text, "streams_vs_royalty.csv")
        self.assertEqual(res["monthly_breakdown"][0]["earnings"], "300.75")

    def test_summary_and_grand_total_row_exclusion(self):
        """Ensure summary and grand total rows are excluded to prevent double counting."""
        csv_text = """Month,Track,Net Revenue
2025-01,Song 1,100.00
2025-01,Song 2,150.00
2025-01,Total,250.00
Grand Total,All,250.00
"""
        res = parse_csv_royalty_statement(csv_text, "summary_exclusion.csv")
        self.assertEqual(res["monthly_breakdown"][0]["earnings"], "250.00")
        self.assertEqual(res["total_earnings"], "250.00")

    def test_metadata_preamble_rows(self):
        """Test CSVs with metadata headers before the actual table."""
        csv_text = """Royalty Statement Report
Artist: The Test Band
Period: Q1 2025
Generated: 2025-04-01

Month,Track,Earnings USD
2025-01,Track 1,80.00
2025-02,Track 1,90.00
"""
        res = parse_csv_royalty_statement(csv_text, "preamble.csv")
        self.assertEqual(len(res["monthly_breakdown"]), 2)
        self.assertEqual(res["total_earnings"], "170.00")

    def test_non_silent_warnings(self):
        """Test that unparseable rows generate warnings with row numbers."""
        csv_text = """Month,Earnings USD
2025-01,100.00
2025-02,invalid_number
2025-03,50.00
"""
        res = parse_csv_royalty_statement(csv_text, "warnings.csv")
        self.assertEqual(len(res["monthly_breakdown"]), 2)
        self.assertEqual(res["total_earnings"], "150.00")
        self.assertTrue(len(res["warnings"]) > 0)
        self.assertIn("invalid_number", res["warnings"][0]["reason"])

    def test_sample_files_accuracy(self):
        """Verify parser against real repository sample files."""
        # 1. islem23_earnings_per_month.csv
        with open("islem23_earnings_per_month.csv", "r", encoding="utf-8") as f:
            islem_content = f.read()
        res_islem = parse_csv_royalty_statement(islem_content, "islem23_earnings_per_month.csv")
        self.assertEqual(len(res_islem["monthly_breakdown"]), 11)
        # Check specific rows
        self.assertEqual(res_islem["monthly_breakdown"][0]["earnings"], "238.29")
        self.assertEqual(res_islem["monthly_breakdown"][5]["earnings"], "677.43")
        self.assertEqual(res_islem["total_earnings"], "3355.26")

        # 2. else_b17_earnings_per_month.csv
        with open("else_b17_earnings_per_month.csv", "r", encoding="utf-8") as f:
            else_content = f.read()
        res_else = parse_csv_royalty_statement(else_content, "else_b17_earnings_per_month.csv")
        self.assertEqual(len(res_else["monthly_breakdown"]), 7)
        self.assertEqual(res_else["monthly_breakdown"][0]["earnings"], "239.99")
        self.assertEqual(res_else["total_earnings"], "1280.13")


if __name__ == "__main__":
    unittest.main()
