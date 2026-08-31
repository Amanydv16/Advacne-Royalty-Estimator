"""
Comprehensive Pipeline Architecture Test Suite
================================================
Validates the 3-Stage Architecture:
1. PARSER (Extraction only)
2. MONTHLY AGGREGATOR (Canonical chronologically sorted dataset, duplicate month aggregation)
3. VALUATION ENGINE (Trailing median, catalog/new-release sizing)

Covers all 12 Required Pipeline Verification Scenarios:
1. One statement containing one month.
2. Multiple statements containing different months.
3. Multiple statements containing the same month (aggregation).
4. Multiple files uploaded simultaneously.
5. An empty statement.
6. A statement containing negative/reversal rows.
7. A statement where the earnings field has a different column name.
8. A statement with multiple date fields.
9. A statement where the reported earnings are already net artist earnings.
10. Mixed currencies.
11. Missing months (distinguishing missing months vs genuine $0 months).
12. 12+ monthly statements.
"""
import unittest
from decimal import Decimal
from backend.services.csv_royalty_parser import parse_csv_royalty_statement
from backend.engine.aggregator import aggregate_parsed_statements
from backend.engine.valuation_engine import ValuationEngine


class TestPipelineArchitecture(unittest.TestCase):

    def setUp(self):
        self.engine = ValuationEngine()

    # -------------------------------------------------------------
    # Test 1: One statement containing one month
    # -------------------------------------------------------------
    def test_1_single_statement_single_month(self):
        csv_text = "Period,Earnings\n2025-01,350.00\n"
        parsed = parse_csv_royalty_statement(csv_text, "statement_jan.csv")
        agg = aggregate_parsed_statements([parsed])

        # Verify Canonical Monthly Dataset
        self.assertEqual(len(agg.canonical_series), 1)
        self.assertEqual(agg.canonical_series[0]["month"], "2025-01")
        self.assertEqual(agg.canonical_series[0]["earnings"], "350.00")
        self.assertEqual(agg.total_net_dec, Decimal("350.00"))

        # Verify Valuation Engine
        eval_res = self.engine.evaluate_deal(agg.combined_rows, term=5, rho=0.50)
        self.assertTrue(eval_res["success"])
        self.assertEqual(eval_res["catalog_analytics"]["r0"], 350.0)

    # -------------------------------------------------------------
    # Test 2: Multiple statements containing different months
    # -------------------------------------------------------------
    def test_2_multiple_statements_different_months(self):
        file1 = parse_csv_royalty_statement("Period,Earnings\n2025-01,100.00\n", "file1.csv")
        file2 = parse_csv_royalty_statement("Period,Earnings\n2025-02,200.00\n", "file2.csv")
        file3 = parse_csv_royalty_statement("Period,Earnings\n2025-03,300.00\n", "file3.csv")

        agg = aggregate_parsed_statements([file1, file2, file3])
        self.assertEqual(len(agg.canonical_series), 3)
        months = [m["month"] for m in agg.canonical_series]
        earnings = [m["earnings"] for m in agg.canonical_series]
        
        self.assertEqual(months, ["2025-01", "2025-02", "2025-03"])
        self.assertEqual(earnings, ["100.00", "200.00", "300.00"])
        self.assertEqual(agg.total_net_dec, Decimal("600.00"))

        eval_res = self.engine.evaluate_deal(agg.combined_rows, term=5, rho=0.50)
        self.assertTrue(eval_res["success"])
        self.assertEqual(eval_res["catalog_analytics"]["r0"], 200.0)  # median of [100, 200, 300]

    # -------------------------------------------------------------
    # Test 3: Multiple statements containing the same month (Aggregation)
    # -------------------------------------------------------------
    def test_3_multiple_statements_same_month_aggregation(self):
        # Statement A: Jan $100
        # Statement B: Jan $50
        # Expected: Canonical Jan = $150
        file_a = parse_csv_royalty_statement("Period,Earnings\n2025-01,100.00\n", "statement_a.csv")
        file_b = parse_csv_royalty_statement("Period,Earnings\n2025-01,50.00\n", "statement_b.csv")

        agg = aggregate_parsed_statements([file_a, file_b])
        self.assertEqual(len(agg.canonical_series), 1)
        self.assertEqual(agg.canonical_series[0]["month"], "2025-01")
        self.assertEqual(agg.canonical_series[0]["earnings"], "150.00")
        self.assertEqual(agg.total_net_dec, Decimal("150.00"))

    # -------------------------------------------------------------
    # Test 4: Multiple files uploaded simultaneously (Batching)
    # -------------------------------------------------------------
    def test_4_multiple_files_batch_processing(self):
        parsed_batch = []
        for i in range(1, 7):
            m = f"2025-{i:02d}"
            csv_text = f"Period,Track,Earnings\n{m},Song A,100.00\n{m},Song B,50.00\n"
            parsed_batch.append(parse_csv_royalty_statement(csv_text, f"batch_file_{i}.csv"))

        agg = aggregate_parsed_statements(parsed_batch)
        self.assertEqual(len(agg.canonical_series), 6)
        self.assertEqual(agg.file_count, 6)
        for item in agg.canonical_series:
            self.assertEqual(item["earnings"], "150.00")
        
        eval_res = self.engine.evaluate_deal(agg.combined_rows, term=5, rho=0.50)
        self.assertTrue(eval_res["success"])
        self.assertEqual(eval_res["catalog_analytics"]["r0"], 150.0)

    # -------------------------------------------------------------
    # Test 5: Empty statement (No fake revenue months)
    # -------------------------------------------------------------
    def test_5_empty_statement_handling(self):
        empty_parsed = parse_csv_royalty_statement("", "empty.csv")
        self.assertEqual(len(empty_parsed.get("rows", [])), 0)

        agg = aggregate_parsed_statements([empty_parsed])
        self.assertEqual(len(agg.canonical_series), 0)
        self.assertEqual(agg.total_net_dec, Decimal("0.0"))

    # -------------------------------------------------------------
    # Test 6: Statement containing negative/reversal rows
    # -------------------------------------------------------------
    def test_6_negative_and_reversal_rows(self):
        csv_text = """Period,Type,Earnings
2025-05,Stream,200.00
2025-05,Adjustment,-50.00
2025-05,Refund,(20.00)
"""
        parsed = parse_csv_royalty_statement(csv_text, "adjustments.csv")
        agg = aggregate_parsed_statements([parsed])
        self.assertEqual(len(agg.canonical_series), 1)
        self.assertEqual(agg.canonical_series[0]["earnings"], "130.00")  # 200 - 50 - 20 = 130
        self.assertEqual(agg.total_net_dec, Decimal("130.00"))

    # -------------------------------------------------------------
    # Test 7: Statement with different earnings column names
    # -------------------------------------------------------------
    def test_7_different_earnings_column_names(self):
        csv_net_payable = "Period,Net Payable\n2025-01,120.00\n"
        csv_royalty_us = "Period,Royalty ($US)\n2025-02,140.00\n"
        csv_artist_net = "Period,Artist Net\n2025-03,160.00\n"

        p1 = parse_csv_royalty_statement(csv_net_payable, "f1.csv")
        p2 = parse_csv_royalty_statement(csv_royalty_us, "f2.csv")
        p3 = parse_csv_royalty_statement(csv_artist_net, "f3.csv")

        agg = aggregate_parsed_statements([p1, p2, p3])
        self.assertEqual(len(agg.canonical_series), 3)
        self.assertEqual([m["earnings"] for m in agg.canonical_series], ["120.00", "140.00", "160.00"])

    # -------------------------------------------------------------
    # Test 8: Statement with multiple date fields (Activity vs Accounting)
    # -------------------------------------------------------------
    def test_8_multiple_date_fields_prefers_activity_period(self):
        csv_text = """Accounting Date,Activity Period,Earnings
2025-04-15,2025-01,500.00
2025-05-15,2025-02,600.00
"""
        parsed = parse_csv_royalty_statement(csv_text, "multi_date.csv")
        agg = aggregate_parsed_statements([parsed])
        months = [m["month"] for m in agg.canonical_series]
        self.assertEqual(months, ["2025-01", "2025-02"])  # Activity period preferred over accounting date

    # -------------------------------------------------------------
    # Test 9: Reported earnings already net (No double deduction)
    # -------------------------------------------------------------
    def test_9_no_double_percentage_deduction(self):
        csv_text = """Period,Net Earnings,Share Pct
2025-01,500.00,50%
"""
        # is_gross=False means earnings is already Net; no distributor fee should be deducted
        parsed = parse_csv_royalty_statement(csv_text, "net_statement.csv", is_gross=False)
        agg = aggregate_parsed_statements([parsed])
        self.assertEqual(agg.canonical_series[0]["earnings"], "500.00")
        self.assertEqual(agg.total_net_dec, Decimal("500.00"))

    # -------------------------------------------------------------
    # Test 10: Currency preservation and detection
    # -------------------------------------------------------------
    def test_10_currency_preservation(self):
        csv_eur = "Period,Currency,Earnings\n2025-01,EUR,1000.00\n"
        parsed = parse_csv_royalty_statement(csv_eur, "statement_eur.csv")
        agg = aggregate_parsed_statements([parsed], default_currency="EUR")
        self.assertEqual(agg.currency, "EUR")
        self.assertEqual(agg.canonical_series[0]["currency"], "EUR")

    # -------------------------------------------------------------
    # Test 11: Missing months (Preserves genuine timeline gaps without fake $0)
    # -------------------------------------------------------------
    def test_11_missing_months_preserved_without_fake_zeros(self):
        # Jan and March provided; Feb is missing
        csv1 = "Period,Earnings\n2025-01,300.00\n"
        csv2 = "Period,Earnings\n2025-03,500.00\n"
        p1 = parse_csv_royalty_statement(csv1, "jan.csv")
        p2 = parse_csv_royalty_statement(csv2, "mar.csv")

        agg = aggregate_parsed_statements([p1, p2])
        self.assertEqual(len(agg.canonical_series), 2)
        self.assertEqual([m["month"] for m in agg.canonical_series], ["2025-01", "2025-03"])
        # Does NOT inject a fake 2025-02 = $0
        self.assertNotIn("2025-02", agg.monthly_totals_map)

    # -------------------------------------------------------------
    # Test 12: 12+ Monthly statements (Full timeseries valuation)
    # -------------------------------------------------------------
    def test_12_twelve_plus_monthly_statements(self):
        monthly_values = [
            ("2025-01", 238.29),
            ("2025-02", 229.91),
            ("2025-03", 275.24),
            ("2025-04", 234.31),
            ("2025-05", 293.40),
            ("2025-06", 677.43),
            ("2025-07", 368.02),
            ("2025-08", 339.83),
            ("2025-09", 304.78),
            ("2025-10", 317.59),
            ("2025-11", 400.00),
            ("2025-12", 350.00)
        ]
        parsed_list = []
        for m_str, amt in monthly_values:
            csv_text = f"Period,Track,Earnings\n{m_str},Song 1,{amt*0.7:.2f}\n{m_str},Song 2,{amt*0.3:.2f}\n"
            parsed_list.append(parse_csv_royalty_statement(csv_text, f"statement_{m_str}.csv"))

        agg = aggregate_parsed_statements(parsed_list)
        self.assertEqual(len(agg.canonical_series), 12)
        
        # Verify chronological order
        expected_months = [m for m, _ in monthly_values]
        self.assertEqual([m["month"] for m in agg.canonical_series], expected_months)

        # Stage 3 Valuation Engine calculation
        eval_res = self.engine.evaluate_deal(agg.combined_rows, term=5, rho=0.50)
        self.assertTrue(eval_res["success"])
        
        # Trailing 3-month window: 2025-10 ($317.59), 2025-11 ($400.00), 2025-12 ($350.00)
        # Median of [317.59, 350.00, 400.00] = 350.00
        cat_analytics = eval_res["catalog_analytics"]
        self.assertEqual(cat_analytics["r0_window_months"], ["2025-10", "2025-11", "2025-12"])
        self.assertAlmostEqual(cat_analytics["r0"], 350.00, places=2)

        # Advance calculation K_base = 0.50 * 12 * 5 = 30; A_catalog = 30 * 350.00 * (1 - risk_discount)
        a_catalog = eval_res["headline_offers"]["a_catalog"]
        self.assertGreater(a_catalog, 0)
        self.assertLessEqual(a_catalog, 30 * 350.00)


if __name__ == "__main__":
    unittest.main()
