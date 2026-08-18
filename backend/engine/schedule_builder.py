"""
Payment Schedule Builder module for the Advance Royalty Engine.
Implements Step 11 of the Advance Engine Implementation Plan.
- Validates payment tranches (Execution / Delivery(j) / Month(m))
- Checks constraints: shares sum to 1.0, j <= N, m <= 12T
- Computes at-risk share and at-risk advance amount
- Triggers SCHEDULE_INVALID, HIGH_AT_RISK_SHARE, SCHEDULE_NOT_DELIVERY_GATED
"""
from typing import List, Dict, Any, Tuple, Optional
import re


class ScheduleResult:
    def __init__(
        self,
        is_valid: bool,
        tranches: List[Dict[str, Any]],
        at_risk_share: float,
        at_risk_amount: float,
        flags: List[str],
        error_message: Optional[str] = None
    ):
        self.is_valid = is_valid
        self.tranches = tranches
        self.at_risk_share = at_risk_share
        self.at_risk_amount = at_risk_amount
        self.flags = flags
        self.error_message = error_message


def build_and_validate_schedule(
    raw_tranches: Optional[List[Dict[str, Any]]],
    a_new: Optional[float],
    n_contracted: int,
    term: int
) -> ScheduleResult:
    """
    Validate and calculate milestone payment tranches for new-release advance.
    """
    flags: List[str] = []

    # Default schedule if not provided: 30% execution, 35% delivery(1), 35% delivery(N) or month
    if not raw_tranches:
        if n_contracted >= 2:
            raw_tranches = [
                {"label": "Signing / Execution", "trigger": "execution", "share": 0.30},
                {"label": f"Delivery of Single 1", "trigger": "delivery(1)", "share": 0.35},
                {"label": f"Delivery of Single {n_contracted}", "trigger": f"delivery({n_contracted})", "share": 0.35}
            ]
        elif n_contracted == 1:
            raw_tranches = [
                {"label": "Signing / Execution", "trigger": "execution", "share": 0.30},
                {"label": "Delivery of Single 1", "trigger": "delivery(1)", "share": 0.70}
            ]
        else:
            raw_tranches = [
                {"label": "Signing / Execution", "trigger": "execution", "share": 1.00}
            ]

    if not raw_tranches:
        flags.append("SCHEDULE_INVALID")
        return ScheduleResult(
            is_valid=False, tranches=[], at_risk_share=0.0, at_risk_amount=0.0,
            flags=flags, error_message="At least one payment tranche is required."
        )

    total_share = sum(float(t.get("share", 0.0)) for t in raw_tranches)
    if abs(total_share - 1.0) > 0.001:
        flags.append("SCHEDULE_INVALID")
        return ScheduleResult(
            is_valid=False, tranches=raw_tranches, at_risk_share=0.0, at_risk_amount=0.0,
            flags=flags, error_message=f"Tranche shares must sum to 1.0 (found {total_share:.3f})."
        )

    has_delivery = False
    at_risk_share = 0.0
    processed_tranches = []
    max_months = 12 * term

    for t in raw_tranches:
        trig = str(t.get("trigger", "")).strip().lower()
        share = float(t.get("share", 0.0))
        label = t.get("label", trig)

        # Validate delivery(j)
        deliv_match = re.match(r"^delivery\((\d+)\)$", trig)
        if deliv_match:
            j = int(deliv_match.group(1))
            if n_contracted > 0 and j > n_contracted:
                flags.append("SCHEDULE_INVALID")
                return ScheduleResult(
                    is_valid=False, tranches=raw_tranches, at_risk_share=0.0, at_risk_amount=0.0,
                    flags=flags, error_message=f"Delivery single index {j} exceeds contracted singles {n_contracted}."
                )
            has_delivery = True
        elif trig == "execution" or trig == "signing":
            at_risk_share += share
        else:
            # Check month(m)
            month_match = re.match(r"^month\((\d+)\)$", trig)
            if month_match:
                m = int(month_match.group(1))
                if m > max_months:
                    flags.append("SCHEDULE_INVALID")
                    return ScheduleResult(
                        is_valid=False, tranches=raw_tranches, at_risk_share=0.0, at_risk_amount=0.0,
                        flags=flags, error_message=f"Tranche month {m} exceeds deal horizon {max_months} months."
                    )
                at_risk_share += share
            else:
                # Unknown trigger - treat as at-risk
                at_risk_share += share

        tranche_amount = (a_new * share) if (a_new is not None) else 0.0
        processed_tranches.append({
            "label": label,
            "trigger": trig,
            "share": round(share, 4),
            "amount": round(tranche_amount, 2)
        })

    if n_contracted > 0 and not has_delivery:
        flags.append("SCHEDULE_NOT_DELIVERY_GATED")

    if at_risk_share > 0.50:
        flags.append("HIGH_AT_RISK_SHARE")

    at_risk_amt = (a_new * at_risk_share) if (a_new is not None) else 0.0

    return ScheduleResult(
        is_valid=True,
        tranches=processed_tranches,
        at_risk_share=round(at_risk_share, 4),
        at_risk_amount=round(at_risk_amt, 2),
        flags=flags
    )
