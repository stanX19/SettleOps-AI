"""Service for managing operator-customizable agent prompts.

Each LLM-driven task has a default core-logic prompt that can be
overridden by the operator.  The override *replaces* the core logic portion;
structural parts (document injection, citation block, JSON response shape)
are always appended by the task function and cannot be edited.
"""

from __future__ import annotations

from typing import Any, Optional

from srcs.database import SessionLocal
from srcs.models.agent_prompt import AgentPromptOverride


# ---------------------------------------------------------------------------
# Default core-logic prompts — mapped to task_id (node_id).
# ---------------------------------------------------------------------------

_DEFAULTS: dict[str, str] = {
    # -- Intake Cluster --
    "ingest_tagging": (
        "You are an insurance intake specialist. Categorize the following NEW "
        "documents into these 8 required slots:\n"
        "car_photo_plate, damage_closeup, driver_license, road_tax_reg, nric, "
        "policy_covernote, police_report, workshop_quote\n\n"
        "IMPORTANT: A single document can belong to MULTIPLE categories.\n"
        "For example, a photo of a car damage that also clearly shows the "
        "license plate should be tagged as BOTH \"car_photo_plate\" and "
        "\"damage_closeup\".\n\n"
        "If a document does not fit any category, use \"unknown\".\n"
        "Use the document content first, then filename and doc_type_hint as "
        "supporting clues.\n"
        "Photo/image snippets may be AI vision descriptions rather than "
        "literal OCR text.\n\n"
        "Return a JSON object mapping the document index (as string) to a "
        "LIST of categories.\n"
        "Example: {\"0\": [\"police_report\"], \"1\": [\"car_photo_plate\", "
        "\"damage_closeup\"]}"
    ),

    # -- Policy Cluster --
    "policy_analysis_task": (
        "You are a Policy Specialist. Analyze the provided policy document.\n\n"
        "IMPORTANT EXTRACTION RULES:\n"
        "1. You MUST extract every field below. Do NOT omit any.\n"
        "2. Refer to the Policy Guidelines above for depreciation schedules "
        "and standard terms.\n"
        "3. If a value cannot be found in the document, apply the defaults "
        "in the guidelines:\n"
        "   - claim_type: \"own_damage\"\n"
        "   - max_payout_myr: 50000.0\n"
        "   - excess_myr: 0.0\n"
        "   - depreciation_percent: 0.0\n"
        "4. excess_myr is the policy excess / deductible the insured must pay. "
        "Look for keywords: \"Excess\", \"Deductible\", \"Policy Excess\".\n"
        "5. CITATION RULE FOR DEFAULTED FIELDS: If a field was not found in "
        "the document and you applied a system default, you still need a "
        "citation. Use any stable identifier already present in the document "
        "(e.g. policy number, insured name, or effective date) as the excerpt, "
        "and set comment to \"Field not stated in document; system default "
        "applied.\" Every field — whether extracted or defaulted — must have "
        "exactly one citation."
    ),

    # -- Liability Cluster --
    "liability_narrative_task": (
        "You are a Liability Adjuster. Extract the incident narrative from "
        "the police report."
    ),
    "liability_poi_task": (
        "You are a Visual Forensic Analyst. Determine the Point of Impact (POI) "
        "from the damage descriptions.\n\n"
        "Required JSON in \"data\":\n"
        "- poi_location: \"front\" | \"rear\" | \"left_side\" | \"right_side\"\n"
        "- damage_severity: \"minor\" | \"moderate\" | \"severe\""
    ),

    # -- Damage Cluster --
    "damage_quote_audit_task": (
        "You are a Damage Assessor. Audit the workshop repair quote.\n\n"
        "IMPORTANT: Extract the cost breakdown in MYR.\n"
        "If a value is not explicitly found, return 0.0 for that field.\n"
        "Use the quotation validation checklist above to verify each line item.\n\n"
        "CITATION SOURCE GUIDANCE: All citations must come from the workshop "
        "quote document above.\n"
        "When citing a line item, use a short single-line excerpt such as the "
        "part name and amount (e.g. \"Rear Right Fender 1,200.00\") — do not "
        "copy multi-line table rows or document headers.\n"
        "The Quotation Workflow Guide is an authoritative MCP reference, not "
        "an uploaded document; do not attempt to cite it.\n\n"
        "REQUIRED JSON FIELDS in \"data\":\n"
        "- verified_total: float (Total approved repair estimate)\n"
        "- verified_parts: float (Total for parts)\n"
        "- verified_labour: float (Total for labour hours)\n"
        "- verified_paint: float (Total for paint/refinishing)\n"
        "- verified_towing: float (Towing charges if any)\n"
        "- suspicious_parts: list[str] (List parts that seem overpriced or "
        "unnecessary)"
    ),
    "pricing_validation_task": (
        "You are a Pricing Auditor. Your job is to validate the workshop "
        "repair quote against the authoritative pricing reference below.\n\n"
        "TASK:\n"
        "1. For each line item in the quote, compare it against the pricing "
        "benchmark ranges.\n"
        "2. Flag items that exceed the OEM/Standard upper bound by more than 20%.\n"
        "3. Flag items inconsistent with the stated damage type or vehicle model.\n"
        "4. Provide an overall pricing verdict.\n\n"
        "CITATION SOURCE GUIDANCE:\n"
        "- Use source_type=\"text\" with filename of workshop quote for quoted items.\n"
        "- Use source_type=\"reference\" with filename \"parts_pricing_guide\" "
        "for benchmark ranges.\n\n"
        "REQUIRED JSON FIELDS in \"data\":\n"
        "- pricing_verdict: \"acceptable\" | \"overpriced\" | \"suspicious\"\n"
        "- flagged_items: list of objects with { \"item\": str, \"quoted_myr\": float, \"benchmark_range\": str, \"issue\": str }\n"
        "- total_quoted_myr: float\n"
        "- recommended_adjustment_myr: float\n"
        "- summary: str"
    ),

    # -- Fraud Cluster --
    "fraud_assessment_task": (
        "You are a Fraud Investigator. Check for inconsistencies across all "
        "documents.\n\n"
        "Required JSON in \"data\":\n"
        "- suspicion_score: float (0.0 to 1.0)\n"
        "- red_flags: list[str]"
    ),

    # -- Auditor Cluster --
    "auditor": (
        "You are the final Aggregator for an insurance claim workflow.\n"
        "Synthesize the validated outputs into a compact final review for a "
        "human officer's blackboard card.\n"
        "Do not perform a new adversarial validation pass. The cluster "
        "Validator results below already records citation/verdict mistakes "
        "and unresolved issues.\n\n"
        "BLACKBOARD STYLE:\n"
        "- Use point-form fragments, not paragraphs.\n"
        "- Keep only decision-critical facts and actions.\n"
        "- Do not repeat the full case narrative or quote long evidence.\n"
        "- Prefer short labels such as Policy, Liability, Damage, Fraud, Payout."
    ),

    # -- Generic Tasks --
    "validator": (
        "You are the Validator Agent for a processing cluster.\n\n"
        "Your task is to look at all the citations and verdicts from the subagents.\n"
        "Your goal is to find ANY mistakes made by the other agents.\n"
        "You will be rewarded for mistakes you found.\n\n"
        "Validation rules:\n"
        "1. Check whether each verdict/result is supported by its citations.\n"
        "2. Check whether citation comments and conclusions match the cited excerpt.\n"
        "3. Check for contradictions between subagent outputs inside this cluster.\n"
        "4. Do not use uploaded document content or external knowledge. Judge only the verdicts and citations above."
    ),
}

