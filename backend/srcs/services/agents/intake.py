from typing import Any, List
from srcs.schemas.state import ClaimWorkflowState
from srcs.services.agents.rotating_llm import rotating_llm
from srcs.services.prompt_service import get_active_prompt

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
    """Categorize NEW uploaded documents into required slots using LLM."""
    docs = state.get("documents", [])
    processed_indices = set(state.get("processed_indices", []))
    existing_tags = state.get("case_facts", {}).get("tagged_documents", {})
    
    # Identify documents that haven't been tagged yet
    new_docs_to_process = []
    for i, doc in enumerate(docs):
        if i not in processed_indices:
            new_docs_to_process.append({
                "index": i,
                "slot": doc.get("slot", f"document_{i}"),
                "filename": doc.get("filename", "unknown"),
                "source_type": doc.get("source_type", "unknown"),
                "doc_type_hint": doc.get("doc_type", "unknown"),
                "extraction_method": doc.get("extraction_method", "unknown"),
                "snippet": doc.get("content", "")[:1200],
            })

    if not new_docs_to_process:
        return {
            "trace_log": ["[Intake] No new documents found to tag."]
        }

    core_logic = get_active_prompt("intake")

    prompt = f"""
    {core_logic}

    Documents:
    {new_docs_to_process}
    """

    try:
        response = await rotating_llm.send_message_get_json(
            prompt,
            temperature=0.0,
            mock_data={"0": REQUIRED_DOCS}
        )
        tagged = response.json_data if response.json_data else {}
        
        # Validation: Ensure only allowed categories are used
        sanitized_tags = {}
        new_indices = []
        for key, value in tagged.items():
            # Support both single strings (legacy/stubborn LLM) and lists
            tags_list = [value] if isinstance(value, str) else value if isinstance(value, list) else []
            
            valid_tags = [t for t in tags_list if t in REQUIRED_DOCS or t == "unknown"]
            if not valid_tags:
                continue
                
            try:
                index = int(key)
            except (TypeError, ValueError):
                continue
            if index < 0 or index >= len(docs):
                continue
            sanitized_tags[str(index)] = valid_tags
            new_indices.append(index)
        
        merged_tags = {**existing_tags, **sanitized_tags}
        
        return {
            "case_facts": {"tagged_documents": merged_tags},
            "processed_indices": new_indices,
            "trace_log": [f"[Intake] Tagged {len(sanitized_tags)} new documents (multi-tag support enabled)."]
        }
    except Exception as e:
        return {
            "trace_log": [f"[Intake] Error during tagging: {str(e)}"]
        }

def validation_gate(state: ClaimWorkflowState) -> dict[str, Any]:
    """Deterministic check to ensure all 8 required document types are present."""
    tagged_docs = state.get("case_facts", {}).get("tagged_documents", {})
    
    # Flatten all tags from all documents
    found_types = set()
    for tags in tagged_docs.values():
        if isinstance(tags, list):
            found_types.update(tags)
        else:
            found_types.add(tags)
    
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

def wait_for_docs_node(state: ClaimWorkflowState) -> dict[str, Any]:
    """Node that preserves the awaiting_docs status and provides an interrupt point.
    When the graph is resumed, it will transition back to ingest_tagging.
    """
    return {
        "status": "awaiting_docs",
        "trace_log": ["[Intake] Workflow resumed. Re-triggering document tagging."]
    }

async def entity_extraction_node(state: ClaimWorkflowState) -> dict[str, Any]:
    """Surgical extraction of key claim entities for the final report."""
    from srcs.services.agents.analysis_tasks import entity_extraction_task
    
    result = await entity_extraction_task(state)
    data = result.get("data", {})
    
    # Merge existing case_facts (like tagged_documents) with new extracted facts
    current_facts = state.get("case_facts", {})
    merged_facts = {**current_facts, **data}
    
    return {
        "case_facts": merged_facts,
        "trace_log": [f"[Intake] Extracted claim entities for {data.get('claim_no', 'unknown')}"]
    }
