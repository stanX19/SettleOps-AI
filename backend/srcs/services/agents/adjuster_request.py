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


def _format_myr(value: float | None) -> str:
    return "unknown" if value is None else f"MYR {value:,.2f}"


def _find_money_after(pattern: str, text: str) -> float | None:
    match = re.search(pattern + r".{0,120}?" + _MONEY_RE, text, flags=re.IGNORECASE | re.DOTALL)
    if not match:
        return None
    return _money_to_float(match.group(1))


def _first_money_after(patterns: list[str], text: str) -> float | None:
    for pattern in patterns:
        value = _find_money_after(pattern, text)
        if value is not None:
            return value
    return None


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
    min_cost = _first_money_after(
        [
            r"Adjuster\s+Min\.?\s+Estimated\s+Cost",
            r"Minimum\s+(?:Repair\s+)?(?:Cost|Estimate|Assessment)",
            r"Min(?:imum)?\s+(?:Recommended\s+)?Repair\s+(?:Cost|Estimate)",
            r"Lower\s+(?:Repair\s+)?(?:Range|Estimate)",
        ],
        report_text,
    )
    max_cost = _first_money_after(
        [
            r"Adjuster\s+Max\.?\s+Estimated\s+Cost",
            r"Maximum\s+(?:Repair\s+)?(?:Cost|Estimate|Assessment)",
            r"Max(?:imum)?\s+(?:Recommended\s+)?Repair\s+(?:Cost|Estimate)",
            r"Upper\s+(?:Repair\s+)?(?:Range|Estimate)",
        ],
        report_text,
    )

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
        "report_panel_quotation_myr": _first_money_after(
            [
                r"Workshop\s+Estimated\s+Repair\s+Cost",
                r"Workshop\s+Quoted\s+Total",
                r"Panel\s+(?:Workshop\s+)?(?:Quotation|Quote|Estimate)",
                r"Repair\s+(?:Quotation|Quote)\s+(?:Submitted|Amount|Total)",
            ],
            report_text,
        ),
        "adjuster_recommended_myr": _first_money_after(
            [
                r"Adjuster\s+Approved\s+Total",
                r"Approved\s+(?:Repair\s+)?Total",
                r"Adjuster\s+Approved\s+(?:Repair\s+)?Cost",
                r"recommend(?:ed|)\s+(?:approving\s+)?(?:a\s+)?maximum\s+repair\s+cost\s+of",
                r"recommended\s+(?:settlement|repair)\s+(?:amount|cost)",
                r"recommended\s+amount\s+of",
                r"approve\s+repair\s+at\s+the\s+adjuster'?s\s+recommended\s+amount\s+of",
                r"approved\s+(?:repair\s+)?(?:amount|cost)",
            ],
            report_text,
        ),
    }


def _build_adjuster_summary_to_auditor(
    *,
    min_cost: float | None,
    max_cost: float | None,
    approved_total: float | None,
    panel_quote_myr: float | None,
    within_range: bool | None,
    variance_myr: float | None,
) -> str:
    range_text = f"{_format_myr(min_cost)} to {_format_myr(max_cost)}"
    quote_text = _format_myr(panel_quote_myr)

    has_range = min_cost is not None and max_cost is not None

    if within_range is True and has_range:
        return (
            f"The adjuster assessed a repair quotation range of {range_text}. "
            f"The panel quotation is {quote_text}, which is within the recommended range. "
            "The quotation appears reasonable based on the adjuster report."
        )

    if within_range is False and has_range:
        return (
            f"The adjuster assessed a repair quotation range of {range_text}. "
            f"The panel quotation is {quote_text}, which is outside the recommended range "
            f"by {_format_myr(variance_myr)}. The quotation may not be reasonable based "
            "on the adjuster report."
        )

    if approved_total is not None and panel_quote_myr is not None:
        if within_range is True:
            return (
                f"The adjuster approved repair cost is {_format_myr(approved_total)}. "
                f"The panel quotation is {quote_text}, which is within the adjuster approved amount. "
                "The quotation appears reasonable based on the adjuster report."
            )
        if within_range is False:
            return (
                f"The adjuster approved repair cost is {_format_myr(approved_total)}. "
                f"The panel quotation is {quote_text}, which exceeds the approved amount "
                f"by {_format_myr(variance_myr)}. The quotation should be declined or revised."
            )

    return (
        f"The adjuster report could not be fully interpreted. Extracted range: {range_text}; "
        f"approved amount: {_format_myr(approved_total)}; "
        f"panel quotation: {quote_text}. Auditor should escalate or request a clearer "
        "adjuster report before relying on the quotation."
    )