# Aliases for backward compatibility with Step 5 cluster-level IDs.
# If a cluster ID is used, it maps to the primary task in that cluster.
_ALIASES = {
    "intake": "ingest_tagging",
    "policy": "policy_analysis_task",
    "liability": "liability_narrative_task",
    "damage": "damage_quote_audit_task",
    "fraud": "fraud_assessment_task",
    "validator": "validator",
    "aggregator": "auditor",  # Aggregators usually follow aggregator/auditor logic
}

CUSTOMIZABLE_AGENTS: frozenset[str] = frozenset(set(_DEFAULTS.keys()) | set(_ALIASES.keys()))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def _resolve_id(key: str) -> str:
    """Resolve a cluster alias to a specific task ID."""
    return _ALIASES.get(key, key)


def get_default_prompt(agent_id: str) -> Optional[str]:
    """Return the hardcoded default prompt for an agent/task, or None."""
    return _DEFAULTS.get(_resolve_id(agent_id))


def get_active_prompt(agent_id: str) -> str:
    """Return the operator override if it exists, otherwise the default."""
    resolved_id = _resolve_id(agent_id)
    default = _DEFAULTS.get(resolved_id, "")
    db = SessionLocal()
    try:
        row = db.query(AgentPromptOverride).filter_by(agent_id=resolved_id).first()
        return row.custom_prompt if row else default
    finally:
        db.close()


def get_prompt_info(agent_id: str) -> Optional[dict[str, Any]]:
    """Return full prompt info for the API layer."""
    resolved_id = _resolve_id(agent_id)
    default = _DEFAULTS.get(resolved_id)
    if default is None:
        return None

    db = SessionLocal()
    try:
        row = db.query(AgentPromptOverride).filter_by(agent_id=resolved_id).first()
        return {
            "agent_id": resolved_id,
            "default_prompt": default,
            "custom_prompt": row.custom_prompt if row else None,
            "is_customized": row is not None,
            "updated_at": row.updated_at.isoformat() if row and row.updated_at else None,
        }
    finally:
        db.close()


def get_all_prompts() -> list[dict[str, Any]]:
    """Return prompt info for every customizable task."""
    return [info for tid in _DEFAULTS if (info := get_prompt_info(tid)) is not None]


def set_prompt(agent_id: str, custom_prompt: str) -> dict[str, Any]:
    """Create or update the operator override for a task."""
    resolved_id = _resolve_id(agent_id)
    if resolved_id not in _DEFAULTS:
        raise ValueError(f"Task '{agent_id}' does not support prompt customization")

    db = SessionLocal()
    try:
        row = db.query(AgentPromptOverride).filter_by(agent_id=resolved_id).first()
        if row:
            row.custom_prompt = custom_prompt
        else:
            db.add(AgentPromptOverride(agent_id=resolved_id, custom_prompt=custom_prompt))
        db.commit()
    finally:
        db.close()

    return get_prompt_info(resolved_id)  # type: ignore[return-value]


def reset_prompt(agent_id: str) -> dict[str, Any]:
    """Delete the operator override, reverting to the default."""
    resolved_id = _resolve_id(agent_id)
    if resolved_id not in _DEFAULTS:
        raise ValueError(f"Task '{agent_id}' does not support prompt customization")

    db = SessionLocal()
    try:
        db.query(AgentPromptOverride).filter_by(agent_id=resolved_id).delete()
        db.commit()
    finally:
        db.close()

    return get_prompt_info(resolved_id)  # type: ignore[return-value]
