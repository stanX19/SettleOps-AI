"""Adjuster Request Agent.

Triggered when the calculated payout exceeds 40 % of the policy cap,
indicating a high-value claim that warrants a physical inspection before
final approval.  The agent produces a structured inspection brief that an
officer can download and forward to a field adjuster.
"""
from __future__ import annotations

import re
from typing import Any

from srcs.schemas.state import ClaimWorkflowState


_THRESHOLD_RATIO = 0.40  # verified_total / policy_cap threshold
_MONEY_RE = r"RM\s*([0-9][0-9,]*(?:\.\d{1,2})?)"


def _money_to_float(value: str) -> float:
    return float(value.replace(",", ""))


def _find_money_after(pattern: str, text: str) -> float | None:
    match = re.search(pattern + r".{0,120}?" + _MONEY_RE, text, flags=re.IGNORECASE | re.DOTALL)
    if not match:
        return None
    return _money_to_float(match.group(1))


def _find_adjuster_report_doc(state: ClaimWorkflowState) -> dict[str, Any] | None:
    """Find the uploaded adjuster report in the workflow document list."""
    for doc in state.get("documents", []) or []:
        filename = str(doc.get("filename") or "").lower()
        if (
            doc.get("doc_type") == "adjuster_report"
            or doc.get("slot") == "adjuster_report"
            or filename.startswith("adjuster_report_")
        ):
            return doc
    return None


def _extract_adjuster_costs(report_text: str) -> dict[str, float | None]:
    """Extract repair quotation range from adjuster report text."""
    min_cost = _find_money_after(r"Adjuster\s+Min\.?\s+Estimated\s+Cost", report_text)
    max_cost = _find_money_after(r"Adjuster\s+Max\.?\s+Estimated\s+Cost", report_text)

    if min_cost is None or max_cost is None:
        final_total = re.search(
            r"FINAL\s+TOTAL\s+COST\s+ESTIMATE.{0,80}?"
            + _MONEY_RE
            + r".{0,40}?"
            + _MONEY_RE,
            report_text,
            flags=re.IGNORECASE | re.DOTALL,
        )
        if final_total:
            min_cost = min_cost if min_cost is not None else _money_to_float(final_total.group(1))
            max_cost = max_cost if max_cost is not None else _money_to_float(final_total.group(2))

    return {
        "adjuster_min_repair_myr": min_cost,
        "adjuster_max_repair_myr": max_cost,
        "report_panel_quotation_myr": _find_money_after(r"Workshop\s+Estimated\s+Repair\s+Cost", report_text),
        "adjuster_recommended_myr": _find_money_after(
            r"recommend(?:ed|)\s+(?:approving\s+)?(?:a\s+)?maximum\s+repair\s+cost\s+of",
            report_text,
        ),
    }


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
    """Review the uploaded adjuster report after the HITL pause resumes."""
    report_doc = _find_adjuster_report_doc(state)
    damage_res = state.get("damage_results", {}) or {}

    if report_doc is None:
        return {
            "adjuster_results": {
                "inspection_required": True,
                "adjuster_verdict": "insufficient_adjuster_data",
                "quotation_within_range": None,
                "recommendation_to_auditor": (
                    "Adjuster report was expected but could not be found in uploaded documents."
                ),
                "status": "adjuster_report_missing",
            },
            "trace_log": ["[AdjusterRequest] Adjuster report missing after resume."],
        }

    report_text = str(report_doc.get("content") or "")
    extracted = _extract_adjuster_costs(report_text)
    panel_quote = damage_res.get("verified_total")
    panel_quote_myr = (
        float(panel_quote)
        if panel_quote is not None
        else extracted.get("report_panel_quotation_myr")
    )
    min_cost = extracted.get("adjuster_min_repair_myr")
    max_cost = extracted.get("adjuster_max_repair_myr")

    if panel_quote_myr is None or min_cost is None or max_cost is None:
        verdict = "insufficient_adjuster_data"
        recommended_action = "escalate"
        within_range = None
        variance_myr = None
        recommendation = (
            "Could not extract a complete adjuster min/max range or panel quotation. "
            "Auditor should escalate or request a clearer adjuster report."
        )
    else:
        within_range = min_cost <= panel_quote_myr <= max_cost
        variance_myr = 0.0 if within_range else (
            panel_quote_myr - max_cost if panel_quote_myr > max_cost else min_cost - panel_quote_myr
        )
        verdict = "acceptable" if within_range else "outside_range"
        recommended_action = "approve" if within_range else "decline"
        recommendation = (
            "Panel quotation is within the adjuster assessed repair range. "
            "Proceed subject to policy, liability, and fraud checks."
            if within_range
            else (
                f"Panel quotation is outside the adjuster assessed repair range by "
                f"MYR {variance_myr:,.2f}. Recommend decline or request a revised quotation."
            )
        )

    return {
        "adjuster_results": {
            "inspection_required": True,
            "adjuster_report_filename": report_doc.get("filename"),
            "adjuster_min_repair_myr": min_cost,
            "adjuster_max_repair_myr": max_cost,
            "adjuster_recommended_myr": extracted.get("adjuster_recommended_myr"),
            "panel_quotation_myr": panel_quote_myr,
            "report_panel_quotation_myr": extracted.get("report_panel_quotation_myr"),
            "quotation_within_range": within_range,
            "adjuster_verdict": verdict,
            "recommended_action_to_auditor": recommended_action,
            "variance_myr": variance_myr,
            "recommendation_to_auditor": recommendation,
            "status": "adjuster_report_reviewed",
        },
        "trace_log": [
            f"[AdjusterRequest] Adjuster report reviewed. Verdict: {verdict}."
        ],
    }
