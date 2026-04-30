from typing import Any, Optional

from srcs.logger import logger
from srcs.schemas.citations import CitationValidationError
from srcs.schemas.state import ClaimWorkflowState
from srcs.services.agents.analysis_tasks import build_citation_instruction
from srcs.services.agents.rotating_llm import rotating_llm
from srcs.services.citation_validator import validate_citations


_AUDITOR_NODE_ID = "auditor_node"


def _find_citation_payload_paths(value: Any, path: str = "payload") -> list[str]:
    """Find citation payloads that would become auditor reasoning input."""
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
    """Guard against future citation leakage into the auditor prompt."""
    leaked_paths = _find_citation_payload_paths(payload)
    if leaked_paths:
        raise ValueError(
            "Auditor prompt payload unexpectedly includes citation metadata: "
            + ", ".join(leaked_paths)
        )


def _build_original_evidence_block(state: ClaimWorkflowState) -> str:
    docs = state.get("documents", []) or []
    if not docs:
        return "(no original documents available)"

    blocks: list[str] = []
    for doc in docs:
        filename = doc.get("filename", "")
        source_type = doc.get("source_type", "document")
        content = doc.get("content", "") or ""
        if source_type == "image":
            content = content[:1200]
        else:
            content = content[:2500]
        blocks.append(f"DOCUMENT filename={filename} type={source_type}\n{content}")
    return "\n\n".join(blocks)


def _build_auditor_prompt(state: ClaimWorkflowState, feedback: Optional[str] = None) -> str:
    """Render the auditor prompt against current cluster outputs."""
    case_facts = state.get("case_facts", {})
    policy = state.get("policy_results", {})
    liability = state.get("liability_results", {})
    damage = state.get("damage_results", {})
    fraud = state.get("fraud_results", {})
    payout = state.get("payout_results", {})
    original_evidence = _build_original_evidence_block(state)
    _assert_no_citations_in_auditor_prompt_payload(
        {
            "case_facts": case_facts,
            "policy_results": policy,
            "liability_results": liability,
            "damage_results": damage,
            "fraud_results": fraud,
            "payout_results": payout,
        }
    )

    citation_block = build_citation_instruction(state, _AUDITOR_NODE_ID)

    feedback_block = f"\n    Reviewer feedback: {feedback}\n" if feedback else ""

    return f"""
    You are a Senior Insurance Auditor. Perform a cross-consistency check on this claim.

    Case Facts (Tagged Documents): {case_facts.get('tagged_documents', {})}
    Policy Terms: {policy}
    Liability Analysis: {liability}
    Damage Analysis: {damage}
    Fraud Indicators: {fraud}
    Payout Calculation: {payout}

    Original Evidence Documents:
    {original_evidence}
{feedback_block}
    Audit Instructions:
    1. Verify the damage in 'Damage Analysis' matches the 'Point of Impact' in 'Liability Analysis'.
    2. Check that the workshop quote aligns with the damage analysis.
    3. If suspicion_score > 0.5, you MUST mark is_consistent=False and explain why.
    4. Flag obvious fraud patterns (e.g. mismatched story vs. physical evidence).
    5. Validate the payout follows the policy terms.

    Return JSON in this shape:
    {{
        "data": {{
            "is_consistent": bool,
            "findings": "string describing discrepancies or 'None'",
            "suggested_action": "approve" | "challenge",
            "target_cluster": "policy" | "liability" | "damage" | "fraud" | "none"
        }},
        "reasoning": "...",
        "citations": [ ... ]
    }}

    CITATION RULES SPECIFIC TO THE AUDITOR:
    - Default to source_type = "agent_output" when auditing or repeating values from
      Policy Terms, Liability Analysis, Damage Analysis, Fraud Indicators, or Payout Calculation.
      These are upstream agent outputs, not verbatim PDF text.
    - Use these logical filenames for upstream outputs:
      * "policy_analysis_output" for Policy Terms
      * "liability_analysis_output" for Liability Analysis
      * "damage_analysis_output" for Damage Analysis
      * "fraud_analysis_output" for Fraud Indicators
      * "payout_calculation_output" for Payout Calculation
    - For agent_output citations, copy a short exact JSON-like fragment from the upstream
      output shown above, e.g. "verified_total: 56635.2" or "suspicion_score: 0.0".
    - Do NOT cite derived values such as suspicious_parts, verified_total, max_payout_myr,
      fault percentages, or payout totals as source_type="text" unless that exact string
      is visibly present in the original document excerpt.
    - When you cite an upstream conclusion, use source_type = "agent_output" and one of these
      logical filenames: "policy_analysis_output", "liability_analysis_output",
      "damage_analysis_output", "fraud_analysis_output", "payout_calculation_output".
    - When citing a discrepancy, cite BOTH sides: the upstream agent_output you challenge
      AND the original evidence (text or image) that contradicts it.
    - When citing original evidence directly, use source_type = "text" or "image" with the
      exact filename from the Available Files list.
    - For original text evidence, cite only short exact substrings from the extracted
      document text. Do not reconstruct sentence fragments from the case summary.
    - If the original document is in Malay, the citation excerpt must stay in Malay.
      Do not translate it to English. For example, cite "Tiada kerosakan dilaporkan
      pada bahagian hadapan" instead of "No damage was reported to the front".

    {citation_block}
    """


async def _auditor_llm_call(
    state: ClaimWorkflowState, feedback: Optional[str] = None
) -> dict[str, Any]:
    """Single LLM round-trip; the validator may invoke this multiple times."""
    prompt = _build_auditor_prompt(state, feedback=feedback)
    response = await rotating_llm.send_message_get_json(prompt, temperature=0.0)
    raw = response.json_data if response.json_data else {}
    if not isinstance(raw, dict):
        raw = {}
    raw.setdefault("citations", [])
    return raw


