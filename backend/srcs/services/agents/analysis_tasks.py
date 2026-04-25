from typing import Any, Optional, Union
from srcs.schemas.state import ClaimWorkflowState, ClusterState
from srcs.services.agents.rotating_llm import rotating_llm

def get_doc_content(state: Union[ClaimWorkflowState, ClusterState], doc_type: str) -> str:
    """Helper to retrieve document content based on its tagged category."""
    # Note: case_facts is shared between global and cluster states
    tagged_docs = state.get("case_facts", {}).get("tagged_documents", {})
    doc_index = next((k for k, v in tagged_docs.items() if (isinstance(v, list) and doc_type in v) or v == doc_type), None)
    
    if doc_index is None:
        return "[Document missing or not tagged correctly]"
        
    docs = state.get("documents", [])
    try:
        idx = int(doc_index)
        if idx < len(docs):
            return docs[idx].get("content", "[No content available]")
        return "[Document index out of range]"
    except Exception:
        return "[Error retrieving document content]"

# -- Policy extraction defaults (safe fallbacks for payout engine) --------
_POLICY_DEFAULTS: dict[str, Any] = {
    "claim_type": "own_damage",
    "max_payout_myr": 50000.0,
    "excess_myr": 0.0,
    "depreciation_percent": 0.0,
}


def _ensure_policy_fields(data: dict[str, Any]) -> dict[str, Any]:
    """Merge safe defaults into LLM output so payout never starves."""
    merged = {**_POLICY_DEFAULTS, **{k: v for k, v in data.items() if v is not None}}
    return merged


# -- Damage extraction defaults (robustness fallbacks) --------------------
_DAMAGE_DEFAULTS: dict[str, Any] = {
    "verified_total": None, # Force escalation if truly missing
    "verified_parts": 0.0,
    "verified_labour": 0.0,
    "verified_paint": 0.0,
    "verified_towing": 0.0,
    "suspicious_parts": [],
}


def _ensure_damage_fields(data: dict[str, Any]) -> dict[str, Any]:
    """Merge safe defaults and perform auto-summation if total is missing."""
    # Handle both nested and flat structures
    raw_data = data.get("data", data)
    merged = {**_DAMAGE_DEFAULTS, **{k: v for k, v in raw_data.items() if v is not None}}
    
    # Auto-calculate verified_total if components exist but total doesn't
    if merged["verified_total"] is None:
        component_sum = (
            float(merged["verified_parts"]) + 
            float(merged["verified_labour"]) + 
            float(merged["verified_paint"]) + 
            float(merged["verified_towing"])
        )
        if component_sum > 0:
            merged["verified_total"] = component_sum
            
    return merged


async def policy_analysis_task(state: ClusterState, feedback: Optional[str] = None) -> dict[str, Any]:
    """Analyzes the insurance policy for coverage, excess, and limits."""
    content = get_doc_content(state, "policy_covernote")
    
    prompt = f"""
    You are a Policy Specialist. Analyze the provided policy document.
    
    DOCUMENT CONTENT:
    {content}
    
    Feedback from auditor/human: {feedback if feedback else "None"}
    
    IMPORTANT EXTRACTION RULES:
    1. You MUST extract every field below. Do NOT omit any.
    2. If a value cannot be found in the document, use these defaults:
       - claim_type: "own_damage"
       - max_payout_myr: 50000.0
       - excess_myr: 0.0
       - depreciation_percent: 0.0
    3. excess_myr is the policy excess / deductible the insured must pay.
       Look for keywords: "Excess", "Deductible", "Policy Excess".
    
    Return JSON format: {{"data": {{...}}, "reasoning": "Step-by-step audit of policy terms: 1. Found coverage for [type]. 2. Identified deductible of [amount]. 3. Verified sum insured [limit]. 4. Calculated applicable depreciation [percent]."}}
    """
    
    try:
        response = await rotating_llm.send_message_get_json(prompt, temperature=0.0)
        raw = response.json_data if response.json_data else {}
        data = raw.get("data", raw)  # handle both {"data": {...}} and flat dict
        return {"data": _ensure_policy_fields(data), "reasoning": raw.get("reasoning", "Extracted with defaults")}
    except Exception as e:
        return {"data": _POLICY_DEFAULTS.copy(), "reasoning": f"Extraction failed ({e}), using safe defaults"}

async def liability_narrative_task(state: ClusterState, feedback: Optional[str] = None) -> dict[str, Any]:
    """Extracts and analyzes the incident narrative from police reports."""
    content = get_doc_content(state, "police_report")
    
    prompt = f"""
    You are a Liability Adjuster. Extract the incident narrative from the police report.
    
    DOCUMENT CONTENT:
    {content}
    
    Feedback: {feedback if feedback else "None"}
    
    Return JSON format: {{"data": {{...}}, "reasoning": "Narrative reconstruction: 1. Located incident at [location]. 2. Established timeline [time]. 3. Analyzed fault based on [evidence] resulting in [split] liability."}}
    """
    try:
        response = await rotating_llm.send_message_get_json(prompt, temperature=0.0)
        raw = response.json_data if response.json_data else {}
        return {"data": raw.get("data", raw), "reasoning": raw.get("reasoning", "Extracted")}
    except Exception as e:
        return {"data": {}, "reasoning": f"Error: {str(e)}"}

