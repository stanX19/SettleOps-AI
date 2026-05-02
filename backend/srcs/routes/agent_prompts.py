"""REST endpoints for operator-customizable agent prompts."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from srcs.services import prompt_service

router = APIRouter(prefix="/api/v1/agent-prompts", tags=["Agent Prompts"])


class PromptUpdateRequest(BaseModel):
    custom_prompt: str = Field(min_length=1)


@router.get("")
def list_prompts():
    """Return prompt info for all customizable agents."""
    return prompt_service.get_all_prompts()


@router.get("/{agent_id}")
def get_prompt(agent_id: str):
    """Return prompt info for a single agent."""
    info = prompt_service.get_prompt_info(agent_id)
    if info is None:
        raise HTTPException(404, f"Agent '{agent_id}' not found or not customizable")
    return info


@router.put("/{agent_id}")
def update_prompt(agent_id: str, body: PromptUpdateRequest):
    """Save an operator prompt override for an agent."""
    try:
        return prompt_service.set_prompt(agent_id, body.custom_prompt)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.delete("/{agent_id}")
def reset_prompt(agent_id: str):
    """Reset an agent's prompt to the hardcoded default."""
    try:
        return prompt_service.reset_prompt(agent_id)
    except ValueError as e:
        raise HTTPException(400, str(e))