async def auditor_node(state: ClaimWorkflowState) -> dict[str, Any]:
    """AI Auditor node: cross-consistency check between results."""
    if state.get("status") == "escalated":
        return {
            "trace_log": [
                "[Auditor] Workflow is ESCALATED. Skipping audit until critical data is provided."
            ]
        }

    policy = state.get("policy_results", {})
    liability = state.get("liability_results", {})
    damage = state.get("damage_results", {})
    fraud = state.get("fraud_results", {})
    payout = state.get("payout_results", {})

    try:
        raw = await _auditor_llm_call(state)
        validated, _ = await validate_citations(
            raw_result=raw,
            state=state,
            task_fn=_auditor_llm_call,
            feedback=None,
            node_id=_AUDITOR_NODE_ID,
        )
    except CitationValidationError as e:
        logger.warning("[Auditor] Citation gate failed: %s", e)
        return {
            "auditor_results": {
                "status": "error",
                "is_consistent": False,
                "findings": f"Citation gate failed: {e}",
                "suggested_action": "challenge",
                "target_cluster": "none",
            },
            "auditor_citations": [],
            "status": "inconsistent",
            "active_challenge": None,
            "trace_log": [f"[Auditor] Citation validation failed: {e}"],
        }
    except Exception as e:
        logger.exception("[Auditor] LLM call failed: %s", e)
        return {
            "auditor_results": {"status": "error", "findings": f"Auditor error: {e}"},
            "auditor_citations": [],
            "trace_log": [f"[Auditor] Error during audit: {e}"],
        }

    audit_data = validated.get("data", {}) if isinstance(validated.get("data"), dict) else {}

    has_errors = any(
        isinstance(res, dict) and res.get("status") == "error"
        for res in (policy, liability, damage, fraud, payout)
    )

    is_consistent = bool(audit_data.get("is_consistent", True)) and not has_errors
    findings = audit_data.get("findings", "No issues found.")
    if has_errors:
        findings = "Audit failed due to technical error in one or more analysis clusters."

    status = "awaiting_approval" if is_consistent else "inconsistent"

    citations = list(validated.get("citations") or [])
    # Annotate node_id defensively in case the LLM omitted it.
    for c in citations:
        if isinstance(c, dict) and not c.get("node_id"):
            c["node_id"] = _AUDITOR_NODE_ID

    auditor_results = {
        "is_consistent": is_consistent,
        "findings": findings,
        "suggested_action": audit_data.get("suggested_action", "approve"),
        "target_cluster": audit_data.get("target_cluster", "none"),
    }

    return {
        "auditor_results": auditor_results,
        "auditor_citations": citations,
        "status": status,
        "active_challenge": None,  # Clear challenge after rerun + audit
        "trace_log": [
            f"[Auditor] Audit complete. Consistent: {is_consistent}. Findings: {findings}"
        ],
    }


def decision_gate_logic(state: ClaimWorkflowState) -> dict[str, Any]:
    """No-op node that ensures the status is 'awaiting_approval' unless already in a wait state."""
    current_status = state.get("status")
    if current_status in ("inconsistent", "escalated", "awaiting_docs"):
        return {}
    return {"status": "awaiting_approval"}


def decision_router(state: ClaimWorkflowState) -> str:
    """Decision Router: Logic to route based on active_challenge or auditor findings."""
    from srcs.schemas.state import WorkflowNodes, MAX_ITERATIONS, WorkflowAction

    # 0. Human Authority: If operator forced approval, bypass all logic
    human_decision = state.get("human_decision")
    if human_decision and human_decision.get("action") == WorkflowAction.FORCE_APPROVE:
        return WorkflowNodes.REPORT_GENERATOR

    # 1. Escalation: If critical data is missing, stay at decision gate for human input
    if state.get("status") == "escalated":
        return WorkflowNodes.DECISION_GATE

    active_challenge = state.get("active_challenge")
    iteration = active_challenge.get("iteration", 0) if active_challenge else 0

    # 1. Circuit Breaker: Prevent infinite surgical loops
    if iteration > MAX_ITERATIONS:
        return WorkflowNodes.REPORT_GENERATOR

    # 2. Surgical Rerun: If human/refiner provided a specific challenge
    if active_challenge:
        target = active_challenge.get("target_cluster")
        mapping = {
            "policy": WorkflowNodes.POLICY_CLUSTER,
            "liability": WorkflowNodes.LIABILITY_CLUSTER,
            "damage": WorkflowNodes.DAMAGE_CLUSTER,
            "fraud": WorkflowNodes.FRAUD_CLUSTER,
        }
        return mapping.get(target, WorkflowNodes.REFINER)

    # 3. Refinement Loop: If human provided NEW feedback via Chat Agent
    if state.get("latest_user_message"):
        return WorkflowNodes.REFINER

    # 4. If Auditor found an autonomous issue but we haven't challenged it yet,
    # we stop at the Decision Gate (this router runs after the interrupt).
    if state.get("status") == "inconsistent":
        return WorkflowNodes.DECISION_GATE

    # 5. Completion: All checks passed, but we wait for human approval before generating the final report.
    if human_decision and human_decision.get("action") in (
        WorkflowAction.APPROVE,
        WorkflowAction.FORCE_APPROVE,
    ):
        return WorkflowNodes.REPORT_GENERATOR

    return WorkflowNodes.DECISION_GATE
