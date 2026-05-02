import re
from typing import Any, Optional

from srcs.logger import logger
from srcs.schemas.state import ClaimWorkflowState
from srcs.services.agents.rotating_llm import rotating_llm
from srcs.services.prompt_service import get_active_prompt


_BULLET_PREFIX_RE = re.compile(r"^\s*(?:[-*\u2022]\s*|\d+[.)]\s*)+")
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")


def _clean_display_text(value: Any, *, preserve_newlines: bool = False) -> str:
    """Normalize model text for compact blackboard display."""
    if value is None:
        return ""
    if isinstance(value, dict):
        text = (
            value.get("issue")
            or value.get("feedback")
            or value.get("summary")
            or value.get("evidence")
            or str(value)
        )
    else:
        text = str(value)

    text = text.replace("\r", "\n")
    if preserve_newlines:
        text = re.sub(r"[ \t\f\v]+", " ", text)
        text = "\n".join(line.strip() for line in text.split("\n") if line.strip())
    else:
        text = text.replace("\n", " ")
        text = re.sub(r"\s+", " ", text).strip()
    text = _BULLET_PREFIX_RE.sub("", text)
    return text.strip(" ;")


def _as_display_points(
    value: Any,
    *,
    max_items: int,
) -> list[str]:
    if isinstance(value, list):
        raw_items = value
    else:
        text = _clean_display_text(value, preserve_newlines=True)
        raw_items = [item for item in re.split(r"\n+|\s*[\u2022;]\s*|\s+-\s+|\s*\|\s*", text) if item]
        if len(raw_items) == 1:
            raw_items = [item for item in _SENTENCE_SPLIT_RE.split(text) if item]

    points: list[str] = []
    for item in raw_items:
        text = _clean_display_text(item)
        if not text:
            continue
        if text not in points:
            points.append(text)
        if len(points) >= max_items:
            break

    return points


def _compact_point_string(
    value: Any,
    *,
    max_items: int,
) -> str:
    points = _as_display_points(
        value,
        max_items=max_items,
    )
    return "\n".join(points)


def _compact_auditor_results(
    synthesis: dict[str, Any],
    *,
    fallback_recommendation: str,
    fallback_validation_status: str,
    fallback_unresolved_issues: list[Any],
) -> dict[str, Any]:
    """Shape auditor output for the compact blackboard card."""
    unresolved_source = synthesis.get("unresolved_issues", fallback_unresolved_issues)
    unresolved_issues = _as_display_points(
        unresolved_source,
        max_items=4,
    )

    return {
        "summary": _compact_point_string(
            synthesis.get("summary", "Final synthesis complete."),
            max_items=3,
        ),
        "final_recommendation": synthesis.get(
            "final_recommendation", fallback_recommendation
        ),
        "validation_status": synthesis.get(
            "validation_status", fallback_validation_status
        ),
        "unresolved_issues": unresolved_issues,
        "human_review_notes": _compact_point_string(
            synthesis.get("human_review_notes", ""),
            max_items=2,
        ),
    }


def _find_citation_payload_paths(value: Any, path: str = "payload") -> list[str]:
    """Find citation payloads that would become aggregator reasoning input."""
    if isinstance(value, dict):
        paths: list[str] = []
        for key, item in value.items():
            child_path = f"{path}.{key}"
            if key == "citations" or key.endswith("_citations"):
                paths.append(child_path)
                continue
            paths.extend(_find_citation_payload_paths(item, child_path))
        return paths
    if isinstance(value, list):
        paths = []
        for index, item in enumerate(value):
            paths.extend(_find_citation_payload_paths(item, f"{path}[{index}]"))
        return paths
    return []


def _assert_no_citations_in_auditor_prompt_payload(payload: dict[str, Any]) -> None:
    """Guard against citation metadata leaking into final synthesis."""
    leaked_paths = _find_citation_payload_paths(payload)
    if leaked_paths:
        raise ValueError(
            "Auditor prompt payload unexpectedly includes citation metadata: "
            + ", ".join(leaked_paths)
        )


def _build_auditor_prompt(state: ClaimWorkflowState, feedback: Optional[str] = None) -> str:
    """Render the final aggregator prompt against validated workflow outputs."""
    case_facts = state.get("case_facts", {})
    policy = state.get("policy_results", {})
    liability = state.get("liability_results", {})
    damage = state.get("damage_results", {})
    fraud = state.get("fraud_results", {})
    payout = state.get("payout_results", {})
    adjuster = state.get("adjuster_results", {})
    validation = {
        "policy": policy.get("_validation", {}),
        "liability": liability.get("_validation", {}),
        "damage": damage.get("_validation", {}),
        "fraud": fraud.get("_validation", {}),
    }

    _assert_no_citations_in_auditor_prompt_payload(
        {
            "case_facts": case_facts,
            "policy_results": policy,
            "liability_results": liability,
            "damage_results": damage,
            "fraud_results": fraud,
            "payout_results": payout,
            "adjuster_results": adjuster,
            "cluster_validation": validation,
        }
    )

    feedback_block = f"\n    Reviewer feedback: {feedback}\n" if feedback else ""
    core_logic = get_active_prompt("auditor")

    return f"""
    {core_logic}

    Case Facts (Tagged Documents): {case_facts.get('tagged_documents', {})}
    Policy Terms: {policy}
    Liability Analysis: {liability}
    Damage Analysis: {damage}
    Fraud Indicators: {fraud}
    Payout Calculation: {payout}
    Adjuster Report Review: {adjuster}
    Cluster Validation Results: {validation}
{feedback_block}
    Blackboard display rules:
    - This output appears in a narrow UI card. Do NOT write paragraphs.
    - Use short point-form fragments only.
    - summary: 2-3 concise bullet points in one string, separated by "\\n".
    - unresolved_issues: max 4 items; format "<Area>: <issue/action>".
    - human_review_notes: max 2 action points in one string, separated by "\\n".
    - Avoid evidence quotations, full narratives, and repeated case facts.

    Final response shape:
    {{
        "data": {{
            "summary": "short point\\nshort point",
            "final_recommendation": "approve" | "escalate" | "decline",
            "validation_status": "valid" | "issues_found" | "unresolved",
            "unresolved_issues": ["Area: short issue/action"],
            "human_review_notes": "short action\\nshort action"
        }},
        "reasoning": "brief synthesis rationale"
    }}
    """


