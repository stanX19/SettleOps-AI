from typing import Annotated, TypedDict, Any, Optional, List
import operator
from enum import Enum

class WorkflowNodes(str, Enum):
    """Centralized node identifiers to decouple service logic from graph topology."""
    POLICY_CLUSTER = "policy_cluster"
    LIABILITY_CLUSTER = "liability_cluster"
    DAMAGE_CLUSTER = "damage_cluster"
    FRAUD_CLUSTER = "fraud_cluster"
    REFINER = "refiner"
    REPORT_GENERATOR = "report_generator"
    DECISION_GATE = "decision_gate"
    WAIT_FOR_DOCS = "wait_for_docs"

class WorkflowAction(str, Enum):
    """Centralized action identifiers for human and agentic decisions."""
    APPROVE = "approve"
    REJECT = "reject"
    CHALLENGE = "challenge"
    FORCE_APPROVE = "force_approve"

MAX_ITERATIONS = 3

class ChallengeState(TypedDict):
    """Represents a human or auditor challenge to a specific agent's decision."""
    target_cluster: str  # "policy", "liability", "damage", "fraud"
    feedback: str       # The specific instruction or correction
    iteration: int      # Counter to prevent infinite loops during surgical reruns

class HumanDecision(TypedDict):
    """Represents a manual intervention by a human operator."""
    action: WorkflowAction 
    reasoning: str
    operator_id: str # e.g., "Operator Jack"
    timestamp: str

def dict_merge(x: dict[str, Any], y: dict[str, Any]) -> dict[str, Any]:
    """Reducer for merging dictionaries in parallel LangGraph nodes."""
    if x is None:
        return y
    if y is None:
        return x
    return {**x, **y}

def first_value(x: Any, y: Any) -> Any:
    """Reducer that keeps the first non-empty value."""
    if x is not None and x != "":
        return x
    return y

class ClusterState(TypedDict):
    """Isolated state for a single parallel analysis cluster."""
    case_id: Annotated[str, first_value]
    documents: List[dict]
    case_facts: dict[str, Any]
    active_challenge: Optional[ChallengeState]

    # The result key will be mapped back to the specific global section (e.g., policy_results)
    results: Annotated[dict[str, Any], dict_merge]
    # Citations keyed by node_id (sub-task name). dict_merge causes reruns
    # of the same node_id to overwrite, not append.
    citations: Annotated[dict[str, list[dict[str, Any]]], dict_merge]
    trace_log: Annotated[List[str], operator.add]

class ClaimWorkflowState(TypedDict):
    """Global state for the Auditor-Orchestrated Insurance Claims Workflow."""
    
    # Base Data
    case_id: Annotated[str, first_value]
    documents: List[dict]
    processed_indices: Annotated[List[int], operator.add]
    
    # Partitioned Blackboard
    case_facts: Annotated[dict[str, Any], dict_merge]
    policy_results: Annotated[dict[str, Any], dict_merge]
    liability_results: Annotated[dict[str, Any], dict_merge]
    damage_results: Annotated[dict[str, Any], dict_merge]
    fraud_results: Annotated[dict[str, Any], dict_merge]
    payout_results: Annotated[dict[str, Any], dict_merge]
    auditor_results: Annotated[dict[str, Any], dict_merge]

    # Per-section citations. Reruns of a section replace its list (no append).
    policy_citations: List[dict[str, Any]]
    liability_citations: List[dict[str, Any]]
    damage_citations: List[dict[str, Any]]
    fraud_citations: List[dict[str, Any]]
    auditor_citations: List[dict[str, Any]]

    # Trace Log
    trace_log: Annotated[List[str], operator.add]
    
    # Routing & Loop Controls
    active_challenge: Optional[ChallengeState]
    status: str 
    
    # HITL & Auditing
    human_decision: Optional[HumanDecision]
    human_audit_log: Annotated[List[HumanDecision], operator.add]
    
    # Metadata
    current_agent: Optional[str]
    latest_user_message: Optional[str]
    
    # Human Override Controls
    force_approve: bool
    human_decision_reason: Optional[str]
