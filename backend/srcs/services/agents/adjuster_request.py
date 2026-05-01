"""Adjuster Request Agent.

Triggered when the calculated payout exceeds 40 % of the policy cap,
indicating a high-value claim that warrants a physical inspection before
final approval.  The agent produces a structured inspection brief that an
officer can download and forward to a field adjuster.
"""
from __future__ import annotations

from typing import Any

from srcs.schemas.state import ClaimWorkflowState


_THRESHOLD_RATIO = 0.40  # verified_total / policy_cap threshold


def should_request_adjuster(state: ClaimWorkflowState) -> bool:
    """Return True if a physical adjuster inspection is warranted."""
    payout_res = state.get("payout_results", {}) or {}
    if payout_res.get("status") == "escalated":
        return False

    damage_res = state.get("damage_results", {}) or {}
    policy_res = state.get("policy_results", {}) or {}

    verified_total = damage_res.get("verified_total")
    if verified_total is None:
        return False

    max_payout = float(policy_res.get("max_payout_myr") or 50_000.0)
    return float(verified_total) > _THRESHOLD_RATIO * max_payout


def adjuster_request_node(state: ClaimWorkflowState) -> dict[str, Any]:
    """Generate a physical inspection request for the field adjuster."""
    damage_res = state.get("damage_results", {}) or {}
    policy_res = state.get("policy_results", {}) or {}
    payout_res = state.get("payout_results", {}) or {}
    case_facts = state.get("case_facts", {}) or {}

    verified_total = float(damage_res.get("verified_total") or 0.0)
    max_payout = float(policy_res.get("max_payout_myr") or 50_000.0)
    ratio_pct = round(verified_total / max_payout * 100, 1) if max_payout else 0.0

    breakdown = payout_res.get("payout_breakdown") or {}
    final_payout = breakdown.get("final_payout_myr", "N/A")
    suspicious_parts = damage_res.get("suspicious_parts") or []

    vehicle_no = (case_facts.get("vehicle_no") or "Unknown")
    insured_name = (case_facts.get("insured_name") or "Unknown")
    accident_date = (case_facts.get("accident_date") or "Unknown")

    inspection_points: list[str] = [
        f"Verify total repair estimate of MYR {verified_total:,.2f} "
        f"({ratio_pct}% of policy cap MYR {max_payout:,.2f}).",
        "Confirm all parts listed in the workshop quote are damaged and present on the vehicle.",
        "Check for evidence of pre-existing damage not related to the reported incident.",
    ]
    if suspicious_parts:
        parts_str = ", ".join(suspicious_parts[:5])
        inspection_points.append(
            f"Flag the following items identified as potentially overpriced or unnecessary: {parts_str}."
        )

    request = {
        "inspection_required": True,
        "trigger_reason": (
            f"Verified damage total (MYR {verified_total:,.2f}) exceeds "
            f"{int(_THRESHOLD_RATIO * 100)}% of policy cap (MYR {max_payout:,.2f})."
        ),
        "vehicle_no": vehicle_no,
        "insured_name": insured_name,
        "accident_date": accident_date,
        "estimated_payout_myr": final_payout,
        "verified_total_myr": verified_total,
        "policy_cap_myr": max_payout,
        "inspection_checklist": inspection_points,
        "status": "awaiting_adjuster",
    }

    return {
        "adjuster_results": request,
        "status": "awaiting_adjuster",
        "trace_log": [
            f"[AdjusterRequest] Physical inspection requested. "
            f"Verified total MYR {verified_total:,.2f} > "
            f"{int(_THRESHOLD_RATIO * 100)}% of cap MYR {max_payout:,.2f}."
        ],
    }


def wait_for_adjuster_node(state: ClaimWorkflowState) -> dict[str, Any]:
    """HITL pause point — graph is interrupted before this node runs.

    When the officer uploads the adjuster report and triggers resume,
    execution continues past this node to auditor_node.
    """
    return {
        "status": "awaiting_adjuster",
        "trace_log": ["[AdjusterRequest] Waiting for adjuster report upload."],
    }
