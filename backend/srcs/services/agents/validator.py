import json
from typing import Any, Optional

from srcs.schemas.state import ClusterState
from srcs.services.agents.rotating_llm import rotating_llm


def _build_cluster_validator_prompt(
    cluster_id: str,
    state: ClusterState,
    feedback: Optional[str] = None,
) -> str:
    feedback_block = f"\nReviewer feedback: {feedback}\n" if feedback else ""
    cluster_results = {
        key: value
        for key, value in (state.get("results", {}) or {}).items()
        if key != "_validation"
    }
    return f"""
    You are the Validator Agent for the {cluster_id} cluster.

    Your task is to look at all the citation and verdict.
    Your goal is to find ANY mistakes made by the other agent.
    You will be rewarded for mistakes you found.

    Cluster verdict/results:
    {json.dumps(cluster_results, ensure_ascii=False, default=str)}

    Cluster citations by subagent:
    {json.dumps(state.get("citations", {}), ensure_ascii=False, default=str)}
{feedback_block}
    Validation rules:
    1. Check whether each verdict/result is supported by its citations.
    2. Check whether citation comments and conclusions match the cited excerpt.
    3. Check for contradictions between subagent outputs inside this cluster.
    4. Do not use uploaded document content or external knowledge. Judge only the verdicts and citations above.

    Final response shape:
    Return ONLY valid JSON. Do not include markdown, code fences, or explanatory prose outside the JSON.
    {{
        "data": {{
            "is_valid": bool,
            "mistakes": [
                {{
                    "field_path": "string",
                    "issue": "string",
                    "evidence": "string",
                    "severity": "low" | "medium" | "high"
                }}
            ],
            "feedback": "string",
            "suggested_action": "approve" | "challenge"
        }},
        "reasoning": "brief rationale"
    }}
    """


def _normalize_validation(raw: dict[str, Any]) -> dict[str, Any]:
    data = raw.get("data", raw)
    if not isinstance(data, dict):
        data = {}

    return {
        "is_valid": bool(data.get("is_valid", True)),
        "mistakes": data.get("mistakes", []) if isinstance(data.get("mistakes", []), list) else [],
        "feedback": str(data.get("feedback") or ""),
        "suggested_action": str(data.get("suggested_action") or "approve"),
    }


async def cluster_validator_task(
    cluster_id: str,
    state: ClusterState,
    feedback: Optional[str] = None,
) -> tuple[dict[str, Any], str]:
    prompt = _build_cluster_validator_prompt(cluster_id, state, feedback=feedback)
    response = await rotating_llm.send_message_get_json(prompt, temperature=0.0)
    raw = response.json_data if response.json_data else {}
    if not isinstance(raw, dict):
        raw = {}
    validation = _normalize_validation(raw)
    return validation, str(raw.get("reasoning") or "Cluster validation complete.")
