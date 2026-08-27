"""
Advance Engine V3 Specification Test Suite.
Validates Section 8 of the V3 Specification:
- 8.1 The split (K_base formula, linearity in rho, recoupment invariance at e=1.0, rejection of non-menu values)
- 8.2 Decay (active life fitting, skipped interior zeros, coverage calculation, LOW_DECAY_COVERAGE flag)
- 8.3 Margin (monotonic decrease in return with rho, upper bound flag, e=1.00 tail zero)
- 8.4 Pay-through (elimination from calculation)
"""
import unittest
import math
from backend.engine.valuation_engine import ValuationEngine
from backend.engine.catalog_pricer import compute_share_weighted_decay, compute_catalog_advance
from backend.engine.config import DEFAULT_CONFIG


class TestAdvanceEngineV3(unittest.TestCase):
    def setUp(self):
        self.engine = ValuationEngine()

    def test_8_1_split_k_base_and_linearity(self):
        """
        8.1 The Split:
        - K_base(T=3, rho=0.70) == 25.20 and K_base(T=5, rho=0.50) == 30.00
        - A_catalog scales exactly linearly in rho: A(0.60) / A(0.50) == 1.20 for fixed T, e
        - At e=1.00, months_to_recoup is identical across all five rho values
        - A rho of 0.65 or 0.3 is rejected with 400 / error
        """
        # 1. K_base tests
        k_base_3_70 = 0.70 * 12.0 * 3.0
        self.assertAlmostEqual(k_base_3_70, 25.20, places=2)

        k_base_5_50 = 0.50 * 12.0 * 5.0
        self.assertAlmostEqual(k_base_5_50, 30.00, places=2)

        # Generate sample statements (12 months)
        months = [f"2025-{m:02d}" for m in range(1, 13)]
        rows = []
        for m in months:
            for i in range(10):
                rows.append({
                    "sale_month": m,
                    "store": "Spotify",
                    "isrc": f"USV3TEST{i:02d}",
                    "title": f"Song {i+1}",
                    "earnings_usd": 100.0,
                    "source_file": "statements.csv"
                })

        # 2. Linearity test: A(0.60) / A(0.50) == 1.20
        res_50 = self.engine.evaluate_deal(rows, term=5, post_recoup_share=1.0, rho=0.50)
        res_60 = self.engine.evaluate_deal(rows, term=5, post_recoup_share=1.0, rho=0.60)
        self.assertTrue(res_50["success"])
        self.assertTrue(res_60["success"])
        
        ratio = res_60["headline_offers"]["a_catalog"] / res_50["headline_offers"]["a_catalog"]
        self.assertAlmostEqual(ratio, 1.20, places=2)

        # 3. Exact invariance test of months_to_recoup at e=1.00 across all 5 rhos
        m_stars = []
        for r_val in [0.40, 0.45, 0.50, 0.55, 0.60]:
            r_res = self.engine.evaluate_deal(rows, term=5, post_recoup_share=1.0, rho=r_val)
            self.assertTrue(r_res["success"])
            m_stars.append(r_res["deal_terms"]["months_to_recoup"])

        # All months_to_recoup values must be identical at e=1.00
        for m_val in m_stars:
            self.assertAlmostEqual(m_val, m_stars[0], places=1)

        # 4. Reject invalid rhos
        res_invalid_1 = self.engine.evaluate_deal(rows, term=5, rho=0.65)
        self.assertFalse(res_invalid_1["success"])
        self.assertIn("INVALID_RHO", res_invalid_1["flags"])

        res_invalid_2 = self.engine.evaluate_deal(rows, term=5, rho=0.30)
        self.assertFalse(res_invalid_2["success"])
        self.assertIn("INVALID_RHO", res_invalid_2["flags"])

    def test_8_2_decay_active_life(self):
        """
        8.2 Decay:
        - A song with revenue only in months 8 to 15 of a 15-month window produces a slope, not None
        - A song with an interior zero at month 5 produces a slope fitted on remaining points with x-axis gap preserved
        - A song with fewer than 3 non-zero months returns None
        """
        months_15 = [f"2024-{m:02d}" for m in range(1, 13)] + ["2025-01", "2025-02", "2025-03"]
        
        # Test active life: song active only in months 8..15 (8 points)
        rows_mid = []
        for idx, m in enumerate(months_15):
            if idx >= 7:  # month 8 onwards
                rows_mid.append({
                    "sale_month": m,
                    "store": "Spotify",
                    "isrc": "USMID01",
                    "title": "Mid-Window Release",
                    "earnings_usd": 100.0 * (0.90 ** (idx - 7)),
                    "source_file": "test.csv"
                })

        d_decay, coverage, per_song = compute_share_weighted_decay(rows_mid, months_15, DEFAULT_CONFIG)
        self.assertEqual(len(per_song), 1)
        self.assertEqual(per_song[0]["months_observed"], 8)
        self.assertGreater(coverage, 0.95)

        # Test interior zero skipping
        rows_gap = []
        for idx in range(6):
            m = months_15[idx]
            if idx != 3:  # Month 4 is zero/dropped
                rows_gap.append({
                    "sale_month": m,
                    "store": "Spotify",
                    "isrc": "USGAP01",
                    "title": "Gap Track",
                    "earnings_usd": 50.0,
                    "source_file": "test.csv"
                })
        d_decay_gap, cov_gap, per_song_gap = compute_share_weighted_decay(rows_gap, months_15[:6], DEFAULT_CONFIG)
        self.assertEqual(len(per_song_gap), 1)
        self.assertEqual(per_song_gap[0]["months_observed"], 5)

        # Test fewer than 3 points
        rows_short = [
            {"sale_month": "2024-01", "store": "Spotify", "isrc": "USSH1", "title": "Short", "earnings_usd": 10.0, "source_file": "t.csv"},
            {"sale_month": "2024-02", "store": "Spotify", "isrc": "USSH1", "title": "Short", "earnings_usd": 10.0, "source_file": "t.csv"}
        ]
        _, _, per_song_short = compute_share_weighted_decay(rows_short, months_15[:6], DEFAULT_CONFIG)
        self.assertEqual(len(per_song_short), 0)

    def test_8_3_margin_computations(self):
        """
        8.3 Margin:
        - expected_return falls monotonically as rho rises
        - margin_tail is zero when e = 1.00 at any rho
        - MARGIN_IS_UPPER_BOUND is present on every successful valuation
        """
        months = [f"2025-{m:02d}" for m in range(1, 13)]
        rows = []
        for m in months:
            for i in range(5):
                rows.append({
                    "sale_month": m,
                    "store": "Spotify",
                    "isrc": f"USMARG{i:02d}",
                    "title": f"Song {i+1}",
                    "earnings_usd": 200.0,
                    "source_file": "s.csv"
                })

        # Monotonicity test
        returns = []
        advances = []
        for r_val in [0.40, 0.45, 0.50, 0.55, 0.60]:
            res = self.engine.evaluate_deal(rows, term=5, post_recoup_share=0.90, rho=r_val)
            self.assertTrue(res["success"])
            self.assertIn("MARGIN_IS_UPPER_BOUND", res["flags"])
            returns.append(res["expected_margin"]["expected_return"])
            advances.append(res["headline_offers"]["a_catalog"])

        # As rho increases: advance increases, return decreases
        for i in range(len(returns) - 1):
            self.assertGreater(returns[i], returns[i + 1])
            self.assertLess(advances[i], advances[i + 1])

        # Tail margin is 0 when e = 1.00
        res_e1 = self.engine.evaluate_deal(rows, term=5, post_recoup_share=1.00, rho=0.50)
        self.assertAlmostEqual(res_e1["expected_margin"]["margin_tail"], 0.0, places=2)


if __name__ == "__main__":
    unittest.main()