def _build_adjuster_audit_finding(
    *,
    filename: str | None,
    min_cost: float | None,
    max_cost: float | None,
    approved_total: float | None,
    panel_quote_myr: float | None,
    within_range: bool | None,
    variance_myr: float | None,
    missing: bool = False,
) -> dict[str, Any]:
    if missing:
        return {
            "available": False,
            "status": "missing",
            "finding": "Adjuster report was requested but no adjuster report document was found.",
            "recommended_action": "escalate",
        }

    prefix = f"Adjuster report {filename}" if filename else "Adjuster report"
    if within_range is True:
        if approved_total is not None:
            return {
                "available": True,
                "comparison_mode": "approved_amount",
                "status": "within_approved_amount",
                "finding": (
                    f"{prefix} places the panel quotation {_format_myr(panel_quote_myr)} "
                    f"within the adjuster approved repair cost {_format_myr(approved_total)}."
                ),
                "recommended_action": "approve",
            }
        return {
            "available": True,
            "comparison_mode": "range",
            "status": "within_range",
            "finding": (
                f"{prefix} places the panel quotation {_format_myr(panel_quote_myr)} "
                f"within the assessed repair range {_format_myr(min_cost)} to {_format_myr(max_cost)}."
            ),
            "recommended_action": "approve",
        }

    if within_range is False:
        if approved_total is not None:
            return {
                "available": True,
                "comparison_mode": "approved_amount",
                "status": "outside_approved_amount",
                "finding": (
                    f"{prefix} shows the panel quotation {_format_myr(panel_quote_myr)} "
                    f"exceeds the adjuster approved repair cost {_format_myr(approved_total)} "
                    f"by {_format_myr(variance_myr)}."
                ),
                "recommended_action": "decline",
            }
        return {
            "available": True,
            "comparison_mode": "range",
            "status": "outside_range",
            "finding": (
                f"{prefix} places the panel quotation {_format_myr(panel_quote_myr)} "
                f"outside the assessed repair range {_format_myr(min_cost)} to {_format_myr(max_cost)} "
                f"by {_format_myr(variance_myr)}."
            ),
            "recommended_action": "decline",
        }

    return {
        "available": True,
        "comparison_mode": "insufficient_data",
        "status": "insufficient_data",
        "finding": (
            f"{prefix} was uploaded, but a complete adjuster range, approved amount, and panel quotation "
            f"could not be extracted. Extracted range: {_format_myr(min_cost)} to "
            f"{_format_myr(max_cost)}; approved amount: {_format_myr(approved_total)}; "
            f"panel quotation: {_format_myr(panel_quote_myr)}."
        ),
        "recommended_action": "escalate",
    }


def should_request_adjuster(state: ClaimWorkflowState) -> bool:
    """Return True if a physical adjuster inspection is warranted.

    Triggers when EITHER condition holds (OR logic):
    - Severity trigger: damage agent produced a non-zero severity estimate AND it exceeds 40%
    - Financial trigger: verified repair total exceeds 40% of policy cap

    Both triggers are evaluated independently so neither silently swallows the other.
    A zero `damage_severity_pct` with an empty `damage_severity_basis` is treated as
    "not estimated" and does not block the financial trigger.
    """
    payout_res = state.get("payout_results", {}) or {}
    if payout_res.get("status") == "escalated":
        return False

    damage_res = state.get("damage_results", {}) or {}
    policy_res = state.get("policy_results", {}) or {}

    # Severity trigger: only fire when the LLM actually produced an estimate
    # (non-zero pct AND non-empty basis string).
    severity_pct = damage_res.get("damage_severity_pct") or 0
    severity_basis = damage_res.get("damage_severity_basis") or ""
    severity_known = bool(severity_pct) and bool(severity_basis)
    severity_trigger = severity_known and float(severity_pct) > 40.0

    # Financial trigger (always evaluated)
    verified_total = damage_res.get("verified_total")
    financial_trigger = False
    if verified_total is not None:
        max_payout = float(policy_res.get("max_payout_myr") or 50_000.0)
        financial_trigger = float(verified_total) > _THRESHOLD_RATIO * max_payout

    return severity_trigger or financial_trigger


