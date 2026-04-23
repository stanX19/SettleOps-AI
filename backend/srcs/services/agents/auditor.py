from typing import Any
from srcs.schemas.state import ClaimWorkflowState
from srcs.services.agents.rotating_llm import rotating_llm

async def auditor_node(state: ClaimWorkflowState) -> dict[str, Any]:
    """AI Auditor node: Cross-consistency check between results.
    
    This node looks for discrepancies between partitioned analysis clusters
    (Policy, Liability, Damage) to ensure the final payout is justified.
    """
    case_facts = state.get("case_facts", {})
    policy = state.get("policy_results", {})
    liability = state.get("liability_results", {})
    damage = state.get("damage_results", {})
    payout = state.get("payout_results", {})

    prompt = f"""
    You are a Senior Insurance Auditor. Your task is to perform a cross-consistency check on an insurance claim.
    
    Case Facts (Tagged Documents): {case_facts.get('tagged_documents', dict())}
    Policy Terms: {policy}
    Liability Analysis: {liability}
    Damage Analysis: {damage}
    Payout Calculation: {payout}

    Audit Instructions:
    1. Verify if the damage described in 'Damage Analysis' matches the 'Point of Impact' (POI) mentioned in 'Liability Analysis'.
    2. Check if the 'Workshop Quote' aligns with the 'Damage Analysis'.
    3. Ensure no obvious fraud patterns (e.g., mismatched story vs. physical evidence).
    4. Validate if the Payout follows the Policy terms.

    Return a JSON object:
    {{
        "is_consistent": bool,
        "findings": "string describing discrepancies or 'None'",
        "suggested_action": "approve" | "challenge",
        "target_cluster": "policy" | "liability" | "damage" | "fraud" | "none"
    }}
    """

    try:
        response = await rotating_llm.send_message_get_json(prompt, temperature=0.0)
        audit_results = response.json_data if response.json_data else {}
        
        is_consistent = audit_results.get("is_consistent", True)
        findings = audit_results.get("findings", "No issues found.")
        
        # If inconsistent, we flag it so the decision router can handle it
        status = "awaiting_approval" if is_consistent else "inconsistent"
        
        return {
            "status": status,
            "trace_log": [f"[Auditor] Audit complete. Consistent: {is_consistent}. Findings: {findings}"]
        }
    except Exception as e:
        return {
            "trace_log": [f"[Auditor] Error during audit: {str(e)}"]
        }

def decision_router(state: ClaimWorkflowState) -> str:
    """Decision Router: Logic to route based on active_challenge or auditor findings.
    
    Implements Circuit Breakers to prevent infinite loops and uses WorkflowNodes 
    for loose coupling.
    """
    from srcs.schemas.state import WorkflowNodes, MAX_ITERATIONS
    
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
            "fraud": WorkflowNodes.FRAUD_CLUSTER
        }
        return mapping.get(target, WorkflowNodes.REFINER)
    
    # 3. Refinement Loop: If Auditor found an autonomous issue
    if state.get("status") == "inconsistent":
        return WorkflowNodes.REFINER
        
    # 4. Completion: All checks passed or approved
    return WorkflowNodes.REPORT_GENERATOR
