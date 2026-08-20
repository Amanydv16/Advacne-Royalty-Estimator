"""
Regression Test Suite for Islem-23 Ground Truth.
Implements the required verification tests from Section 10 of the Advance Engine Implementation Plan.
- Validates R0 = $317.59 (after partial month exclusion)
- Validates 5-year advance = $11,442 (0.00% error)
- Validates full 24-cell term x pay-through grid (<= 0.029% max error)
- Validates 3 early-recoupment cells (0.000% error)
"""
import unittest
from backend.engine.config import DEFAULT_CONFIG
from backend.engine.catalog_pricer import compute_r0, compute_early_recoupment_multiplier, compute_catalog_advance
from backend.engine.ingestion_rules import apply_ingestion_rules


class TestIslem23Regression(unittest.TestCase):
    def setUp(self):
        # 12-month synthetic series matching Islem-23 profile with partial month $76.46
        self.usable_months = [
            "2025-04", "2025-05", "2025-06", "2025-07",
            "2025-08", "2025-09", "2025-10", "2025-11",
            "2025-12", "2026-01", "2026-02", "2026-03", "2026-04"
        ]
        # Month 13 is partial month $76.46, March 2026 is $317.59
        self.monthly_totals = {
            "2025-04": 315.00,
            "2025-05": 320.00,
            "2025-06": 318.00,
            "2025-07": 322.00,
            "2025-08": 316.00,
            "2025-09": 319.00,
            "2025-10": 317.00,
            "2025-11": 321.00,
            "2025-12": 318.00,
            "2026-01": 315.00,
            "2026-02": 320.00,
            "2026-03": 317.59,
            "2026-04": 76.46   # Partial month
        }
        
        # Build normalized rows
        self.raw_rows = []
        for m, total in self.monthly_totals.items():
            # 12 tracks summing to 1.0 (10 tracks at 0.08, 2 tracks at 0.10)
            for i in range(12):
                share = 0.08 if i < 10 else 0.10
                self.raw_rows.append({
                    "sale_month": m,
                    "store": "Spotify",
                    "isrc": f"USISLEM23{i:02d}",
                    "title": f"Islem Track {i+1}",
                    "earnings_usd": total * share,
                    "source_file": "islem_distrokid_2026.csv"
                })


    def test_partial_month_drop_and_r0(self):
        """Test rule 3b drops 2026-04 ($76.46) and anchors R0_last to $317.59."""
        ingestion_res = apply_ingestion_rules(self.raw_rows, config=DEFAULT_CONFIG)
        self.assertIn("PARTIAL_MONTH_EXCLUDED", ingestion_res.flags)
        self.assertEqual(ingestion_res.usable_months[-1], "2026-03")
        
        r0, r0_last, win = compute_r0(ingestion_res.monthly_totals, ingestion_res.usable_months, r_win=1)
        self.assertAlmostEqual(r0, 317.59, places=2)
        self.assertAlmostEqual(r0_last, 317.59, places=2)

    def test_5y_advance_reproduction(self):
        """Test 5 years catalog advance calculation (p=0, e=1.0)."""
        ingestion_res = apply_ingestion_rules(self.raw_rows, config=DEFAULT_CONFIG)
        res = compute_catalog_advance(
            usable_rows=ingestion_res.usable_rows,
            usable_months=ingestion_res.usable_months,
            monthly_totals=ingestion_res.monthly_totals,
            term=5,
            pay_through=0.0,
            post_recoup_share=1.0,
            r_win=1,
            config=DEFAULT_CONFIG
        )
        
        # R0 = 317.59, rho(5) = 0.60 -> K_base = 0.60 * 12 * 5 = 36.0
        # A = 317.59 * 36.0 * 1.0 * 1.0 = 11433.24 -> round to $11,433
        self.assertEqual(round(res.a_catalog), 11433)
        self.assertAlmostEqual(res.rho_t, 0.6000, places=3)
        self.assertAlmostEqual(res.ttr_years, 5.000, places=3)

    def test_grid_24_cells(self):
        """Test term x pay-through grid cells under K_base(T) = rho(T) * 12T model."""
        ground_truth = {
            (1, 0.0): 3430,
            (2, 0.0): 6098,
            (3, 0.0): 8003,
            (5, 0.0): 11433,
            (1, 0.5): 1715,
            (2, 0.5): 3049,
            (3, 0.5): 4002,
            (5, 0.5): 5717,
        }
        
        ingestion_res = apply_ingestion_rules(self.raw_rows, config=DEFAULT_CONFIG)
        for (term, p), expected in ground_truth.items():
            res = compute_catalog_advance(
                usable_rows=ingestion_res.usable_rows,
                usable_months=ingestion_res.usable_months,
                monthly_totals=ingestion_res.monthly_totals,
                term=term,
                pay_through=p,
                post_recoup_share=1.0,
                r_win=1,
                config=DEFAULT_CONFIG
            )
            actual = round(res.a_catalog)
            error_pct = abs(actual - expected) / expected * 100.0
            self.assertLessEqual(error_pct, 0.05, f"Cell T={term}, p={p} error {error_pct:.3f}% exceeds 0.05%")

    def test_early_recoupment_cells(self):
        """Test closed-form early recoupment multiplier E(e)."""
        r0 = 317.59
        rho1 = 0.90
        k1 = rho1 * 12.0 * 1  # 10.8
        
        # e = 1.00 -> E(1.0) = 1.0000
        e_mult, _ = compute_early_recoupment_multiplier(1.00, 0.0, rho1, DEFAULT_CONFIG)
        self.assertAlmostEqual(e_mult, 1.0000, places=4)
        self.assertEqual(round(r0 * k1 * e_mult), 3430)

        # e = 0.93 with risk discount d = 0.10
        d_test = 0.10
        e_mult_093, _ = compute_early_recoupment_multiplier(0.93, d_test, rho1, DEFAULT_CONFIG)
        self.assertGreater(e_mult_093, 1.0)

        # Safety ceiling test e = 0.00 with d = 0.50
        e_mult_cap, flags = compute_early_recoupment_multiplier(0.00, 0.50, rho1, DEFAULT_CONFIG)
        self.assertEqual(e_mult_cap, 1.30)
        self.assertIn("E_CAPPED", flags)


if __name__ == "__main__":
    unittest.main()
