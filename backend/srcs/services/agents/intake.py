from typing import Any, List
from srcs.schemas.state import ClaimWorkflowState
from srcs.services.agents.rotating_llm import rotating_llm

REQUIRED_DOCS = [
    "car_photo_plate",
    "damage_closeup",
    "driver_license",
    "road_tax_reg",
    "nric",
    "policy_covernote",
    "police_report",
    "workshop_quote",
]

async def ingest_tagging(state: ClaimWorkflowState) -> dict[str, Any]:
    """Categorize uploaded documents into required slots using LLM."""
    docs = state.get("documents", [])
    if not docs:
        return {
            "case_facts": {"tagged_documents": {}},
            "trace_log": ["[Intake] No documents found to tag."]
        }

    # Prepare document info for LLM
    doc_summaries = []
    for i, doc in enumerate(docs):
        doc_summaries.append({
            "index": i,
            "filename": doc.get("filename", "unknown"),
            "doc_type_hint": doc.get("doc_type", "unknown"),
            "snippet": doc.get("content", "")[:500] # Provide context for better tagging
        })

    prompt = f"""
    You are an insurance intake specialist. Categorize the following documents into these 8 required slots:
    {", ".join(REQUIRED_DOCS)}
    If a document does not fit or is ambiguous, use "unknown".

    Documents:
    {doc_summaries}

    Return a JSON object mapping the document index (as string) to the category.
    Example: {{"0": "police_report", "1": "car_photo_plate"}}
    """

    try:
        response = await rotating_llm.send_message_get_json(prompt, temperature=0.0)
        tagged = response.json_data if response.json_data else {}
        
        # Validation: Ensure only allowed categories are used
        sanitized_tags = {k: v for k, v in tagged.items() if v in REQUIRED_DOCS or v == "unknown"}
        
        return {
            "case_facts": {"tagged_documents": sanitized_tags},
            "trace_log": [f"[Intake] Tagged {len(sanitized_tags)} documents."]
        }
    except Exception as e:
        return {
            "trace_log": [f"[Intake] Error during tagging: {str(e)}"]
        }

def validation_gate(state: ClaimWorkflowState) -> dict[str, Any]:
    """Deterministic check to ensure all 8 required document types are present."""
    tagged_docs = state.get("case_facts", {}).get("tagged_documents", {})
    found_types = set(tagged_docs.values())
    
    missing = [doc_type for doc_type in REQUIRED_DOCS if doc_type not in found_types]
    
    if not missing:
        return {
            "status": "analyzing",
            "trace_log": ["[Intake] Validation Gate: All required documents present."]
        }
    
    return {
        "status": "awaiting_docs",
        "case_facts": {"missing_documents": missing},
        "trace_log": [f"[Intake] Validation Gate: Missing {len(missing)} required documents: {', '.join(missing)}"]
    }
