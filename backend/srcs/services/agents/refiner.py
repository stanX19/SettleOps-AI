from typing import Any
from srcs.schemas.state import ClaimWorkflowState, ChallengeState
from srcs.services.agents.rotating_llm import rotating_llm
from srcs.services.sse_service import SseService
from srcs.schemas.case_dto import SseAgentMessageToAgentData, AgentId, AuditorTrigger
from srcs.services.case_store import now_iso

async def refiner_node(state: ClaimWorkflowState) -> dict[str, Any]:
    """Refiner node: Translates freeform human feedback into a structured ChallengeState.
    
    This node acts as a bridge between the Chat UI and the Agentic clusters.
    """
    user_input = state.get("latest_user_message")
    case_id = state.get("case_id")
    
    # Guard: No input
    if not user_input:
        return {
            "trace_log": ["[Refiner] No user message to refine."]
        }
        
    current_challenge = state.get("active_challenge") or {}
    iteration = current_challenge.get("iteration", 0) + 1

    prompt = f"""
    You are a Feedback Alignment Agent. A user has provided feedback on an insurance claim analysis.
    Your job is to translate this feedback into a structured challenge for the relevant analysis cluster.

    User Message: "{user_input}"

    Available Clusters:
    - policy: Coverage, excess, or terms.
    - liability: Fault, narrative, point of impact.
    - damage: Costs, labor, parts verification.
    - fraud: Suspicious patterns.

    Return a JSON object:
    {{
        "target_cluster": "policy" | "liability" | "damage" | "fraud",
        "feedback": "Cleaned up instruction for the agent"
    }}
    """

    try:
        response = await rotating_llm.send_message_get_json(prompt, temperature=0.0)
        challenge_data = response.json_data if response.json_data else {}
        
        target = challenge_data.get("target_cluster", "liability")
        feedback = challenge_data.get("feedback", user_input)
        
        challenge: ChallengeState = {
            "target_cluster": target,
            "feedback": feedback,
            "iteration": iteration
        }
        
        # UI: Emit the challenge event so the UI can animate it
        # We map target string to AgentId enum
        target_agent_map = {
            "policy": AgentId.POLICY,
            "liability": AgentId.LIABILITY,
            "damage": AgentId.DAMAGE,
            "fraud": AgentId.FRAUD
        }
        
        if case_id:
            await SseService.emit(case_id, SseAgentMessageToAgentData(
                case_id=case_id,
                timestamp=now_iso(),
                from_agent=AgentId.AUDITOR, # Refiner acts on behalf of the Auditor/Orchestrator
                to_agent=target_agent_map.get(target, AgentId.LIABILITY),
                message_type="challenge",
                message=feedback,
                reason="Officer Feedback",
                loop_count=iteration,
                trigger=AuditorTrigger.OFFICER_MESSAGE
            ))
        
        return {
            "active_challenge": challenge,
            "latest_user_message": None,
            "trace_log": [f"[Refiner] Feedback mapped to {target} (Iteration {iteration}). Instruction: {feedback}"]
        }
    except Exception as e:
        return {
            "trace_log": [f"[Refiner] Error during refinement: {str(e)}"]
        }