async def _auditor_llm_call(
    state: ClaimWorkflowState, feedback: Optional[str] = None
) -> dict[str, Any]:
    """Single LLM round-trip for final synthesis."""
    prompt = _build_auditor_prompt(state, feedback=feedback)
    response = await rotating_llm.send_message_get_json(
        prompt,
        temperature=0.0,
        mock_data={
            "data": {
                "is_consistent": True,
                "findings": "None (Mocked)",
                "suggested_action": "approve",
                "target_cluster": "none"
            },
            "reasoning": "Mock mode enabled.",
            "citations": []
        }
    )
    raw = response.json_data if response.json_data else {}
    return raw if isinstance(raw, dict) else {}


async def auditor_node(state: ClaimWorkflowState) -> dict[str, Any]:
    """Final aggregator node: synthesize validated results for human review."""
    if state.get("status") == "escalated":
        return {
            "active_challenge": None,
            "trace_log": [
                "[Auditor] Workflow is ESCALATED. Skipping final synthesis until critical data is provided."
            ],
        }

    cluster_results = {
        "policy": state.get("policy_results", {}) or {},
        "liability": state.get("liability_results", {}) or {},
        "damage": state.get("damage_results", {}) or {},
        "fraud": state.get("fraud_results", {}) or {},
    }
    invalid_clusters = {
        name: result.get("_validation", {})
        for name, result in cluster_results.items()
        if result.get("_validation", {}).get("is_valid", True) is False
    }
    unresolved = bool(invalid_clusters)

    try:
        raw = await _auditor_llm_call(state)
        synthesis = raw.get("data", {}) if isinstance(raw.get("data"), dict) else raw
    except Exception as e:
        logger.exception("[Auditor] LLM call failed: %s", e)
        return {
            "auditor_results": {
                "status": "error",
                "summary": f"Auditor error: {e}",
                "final_recommendation": "escalate",
                "validation_status": "unresolved",
                "unresolved_issues": [f"Auditor error: {e}"],
                "human_review_notes": "Final synthesis could not be generated.",
            },
            "auditor_citations": [],
            "status": "inconsistent",
            "active_challenge": None,
            "trace_log": [f"[Auditor] Error during synthesis: {e}"],
        }

    auditor_results = _compact_auditor_results(
        synthesis,
        fallback_recommendation="escalate" if unresolved else "approve",
        fallback_validation_status="issues_found" if unresolved else "valid",
        fallback_unresolved_issues=list(invalid_clusters.values()) if unresolved else [],
    )

    return {
        "auditor_results": auditor_results,
        "auditor_citations": [],
        "status": "inconsistent" if unresolved else "awaiting_approval",
        "active_challenge": None,
        "trace_log": [
            f"[Auditor] Final synthesis complete. Validation valid: {not unresolved}."
        ],
    }


def decision_gate_logic(state: ClaimWorkflowState) -> dict[str, Any]:
    """No-op node that ensures the status is 'awaiting_approval' unless already in a wait state."""
    current_status = state.get("status")
    if current_status in ("inconsistent", "escalated", "awaiting_docs"):
        return {}
    return {"status": "awaiting_approval"}


def decision_router(state: ClaimWorkflowState) -> str:
    """Decision Router: human approval/refiner routing after final aggregation."""
    from srcs.schemas.state import WorkflowNodes, MAX_ITERATIONS, WorkflowAction

    human_decision = state.get("human_decision")
    if human_decision and human_decision.get("action") == WorkflowAction.FORCE_APPROVE:
        return WorkflowNodes.REPORT_GENERATOR

    if state.get("status") == "escalated":
        return WorkflowNodes.DECISION_GATE

    active_challenge = state.get("active_challenge")
    iteration = active_challenge.get("iteration", 0) if active_challenge else 0

    if iteration > MAX_ITERATIONS:
        return WorkflowNodes.REPORT_GENERATOR

    if active_challenge:
        target = active_challenge.get("target_cluster")
        mapping = {
            "policy": WorkflowNodes.POLICY_CLUSTER,
            "liability": WorkflowNodes.LIABILITY_CLUSTER,
            "damage": WorkflowNodes.DAMAGE_CLUSTER,
            "fraud": WorkflowNodes.FRAUD_CLUSTER,
        }
        return mapping.get(target, WorkflowNodes.REFINER)

    if state.get("latest_user_message"):
        return WorkflowNodes.REFINER

    if state.get("status") == "inconsistent":
        return WorkflowNodes.DECISION_GATE

    if human_decision and human_decision.get("action") in (
        WorkflowAction.APPROVE,
        WorkflowAction.FORCE_APPROVE,
    ):
        return WorkflowNodes.REPORT_GENERATOR

    return WorkflowNodes.DECISION_GATE
