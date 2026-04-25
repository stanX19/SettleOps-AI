from typing import Any, Optional, Union
from srcs.schemas.state import ClaimWorkflowState, ClusterState
from srcs.services.agents.rotating_llm import rotating_llm

def get_doc_content(state: Union[ClaimWorkflowState, ClusterState], doc_type: str) -> str:
    """Helper to retrieve document content based on its tagged category."""
    # Note: case_facts is shared between global and cluster states
    tagged_docs = state.get("case_facts", {}).get("tagged_documents", {})
    doc_index = next((k for k, v in tagged_docs.items() if v == doc_type), None)
    
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

async def policy_analysis_task(state: ClusterState, feedback: Optional[str] = None) -> dict[str, Any]:
    """Analyzes the insurance policy for coverage, excess, and limits."""
    content = get_doc_content(state, "policy_covernote")
    
    prompt = f"""
    You are a Policy Specialist. Analyze the provided policy document.
    
    DOCUMENT CONTENT:
    {content}
    
    Feedback from auditor/human: {feedback if feedback else "None"}
    
    Required JSON:
    - claim_type: "own_damage" | "third_party"
    - max_payout_myr: float
    - excess_myr: float
    - depreciation_percent: float
    
    Return JSON format: {{"data": {{...}}, "reasoning": "..."}}
    """
    
    try:
        response = await rotating_llm.send_message_get_json(prompt, temperature=0.0)
        return response.json_data if response.json_data else {"data": {}, "reasoning": "Parsing failed"}
    except Exception as e:
        return {"data": {}, "reasoning": f"Error: {str(e)}"}

async def liability_narrative_task(state: ClusterState, feedback: Optional[str] = None) -> dict[str, Any]:
    """Extracts and analyzes the incident narrative from police reports."""
    content = get_doc_content(state, "police_report")
    
    prompt = f"""
    You are a Liability Adjuster. Extract the incident narrative from the police report.
    
    DOCUMENT CONTENT:
    {content}
    
    Feedback: {feedback if feedback else "None"}
    
    Required JSON:
    - incident_time: str
    - location: str
    - description: str
    - fault_split: dict with keys "insured" (int 0-100) and "third_party" (int 0-100)
    
    Return JSON format: {{"data": {{...}}, "reasoning": "..."}}
    """
    try:
        response = await rotating_llm.send_message_get_json(prompt, temperature=0.0)
        return response.json_data if response.json_data else {"data": {}, "reasoning": "Parsing failed"}
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
        return response.json_data if response.json_data else {"data": {}, "reasoning": "Parsing failed"}
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
    
    Required JSON:
    - verified_total: float
    - suspicious_parts: list[str]
    
    Return JSON format: {{"data": {{...}}, "reasoning": "..."}}
    """
    try:
        response = await rotating_llm.send_message_get_json(prompt, temperature=0.0)
        return response.json_data if response.json_data else {"data": {}, "reasoning": "Parsing failed"}
    except Exception as e:
        return {"data": {}, "reasoning": f"Error: {str(e)}"}

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
        return response.json_data if response.json_data else {"data": {}, "reasoning": "Parsing failed"}
    except Exception as e:
        return {"data": {}, "reasoning": f"Error: {str(e)}"}
