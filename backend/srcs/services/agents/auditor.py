from typing import Any, Optional

from srcs.logger import logger
from srcs.schemas.state import ClaimWorkflowState
from srcs.services.agents.rotating_llm import rotating_llm


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
            "cluster_validation": validation,
        }
    )

    feedback_block = f"\n    Reviewer feedback: {feedback}\n" if feedback else ""

    return f"""
    You are the final Aggregator for an insurance claim workflow.
    Synthesize the validated outputs into a concise final review for a human officer.
    Do not perform a new adversarial validation pass. The cluster Validator results below
    already records citation/verdict mistakes and unresolved issues.

    Case Facts (Tagged Documents): {case_facts.get('tagged_documents', {})}
    Policy Terms: {policy}
    Liability Analysis: {liability}
    Damage Analysis: {damage}
    Fraud Indicators: {fraud}
    Payout Calculation: {payout}
    Cluster Validation Results: {validation}
{feedback_block}
    Final response shape:
    {{
        "data": {{
            "summary": "short final claim summary",
            "final_recommendation": "approve" | "escalate" | "decline",
            "validation_status": "valid" | "issues_found" | "unresolved",
            "unresolved_issues": ["string"],
            "human_review_notes": "string"
        }},
        "reasoning": "brief synthesis rationale"
    }}
    """


async def _auditor_llm_call(
    state: ClaimWorkflowState, feedback: Optional[str] = None
) -> dict[str, Any]:
    """Single LLM round-trip for final synthesis."""
    prompt = _build_auditor_prompt(state, feedback=feedback)
    response = await rotating_llm.send_message_get_json(prompt, temperature=0.0)
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

    auditor_results = {
        "summary": synthesis.get("summary", "Final synthesis complete."),
        "final_recommendation": synthesis.get(
            "final_recommendation", "escalate" if unresolved else "approve"
        ),
        "validation_status": synthesis.get(
            "validation_status", "issues_found" if unresolved else "valid"
        ),
        "unresolved_issues": synthesis.get(
            "unresolved_issues", list(invalid_clusters.values()) if unresolved else []
        ),
        "human_review_notes": synthesis.get("human_review_notes", ""),
    }

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
