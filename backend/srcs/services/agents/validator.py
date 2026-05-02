import json
import re
from typing import Any, Optional

from srcs.schemas.state import ClusterState
from srcs.services.agents.rotating_llm import rotating_llm
from srcs.services.prompt_service import get_active_prompt


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
    core_logic = get_active_prompt("validator")

    return f"""
    {core_logic}

    Cluster ID: {cluster_id}

    Cluster verdict/results:
    {json.dumps(cluster_results, ensure_ascii=False, default=str)}

    Cluster citations by subagent:
    {json.dumps(state.get("citations", {}), ensure_ascii=False, default=str)}
{feedback_block}
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


def _validation_from_parse_error(error: Exception) -> tuple[dict[str, Any], str] | None:
    """Treat non-JSON validator prose as a validation failure, not node failure."""
    message = str(error)
    match = re.search(r"Failed to parse JSON from LLM:\s*(\{.*\})\s*$", message, flags=re.DOTALL)
    if not match:
        return None
    try:
        payload = json.loads(match.group(1))
    except json.JSONDecodeError:
        return None
    text = str(payload.get("text") or "").strip()
    if not text:
        return None
    return (
        {
            "is_valid": False,
            "mistakes": [text],
            "feedback": text,
            "suggested_action": "challenge",
        },
        "Validator returned prose instead of JSON; treated as invalid validation feedback.",
    )


async def cluster_validator_task(
    cluster_id: str,
    state: ClusterState,
    feedback: Optional[str] = None,
) -> tuple[dict[str, Any], str]:
    prompt = _build_cluster_validator_prompt(cluster_id, state, feedback=feedback)
    try:
        response = await rotating_llm.send_message_get_json(prompt, temperature=0.0)
    except RuntimeError as e:
        fallback = _validation_from_parse_error(e)
        if fallback is not None:
            return fallback
        raise
    raw = response.json_data if response.json_data else {}
    if not isinstance(raw, dict):
        raw = {}
    validation = _normalize_validation(raw)
    return validation, str(raw.get("reasoning") or "Cluster validation complete.")
