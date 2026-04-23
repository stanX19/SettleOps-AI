from typing import Annotated, TypedDict, Any, Optional, List
import operator

class ChallengeState(TypedDict):
    """Represents a human or auditor challenge to a specific agent's decision."""
    target_cluster: str  # "policy", "liability", "damage", "fraud"
    feedback: str       # The specific instruction or correction
    iteration: int      # Counter to prevent infinite loops during surgical reruns

def dict_merge(x: dict[str, Any], y: dict[str, Any]) -> dict[str, Any]:
    """Reducer for merging dictionaries in parallel LangGraph nodes."""
    if x is None:
        return y
    if y is None:
        return x
    return {**x, **y}

class ClaimWorkflowState(TypedDict):
    """Global state for the Auditor-Orchestrated Insurance Claims Workflow."""
    
    # Base Data
    case_id: str
    documents: List[dict]
    
    # Partitioned Blackboard: separate keys prevent shallow-merge data loss in parallel paths
    case_facts: Annotated[dict[str, Any], dict_merge]
    policy_results: Annotated[dict[str, Any], dict_merge]
    liability_results: Annotated[dict[str, Any], dict_merge]
    damage_results: Annotated[dict[str, Any], dict_merge]
    fraud_results: Annotated[dict[str, Any], dict_merge]
    payout_results: Annotated[dict[str, Any], dict_merge]
    
    # Trace Log: Every agent MUST append their reasoning here
    trace_log: Annotated[List[str], operator.add]
    
    # Routing & Loop Controls
    active_challenge: Optional[ChallengeState]
    status: str  # e.g., "ingesting", "analyzing", "awaiting_approval", "completed"
    
    # Metadata
    current_agent: Optional[str]
    latest_user_message: Optional[str]