def adjuster_request_node(state: ClaimWorkflowState) -> dict[str, Any]:
    """Generate a physical inspection request for the field adjuster."""
    damage_res = state.get("damage_results", {}) or {}
    policy_res = state.get("policy_results", {}) or {}
    payout_res = state.get("payout_results", {}) or {}
    case_facts = state.get("case_facts", {}) or {}

    verified_total = float(damage_res.get("verified_total") or 0.0)
    max_payout = float(policy_res.get("max_payout_myr") or 50_000.0)
    severity_pct = damage_res.get("damage_severity_pct") or 0
    severity_basis = damage_res.get("damage_severity_basis") or ""

    breakdown = payout_res.get("payout_breakdown") or {}
    final_payout = breakdown.get("final_payout_myr", "N/A")
    suspicious_parts = damage_res.get("suspicious_parts") or []

    vehicle_no = (case_facts.get("vehicle_no") or "Unknown")
    insured_name = (case_facts.get("insured_name") or "Unknown")
    accident_date = (case_facts.get("accident_date") or "Unknown")

    financial_severity_pct = round(verified_total / max_payout * 100, 1) if max_payout else 0.0
    severity_known = bool(severity_pct) and bool(severity_basis)
    severity_trigger = severity_known and float(severity_pct) > 40.0
    financial_trigger = float(verified_total) > _THRESHOLD_RATIO * max_payout

    if severity_trigger and financial_trigger:
        adjuster_trigger_type = "both"
        trigger_reason = (
            f"Physical damage severity {severity_pct}% exceeds 40% threshold"
            + (f" ({severity_basis})" if severity_basis else "")
            + f"; and verified repair total MYR {verified_total:,.2f} exceeds "
            f"{int(_THRESHOLD_RATIO * 100)}% of policy cap."
        )
    elif severity_trigger:
        adjuster_trigger_type = "severity"
        trigger_reason = (
            f"Physical damage severity estimated at {severity_pct}% of vehicle body "
            f"exceeds the 40% threshold."
            + (f" ({severity_basis})" if severity_basis else "")
        )
    else:
        adjuster_trigger_type = "financial"
        trigger_reason = (
            f"Verified damage total (MYR {verified_total:,.2f}) is {financial_severity_pct}% "
            f"of policy cap (MYR {max_payout:,.2f}), exceeding the "
            f"{int(_THRESHOLD_RATIO * 100)}% threshold."
        )

    inspection_points: list[str] = [
        f"Physically verify extent of damage — system estimated {severity_pct}% of vehicle body affected."
        if severity_known
        else f"Verify total repair estimate of MYR {verified_total:,.2f} ({financial_severity_pct}% of policy cap).",
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
        "trigger_reason": trigger_reason,
        "vehicle_no": vehicle_no,
        "insured_name": insured_name,
        "accident_date": accident_date,
        "estimated_payout_myr": final_payout,
        "verified_total_myr": verified_total,
        "policy_cap_myr": max_payout,
        "adjuster_trigger_type": adjuster_trigger_type,
        "damage_severity_pct": severity_pct,
        "damage_severity_basis": severity_basis,
        "financial_severity_pct": financial_severity_pct,
        "inspection_checklist": inspection_points,
        "status": "awaiting_adjuster",
    }

    return {
        "adjuster_results": request,
        "status": "awaiting_adjuster",
        "trace_log": [
            f"[AdjusterRequest] Physical inspection requested. "
            + (
                f"Damage severity {severity_pct}% > 40% threshold."
                if severity_pct > 0
                else f"Verified total MYR {verified_total:,.2f} > {int(_THRESHOLD_RATIO * 100)}% of cap MYR {max_payout:,.2f}."
            )
        ],
    }