async def liability_poi_task(state: ClusterState, feedback: Optional[str] = None) -> dict[str, Any]:
    """Analyzes descriptions to determine the Point of Impact (POI)."""
    # In a real system, this would be Vision-based. Here we use text descriptions.
    content = get_doc_content(state, "car_photo_plate") + "\n" + get_doc_content(state, "damage_closeup")
    
    prompt = f"""
    You are a Visual Forensic Analyst. Determine the Point of Impact (POI) from the damage descriptions.
    
    DESCRIPTIONS:
    {content}
    
    Feedback: {feedback if feedback else "None"}
    
    Required JSON:
    - poi_location: "front" | "rear" | "left_side" | "right_side"
    - damage_severity: "minor" | "moderate" | "severe"
    
    Return JSON format: {{"data": {{...}}, "reasoning": "..."}}
    """
    try:
        response = await rotating_llm.send_message_get_json(prompt, temperature=0.0)
        raw = response.json_data if response.json_data else {}
        return {"data": raw.get("data", raw), "reasoning": raw.get("reasoning", "Extracted")}
    except Exception as e:
        return {"data": {}, "reasoning": f"Error: {str(e)}"}

async def damage_quote_audit_task(state: ClusterState, feedback: Optional[str] = None) -> dict[str, Any]:
    """Audits the workshop quote for part costs and necessity."""
    content = get_doc_content(state, "workshop_quote")
    
    prompt = f"""
    You are a Damage Assessor. Audit the workshop repair quote.
    
    QUOTE CONTENT:
    {content}
    
    Feedback: {feedback if feedback else "None"}
    
    IMPORTANT: Extract the cost breakdown in MYR. 
    If a value is not explicitly found, return 0.0 for that field.
    
    REQUIRED JSON FIELDS in 'data':
    - verified_total: float (Total approved repair estimate)
    - verified_parts: float (Total for parts)
    - verified_labour: float (Total for labour hours)
    - verified_paint: float (Total for paint/refinishing)
    - verified_towing: float (Towing charges if any)
    - suspicious_parts: list[str] (List parts that seem overpriced or unnecessary)

    Return JSON format: {{"data": {{...}}, "reasoning": "Assessor audit trail: 1. Reconciled part codes [list]. 2. Flagged [suspicious] for necessity check. 3. Verified labour hours against industry standards. 4. Confirmed total MYR [total]."}}
    """
    try:
        response = await rotating_llm.send_message_get_json(prompt, temperature=0.0)
        raw = response.json_data if response.json_data else {}
        return {"data": _ensure_damage_fields(raw), "reasoning": raw.get("reasoning", "Extracted")}
    except Exception as e:
        return {"data": _DAMAGE_DEFAULTS.copy(), "reasoning": f"Error during extraction: {str(e)}"}

async def fraud_assessment_task(state: ClusterState, feedback: Optional[str] = None) -> dict[str, Any]:
    """Checks for suspicious patterns or inconsistencies indicating fraud."""
    # Fraud context needs everything
    context = "\n".join([d.get("content", "") for d in state.get("documents", [])])
    
    prompt = f"""
    You are a Fraud Investigator. Check for inconsistencies across all documents.
    
    ALL DOCUMENT CONTEXT:
    {context}
    
    Feedback: {feedback if feedback else "None"}
    
    Required JSON:
    - suspicion_score: float (0.0 to 1.0)
    - red_flags: list[str]
    
    Return JSON format: {{"data": {{...}}, "reasoning": "..."}}
    """
    try:
        response = await rotating_llm.send_message_get_json(prompt, temperature=0.0)
        raw = response.json_data if response.json_data else {}
        return {"data": raw.get("data", raw), "reasoning": raw.get("reasoning", "Extracted")}
    except Exception as e:
        return {"data": {}, "reasoning": f"Error: {str(e)}"}

async def entity_extraction_task(state: Union[ClaimWorkflowState, ClusterState], feedback: Optional[str] = None) -> dict[str, Any]:
    """Extracts basic claim entities (Names, IDs, Vehicles) for documentation."""
    police_content = get_doc_content(state, "police_report")
    policy_content = get_doc_content(state, "policy_covernote")
    quote_content = get_doc_content(state, "workshop_quote")
    
    prompt = f"""
    You are an Insurance Data Entry Specialist. Extract the following entities from the provided documents.
    
    POLICE REPORT:
    {police_content}
    
    POLICY COVERNOTE:
    {policy_content}
    
    WORKSHOP QUOTE:
    {quote_content}
    
    Feedback: {feedback if feedback else "None"}
    
    Required JSON:
    - claim_no: str (Look for Ref No or Claim No)
    - policy_no: str
    - insured_name: str
    - nric: str (Insured's ID)
    - vehicle_no: str (Plate number)
    - vehicle_model: str
    - accident_date: str
    - report_date: str
    - workshop_name: str
    - workshop_code: str (if available)
    - workshop_address: str
    - workshop_phone: str
    
    Return JSON format: {{"data": {{...}}, "reasoning": "..."}}
    """
    try:
        response = await rotating_llm.send_message_get_json(prompt, temperature=0.0)
        raw = response.json_data if response.json_data else {}
        return {"data": raw.get("data", raw), "reasoning": raw.get("reasoning", "Extracted")}
    except Exception as e:
        return {"data": {}, "reasoning": f"Error: {str(e)}"}
