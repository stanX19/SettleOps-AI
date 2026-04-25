from typing import Any
from srcs.schemas.state import ClaimWorkflowState

def payout_node(state: ClaimWorkflowState) -> dict[str, Any]:
    """Pure Python deterministic payout engine.
    
    Formula: Payout = min(max(Verified_Total * (1 - Depr_Rate) * Liab_Rate - Excess, 0), Policy_Cap)
    """
    damage = state.get("damage_results", {})
    liability = state.get("liability_results", {})
    policy = state.get("policy_results", {})

    # 0. Escalation Protocol: Only hard-escalate when verified_total is missing.
    # excess_myr defaults to 0.0 (no deductible) — safer for claimant, auditor can flag.
    if damage.get("verified_total") is None:
        return {
            "status": "escalated",
            "payout_results": {
                "recommended_action": "escalate",
                "status": "escalated",
                "rationale": "Missing verified damage total from workshop quotation. Cannot calculate payout without a damage estimate.",
                "missing_fields": ["verified_total"],
                "payout_breakdown": None,
                "confidence": 1.0
            },
            "trace_log": ["[Payout] ESCALATION: Missing verified_total. Pausing for human intervention."]
        }

    # 1. Extraction with Guard Clauses
    verified_total = float(damage.get("verified_total") or 0.0)
    
    # Determine liability rate based on claim type or fault split
    claim_type = policy.get("claim_type", "own_damage")
    liability_rate = 1.0 # Default for Own Damage
    
    if claim_type != "own_damage":
        # For non-OD claims, check liability percentage
        if "liability_percent" in liability:
            liability_rate = float(liability["liability_percent"]) / 100.0
        elif "fault_split" in liability:
            # Payout inversely proportional to insured's fault
            insured_fault = float(liability["fault_split"].get("insured") or 0.0)
            liability_rate = (100.0 - insured_fault) / 100.0

    # Policy parameters
    excess = float(policy.get("excess_myr") or 0.0)
    depr_rate = float(policy.get("depreciation_percent") or 0.0) / 100.0
    policy_cap = float(policy.get("max_payout_myr") or float('inf'))

    # 2. Calculation Sequence
    depreciation_deducted = verified_total * depr_rate
    after_depreciation = verified_total - depreciation_deducted
    
    liability_adjusted = after_depreciation * liability_rate
    
    after_excess = max(liability_adjusted - excess, 0.0)
    final_payout = min(after_excess, policy_cap)

    # 3. Construct Result
    result = {
        "recommended_action": "approve" if final_payout > 0 else "decline",
        "payout_breakdown": {
            "repair_estimate_myr": round(verified_total, 2),
            "depreciation_deducted_myr": round(depreciation_deducted, 2),
            "liability_adjusted_myr": round(liability_adjusted, 2),
            "excess_deducted_myr": round(excess, 2),
            "final_payout_myr": round(final_payout, 2),
        },
        "rationale": (
            f"Payout of {final_payout:.2f} calculated based on "
            f"verified damage of {verified_total:.2f}, "
            f"liability rate of {liability_rate*100:.1f}%, "
            f"and policy terms (Excess: {excess:.2f}, Depr: {depr_rate*100:.1f}%)."
        ),
        "confidence": 1.0 # Deterministic
    }

    return {
        "payout_results": result,
        "trace_log": [f"[Payout] Calculated final payout: {final_payout:.2f} MYR"]
    }