def wait_for_adjuster_node(state: ClaimWorkflowState) -> dict[str, Any]:
    """Review the uploaded adjuster report after the HITL pause resumes."""
    report_doc = _find_adjuster_report_doc(state)
    damage_res = state.get("damage_results", {}) or {}

    if report_doc is None:
        summary = _build_adjuster_summary_to_auditor(
            min_cost=None,
            max_cost=None,
            approved_total=None,
            panel_quote_myr=None,
            within_range=None,
            variance_myr=None,
        )
        audit_finding = _build_adjuster_audit_finding(
            filename=None,
            min_cost=None,
            max_cost=None,
            approved_total=None,
            panel_quote_myr=None,
            within_range=None,
            variance_myr=None,
            missing=True,
        )
        return {
            "adjuster_results": {
                "inspection_required": True,
                "adjuster_verdict": "insufficient_adjuster_data",
                "quotation_within_range": None,
                "adjuster_audit_finding": audit_finding,
                "adjuster_summary_to_auditor": summary,
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
    approved_total = extracted.get("adjuster_recommended_myr")
    comparison_mode = "insufficient_data"

    if panel_quote_myr is None:
        verdict = "insufficient_adjuster_data"
        recommended_action = "escalate"
        within_range = None
        variance_myr = None
        recommendation = (
            "Could not extract the panel quotation needed for adjuster comparison. "
            "Auditor should escalate or request a clearer adjuster report."
        )
    elif min_cost is not None and max_cost is not None:
        comparison_mode = "range"
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
    elif approved_total is not None:
        comparison_mode = "approved_amount"
        within_range = panel_quote_myr <= approved_total
        variance_myr = 0.0 if within_range else panel_quote_myr - approved_total
        verdict = "acceptable" if within_range else "outside_approved_amount"
        recommended_action = "approve" if within_range else "decline"
        recommendation = (
            "Panel quotation is within the adjuster approved repair amount. "
            "Proceed subject to policy, liability, and fraud checks."
            if within_range
            else (
                f"Panel quotation exceeds the adjuster approved repair amount by "
                f"MYR {variance_myr:,.2f}. Recommend decline or request a revised quotation."
            )
        )
    else:
        verdict = "insufficient_adjuster_data"
        recommended_action = "escalate"
        within_range = None
        variance_myr = None
        recommendation = (
            "Could not extract a complete adjuster min/max range or approved repair amount. "
            "Auditor should escalate or request a clearer adjuster report."
        )
    summary_to_auditor = _build_adjuster_summary_to_auditor(
        min_cost=min_cost,
        max_cost=max_cost,
        approved_total=approved_total,
        panel_quote_myr=panel_quote_myr,
        within_range=within_range,
        variance_myr=variance_myr,
    )
    audit_finding = _build_adjuster_audit_finding(
        filename=report_doc.get("filename"),
        min_cost=min_cost,
        max_cost=max_cost,
        approved_total=approved_total,
        panel_quote_myr=panel_quote_myr,
        within_range=within_range,
        variance_myr=variance_myr,
    )

    return {
        "adjuster_results": {
            "inspection_required": True,
            "adjuster_report_filename": report_doc.get("filename"),
            "adjuster_min_repair_myr": min_cost,
            "adjuster_max_repair_myr": max_cost,
            "adjuster_recommended_myr": extracted.get("adjuster_recommended_myr"),
            "adjuster_comparison_amount_myr": approved_total,
            "adjuster_comparison_mode": comparison_mode,
            "panel_quotation_myr": panel_quote_myr,
            "report_panel_quotation_myr": extracted.get("report_panel_quotation_myr"),
            "quotation_within_range": within_range,
            "adjuster_verdict": verdict,
            "recommended_action_to_auditor": recommended_action,
            "variance_myr": variance_myr,
            "adjuster_audit_finding": audit_finding,
            "adjuster_summary_to_auditor": summary_to_auditor,
            "recommendation_to_auditor": recommendation,
            "status": "adjuster_report_reviewed",
        },
        "trace_log": [
            f"[AdjusterRequest] Adjuster report reviewed. Verdict: {verdict}. "
            f"Panel quotation {_format_myr(panel_quote_myr)} vs adjuster "
            f"{'range ' + _format_myr(min_cost) + ' to ' + _format_myr(max_cost) if min_cost is not None and max_cost is not None else 'approved amount ' + _format_myr(approved_total)}."
        ],
    }
