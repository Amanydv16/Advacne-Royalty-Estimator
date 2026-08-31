"""
Regression Test Suite for Data Handoff and Ingestion Sizing Pipeline.
Verifies that:
1. Rule 3(b) (Partial Trailing Month Drop) executes before Rule 3(c) (Missing Feed Exclusion).
2. Trailing incomplete months with delayed DSP feeds (e.g. Spotify not yet reporting in June while Apple Music is present)
   do NOT trigger false feed exclusion of Spotify in earlier months.
3. R0 correctly reflects the trailing median of usable complete months.
4. Final valuation consumes the uncorrupted canonical monthly dataset.
"""
import unittest
from backend.engine.config import DEFAULT_CONFIG
from backend.engine.ingestion_rules import apply_ingestion_rules
from backend.engine.catalog_pricer import compute_catalog_advance, compute_r0
from backend.engine.valuation_engine import ValuationEngine
from backend.engine.aggregator import aggregate_parsed_statements


class TestDataHandoffRegression(unittest.TestCase):
    def setUp(self):
        # 6-month test case matching the user's report
        # 2026-01: $578.29 ($550.00 Spotify + $28.29 Apple Music)
        # 2026-02: $505.69 ($477.40 Spotify + $28.29 Apple Music)
        # 2026-03: $450.47 ($422.18 Spotify + $28.29 Apple Music)
        # 2026-04: $357.77 ($329.48 Spotify + $28.29 Apple Music)
        # 2026-05: $265.57 ($237.28 Spotify + $28.29 Apple Music)
        # 2026-06: $20.24  ($0.00 Spotify / lag + $20.24 Apple Music)
        self.raw_rows = []
        monthly_specs = [
            ("2026-01", 550.00, 28.29, 18),
            ("2026-02", 477.40, 28.29, 22),
            ("2026-03", 422.18, 28.29, 25),
            ("2026-04", 329.48, 28.29, 23),
            ("2026-05", 237.28, 28.29, 21),
            ("2026-06", 0.00, 20.24, 21),
        ]

        for m, sp_rev, am_rev, track_count in monthly_specs:
            if sp_rev > 0:
                sp_per_track = sp_rev / (track_count - 1)
                for t_idx in range(track_count - 1):
                    self.raw_rows.append({
                        "sale_month": m,
                        "store": "Spotify",
                        "isrc": f"US-TEST-SP-{t_idx+1:03d}",
                        "title": f"Spotify Track {t_idx+1}",
                        "earnings_usd": sp_per_track,
                        "earnings_exact_str": f"{sp_per_track:.4f}",
                        "source_file": "distrokid_statement.csv"
                    })
            if am_rev > 0:
                self.raw_rows.append({
                    "sale_month": m,
                    "store": "Apple Music",
                    "isrc": "US-TEST-AM-001",
                    "title": "Apple Music Track 1",
                    "earnings_usd": am_rev,
                    "earnings_exact_str": f"{am_rev:.2f}",
                    "source_file": "distrokid_statement.csv"
                })

    def test_ingestion_drops_partial_month_and_preserves_spotify(self):
        """Verify Rule 3b drops 2026-06 and Rule 3c does NOT purge Spotify."""
        ing_res = apply_ingestion_rules(self.raw_rows, config=DEFAULT_CONFIG)
        self.assertTrue(ing_res.is_priceable)

        # 2026-06 must be dropped as a partial trailing month
        self.assertIn("PARTIAL_MONTH_EXCLUDED", ing_res.flags)
        self.assertIn("2026-06", ing_res.dropped_months)
        self.assertEqual(ing_res.usable_months, ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"])

        # Spotify must NOT be excluded as a missing feed
        self.assertNotIn("Spotify", ing_res.excluded_stores)
        self.assertEqual(len(ing_res.excluded_stores), 0)
        self.assertNotIn("MISSING_FEED_DETECTED", ing_res.flags)

        # Usable monthly totals must preserve full revenue (~$578 down to ~$265)
        self.assertAlmostEqual(ing_res.monthly_totals["2026-01"], 578.29, delta=0.05)
        self.assertAlmostEqual(ing_res.monthly_totals["2026-05"], 265.57, delta=0.05)

    def test_valuation_engine_produces_correct_r0_and_advance(self):
        """Verify valuation engine uses correct R0 ($357.77) instead of collapsed $28."""
        engine = ValuationEngine()
        val_res = engine.evaluate_deal(
            statement_rows=self.raw_rows,
            term=5,
            post_recoup_share=0.90,
            rho=0.50,
            singles_contracted=5
        )

        cat_analytics = val_res.get("catalog_analytics", {})
        headlines = val_res.get("headline_offers", {})

        # R0 should be median(450.47, 357.77, 265.57) = $357.77
        r0 = cat_analytics.get("r0")
        self.assertIsNotNone(r0)
        self.assertAlmostEqual(r0, 357.77, delta=0.1)

        # R0_last should be May 2026 revenue ($265.57)
        r0_last = cat_analytics.get("r0_last")
        self.assertIsNotNone(r0_last)
        self.assertAlmostEqual(r0_last, 265.57, delta=0.1)

        # K_base for 5-year at rho=0.50 should be 30.0x
        self.assertAlmostEqual(cat_analytics.get("k_base"), 30.0, places=1)

        # Advance should be in the ~$7,000-$9,000 range, NOT ~$850
        a_catalog = headlines.get("a_catalog")
        self.assertIsNotNone(a_catalog)
        self.assertGreater(a_catalog, 6000.0)
        self.assertLess(a_catalog, 12000.0)

    def test_aggregator_r0_median_matches_usable_baseline(self):
        """Verify aggregator computes r0_median consistent with Rule 3b."""
        parsed_mock = [{
            "statement_metadata": {"source_file": "results.csv", "currency": "USD"},
            "rows": self.raw_rows,
            "monthly_breakdown": [],
            "warnings": []
        }]
        agg_res = aggregate_parsed_statements(parsed_mock)

        # Aggregator should report R0 = $357.77 over usable months ['2026-03', '2026-04', '2026-05']
        self.assertAlmostEqual(agg_res.r0_median, 357.77, delta=0.1)
        self.assertEqual(agg_res.r0_window_months, ["2026-03", "2026-04", "2026-05"])


if __name__ == "__main__":
    unittest.main()
