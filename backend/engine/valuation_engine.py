"""
Master Valuation Engine for Advance Royalty Sizing.
Coordinates the entire deterministic pipeline from raw uploaded statement rows to final offers and provenance.
"""
from typing import List, Dict, Any, Optional
from .config import DEFAULT_CONFIG
from .normalizer import detect_and_normalize_table, parse_csv_or_tsv_content, NormalizationError
from .ingestion_rules import apply_ingestion_rules
from .catalog_pricer import compute_catalog_advance
from .new_release_pricer import compute_new_release_advance
from .schedule_builder import build_and_validate_schedule
from .provenance import build_provenance_and_flags


class ValuationEngine:
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = {**DEFAULT_CONFIG, **(config or {})}

    def update_config(self, new_config: Dict[str, Any]):
        self.config.update(new_config)

    def evaluate_deal(
        self,
        statement_rows: List[Dict[str, Any]],
        term: int = 5,
        post_recoup_share: float = 0.90,
        rho: float = 0.50,
        singles_contracted: int = 0,
        rights_scope: str = "sound_recording",
        is_gross: bool = False,
        distributor_fee: Optional[float] = None,
        r_win: int = 3,
        payment_tranches: Optional[List[Dict[str, Any]]] = None,
        artist_metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Execute full valuation pipeline on normalized statement rows (Advance Engine V3).
        """
        flags: List[str] = []

        # Validate pre-recoupment split (rho) against menu choices (Change B)
        rho_choices = self.config.get("RHO_CHOICES", (0.40, 0.45, 0.50, 0.55, 0.60))
        if not any(abs(rho - c) < 1e-4 for c in rho_choices):
            return {
                "success": False,
                "error": f"INVALID_RHO: Pre-recoupment split {rho} is not one of the allowed menu choices {rho_choices}.",
                "flags": ["INVALID_RHO"],
                "detailed_flags": [{
                    "code": "INVALID_RHO",
                    "severity": "blocking",
                    "title": "Invalid Recoupment Split",
                    "description": f"Pre-recoupment split must be one of {rho_choices}."
                }]
            }

        # Scope check (Section 4.3): Only sound recording is currently supported
        if rights_scope.lower() not in ["sound_recording", "sound recording", "recording"]:
            return {
                "success": False,
                "error": "OUT_OF_SCOPE: Sizing is currently calibrated for sound-recording rights only. Songwriting and combined rights are out of scope.",
                "flags": ["OUT_OF_SCOPE"],
                "detailed_flags": [{
                    "code": "OUT_OF_SCOPE",
                    "severity": "blocking",
                    "title": "Out of Sizing Scope",
                    "description": "Requested rights scope is outside the empirical sound-recording sizing engine."
                }]
            }

        # Step 2 & 3: Ingestion Rules & Data Validation
        ingestion_res = apply_ingestion_rules(statement_rows, config=self.config)
        if not ingestion_res.is_priceable:
            return {
                "success": False,
                "error": ingestion_res.rejection_reason or "Statement data failed admission criteria.",
                "flags": ingestion_res.flags,
                "detailed_flags": [
                    {
                        "code": f,
                        "severity": "blocking" if f == "INSUFFICIENT_HISTORY" else "advisory",
                        "title": f.replace("_", " ").title(),
                        "description": "Fewer than 6 usable statement months were provided."
                    }
                    for f in ingestion_res.flags
                ]
            }

        if is_gross:
            if distributor_fee is None or distributor_fee <= 0:
                return {
                    "success": False,
                    "error": "Distributor fee percentage is required when statements are gross.",
                    "flags": ["GROSS_STATEMENTS"]
                }
            flags.append("GROSS_BASIS_APPLIED")

        # Step 4, 5, 6: Catalogue Advance (Engine V3)
        catalog_res = compute_catalog_advance(
            usable_rows=ingestion_res.usable_rows,
            usable_months=ingestion_res.usable_months,
            monthly_totals=ingestion_res.monthly_totals,
            term=term,
            post_recoup_share=post_recoup_share,
            rho=rho,
            r_win=r_win,
            config=self.config
        )

        # Step 7, 8, 9, 10: New-Release Advance
        new_release_res = compute_new_release_advance(
            usable_rows=ingestion_res.usable_rows,
            usable_months=ingestion_res.usable_months,
            r0=catalog_res.r0,
            n_contracted=singles_contracted,
            term=catalog_res.term,
            rho_t=catalog_res.rho_t,
            config=self.config
        )

        # Step 11: Payment Schedule
        schedule_res = None
        if singles_contracted > 0:
            schedule_res = build_and_validate_schedule(
                raw_tranches=payment_tranches,
                a_new=new_release_res.a_new,
                n_contracted=singles_contracted,
                term=catalog_res.term
            )

        # Step 12: Flags and Provenance Block
        provenance = build_provenance_and_flags(
            catalog_res=catalog_res,
            new_release_res=new_release_res,
            schedule_res=schedule_res,
            ingestion_res=ingestion_res,
            config=self.config,
            artist_metadata=artist_metadata
        )

        # Format Final Result Response
        a_catalog = round(catalog_res.a_catalog, 2)
        a_new = round(new_release_res.a_new, 2) if (new_release_res and new_release_res.is_available and new_release_res.a_new is not None) else None
        a_total = round(a_catalog + (a_new or 0.0), 2)

        # Calculate All-Year Estimations (1Y, 2Y, 3Y, 4Y, 5Y)
        multi_year_estimates = []
        for t_year in [1, 2, 3, 4, 5]:
            cat_t = compute_catalog_advance(
                usable_rows=ingestion_res.usable_rows,
                usable_months=ingestion_res.usable_months,
                monthly_totals=ingestion_res.monthly_totals,
                term=t_year,
                post_recoup_share=post_recoup_share,
                rho=rho,
                r_win=r_win,
                config=self.config
            )
            nr_t = compute_new_release_advance(
                usable_rows=ingestion_res.usable_rows,
                usable_months=ingestion_res.usable_months,
                r0=cat_t.r0,
                n_contracted=singles_contracted,
                term=cat_t.term,
                rho_t=cat_t.rho_t,
                config=self.config
            )
            a_cat_t = round(cat_t.a_catalog, 2)
            a_nr_t = round(nr_t.a_new, 2) if (nr_t and nr_t.is_available and nr_t.a_new is not None) else 0.0
            a_tot_t = round(a_cat_t + a_nr_t, 2)

            multi_year_estimates.append({
                "term_years": t_year,
                "label": f"{t_year} Year{'s' if t_year > 1 else ''}",
                "a_catalog": a_cat_t,
                "a_new": a_nr_t,
                "a_total": a_tot_t,
                "k_base": round(cat_t.k_base, 3),
                "k_active": round(cat_t.k_t, 3),
                "rho_t_pct": round(cat_t.rho_t * 100, 1),
                "ttr_years": round(cat_t.ttr_years, 2),
                "months_to_recoup": round(cat_t.months_to_recoup, 1),
                "margin_recoup": round(cat_t.margin_recoup, 2),
                "margin_tail": round(cat_t.margin_tail, 2),
                "expected_gross": round(cat_t.expected_gross, 2),
                "expected_return_pct": round(cat_t.expected_return * 100, 1),
                "risk_discount_pct": round(cat_t.risk_discount * 100, 2),
                "new_release_range": {
                    "low": round(nr_t.range_lo, 2) if (nr_t and nr_t.range_lo) else None,
                    "high": round(nr_t.range_hi, 2) if (nr_t and nr_t.range_hi) else None
                } if (nr_t and nr_t.is_available) else None
            })

        return {
            "success": True,
            "artist": artist_metadata or {"name": "Artist"},
            "deal_terms": {
                "term_years": catalog_res.term,
                "post_recoup_share_pct": round(post_recoup_share * 100, 1),
                "singles_contracted": singles_contracted,
                "rho": catalog_res.rho_t,
                "recoupment_split_pct": round(catalog_res.rho_t * 100, 1),
                "months_to_recoup": round(catalog_res.months_to_recoup, 1)
            },
            "headline_offers": {
                "a_catalog": a_catalog,
                "a_new": a_new,
                "a_total": a_total,
                "new_release_range": {
                    "low": round(new_release_res.range_lo, 2) if new_release_res and new_release_res.range_lo else None,
                    "high": round(new_release_res.range_hi, 2) if new_release_res and new_release_res.range_hi else None
                } if new_release_res and new_release_res.is_available else None
            },
            "expected_margin": {
                "margin_recoup": round(catalog_res.margin_recoup, 2),
                "margin_tail": round(catalog_res.margin_tail, 2),
                "expected_gross": round(catalog_res.expected_gross, 2),
                "expected_return_pct": round(catalog_res.expected_return * 100, 1),
                "expected_return": round(catalog_res.expected_return, 4),
                "months_to_recoup": round(catalog_res.months_to_recoup, 1)
            },
            "multi_year_estimates": multi_year_estimates,
            "catalog_analytics": {
                "r0": round(catalog_res.r0, 2),
                "r0_last": round(catalog_res.r0_last, 2),
                "r0_window_months": catalog_res.r0_window_months,
                "ttr_years": round(catalog_res.ttr_years, 2),
                "months_to_recoup": round(catalog_res.months_to_recoup, 1),
                "decay_coverage_pct": round(catalog_res.decay_coverage * 100, 2),
                "d_decay": round(catalog_res.d_decay, 4),
                "d_decay_pct": round(catalog_res.d_decay * 100, 2),
                "d_conc": round(catalog_res.d_conc, 4),
                "d_conc_pct": round(catalog_res.d_conc * 100, 2),
                "d_age_pct": round((catalog_res.d_age or 0.0) * 100, 2),
                "d_stream_pct": round((catalog_res.d_stream or 0.0) * 100, 2),
                "gini_raw": round(catalog_res.gini_raw, 3) if catalog_res.gini_raw is not None else None,
                "gini_concentration": round(catalog_res.gini_star, 3) if catalog_res.gini_star is not None else None,
                "k_base": round(catalog_res.k_base, 2),
                "k_t": round(catalog_res.k_t, 2),
                "e_multiplier": round(catalog_res.e_multiplier, 3),
                "song_count": catalog_res.song_count,
                "top_1_share_pct": round(catalog_res.top_1_share * 100, 1),
                "top_5_share_pct": round(catalog_res.top_5_share * 100, 1),
                "risk_discount_pct": round(catalog_res.risk_discount * 100, 2),
                "top_songs": [
                    {
                        **s,
                        "monthly_rev": round(s.get("share", 0.0) * catalog_res.r0, 2),
                        "advance_allocation": round(s.get("share", 0.0) * a_catalog, 2)
                    }
                    for s in catalog_res.per_song_decay
                ]
            },
            "new_release_analytics": {
                "observable_releases_count": new_release_res.observable_releases_count,
                "usable_releases_count": new_release_res.usable_releases_count,
                "m0_hat": round(new_release_res.m0_hat, 2) if new_release_res.m0_hat else None,
                "lifetime_multiple_l": round(new_release_res.lifetime_multiple_l, 2) if new_release_res.lifetime_multiple_l else None,
                "r_tail": round(new_release_res.r_tail, 4) if new_release_res.r_tail else None,
                "decay_shape": new_release_res.decay_shape,
                "usable_releases": new_release_res.usable_releases_summary
            } if new_release_res else None,
            "payment_schedule": {
                "tranches": schedule_res.tranches if schedule_res else [],
                "at_risk_share_pct": round(schedule_res.at_risk_share * 100, 1) if schedule_res else 0.0,
                "at_risk_amount": round(schedule_res.at_risk_amount, 2) if schedule_res else 0.0
            } if schedule_res else None,
            "flags": provenance["flags"],
            "detailed_flags": provenance["detailed_flags"],
            "provenance": provenance
        }
