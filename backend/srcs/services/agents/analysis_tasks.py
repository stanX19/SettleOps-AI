from typing import Any, Optional, Union
from srcs.schemas.state import ClaimWorkflowState, ClusterState
from srcs.services.agents.rotating_llm import rotating_llm
from srcs.tools.mcp_tools import fetch_motor_policy_guidelines, fetch_parts_pricing_guide, fetch_quotation_workflow_guide

StateLike = Union[ClaimWorkflowState, ClusterState]


def get_doc_content(state: StateLike, doc_type: str) -> str:
    """Helper to retrieve document content based on its tagged category."""
    return get_doc_info(state, doc_type)["content"]


def get_doc_info(state: StateLike, doc_type: str) -> dict[str, str]:
    """Return ``{"filename", "content"}`` for the document tagged as doc_type.

    Surfacing the stored filename lets agents cite the exact name (which may
    include prefixes like ``uploaded_0_``) instead of a guessed original name.
    """
    tagged_docs = state.get("case_facts", {}).get("tagged_documents", {})
    doc_index = next(
        (
            k
            for k, v in tagged_docs.items()
            if (isinstance(v, list) and doc_type in v) or v == doc_type
        ),
        None,
    )

    if doc_index is None:
        return {"filename": "", "content": "[Document missing or not tagged correctly]"}

    docs = state.get("documents", []) or []
    try:
        idx = int(doc_index)
    except (TypeError, ValueError):
        return {"filename": "", "content": "[Error retrieving document content]"}

    if idx >= len(docs):
        return {"filename": "", "content": "[Document index out of range]"}

    entry = docs[idx] or {}
    return {
        "filename": entry.get("filename", "") or "",
        "content": entry.get("content", "") or "[No content available]",
    }


def _build_available_files_block(
    state: StateLike,
    allowed_filenames: Optional[set[str]] = None,
) -> str:
    """List every uploaded file so the agent can only cite real filenames."""
    docs = state.get("documents", []) or []
    if not docs:
        return "  (no documents uploaded)"

    lines: list[str] = []
    for d in docs:
        filename = d.get("filename") or ""
        if not filename:
            continue
        if allowed_filenames is not None and filename not in allowed_filenames:
            continue
        source_type = d.get("source_type") or "document"
        slot = d.get("slot") or ""
        descriptor = f" [{slot}]" if slot else ""
        lines.append(f"  - {filename} (type: {source_type}){descriptor}")
    return "\n".join(lines) if lines else "  (no documents uploaded)"


def build_citation_instruction(
    state: StateLike,
    node_id: str,
    allowed_filenames: Optional[list[str]] = None,
    reference_filenames: Optional[list[str]] = None,
) -> str:
    """Render the mandatory citation block appended to every agent prompt.

    Uses exact stored filenames from ``state["documents"]`` so the agent
    cannot invent or guess names.
    """
    allowed = {name for name in (allowed_filenames or []) if name}
    available = _build_available_files_block(state, allowed or None)
    scope_rule = (
        "Use only the files listed in Available Files for this task."
        if allowed
        else "Use only the exact stored filenames listed below."
    )
    references = [name for name in (reference_filenames or []) if name]
    reference_block = ""
    if references:
        reference_list = "\n".join(f"  - {name}" for name in references)
        reference_block = f"""
For MCP/reference documents:
  {{
    "filename": "<one of the Reference Files below>",
    "source_type": "reference",
    "excerpt": "<short verbatim quote from that reference document>",
    "comment": "<what this reference rule states>",
    "conclusion": "<which benchmark/default/judgment this supports>",
    "node_id": "{node_id}",
    "field_path": "<output field name>"
  }}

Reference Files:
{reference_list}
"""
    return f"""
CITATION REQUIREMENT (MANDATORY):
Every output field in "data" must be backed by at least one citation.
Do NOT guess filenames. {scope_rule}

Format your "citations" array as a list of objects with these schemas:

For text documents (PDFs, reports, transcripts):
  {{
    "filename": "<exact stored filename>",
    "source_type": "text",
    "excerpt": "<short verbatim quote from that document, 8-120 chars>",
    "comment": "<what this passage states>",
    "conclusion": "<which output field this supports>",
    "node_id": "{node_id}",
    "field_path": "<output field name, e.g. 'claim_type' or 'liability_percent'>"
  }}

Text citation rules:
  - Prefer short stable values/phrases: policy numbers, names, registration numbers, amounts, dates, or exact incident phrases.
  - Do not cite long addresses unless necessary.
  - Do not use ellipses (...), summaries, or reconstructed label/value lines.
  - If a label and value are split by PDF extraction, cite the value itself, e.g. "ALZ/2024/07/5566789" instead of "Policy No.: ALZ/2024/07/5566789".
  - Do NOT include line breaks (\\n) in excerpts — every excerpt must be a single continuous line of text.
  - Do NOT cite document titles or section headers (e.g. "Police Report", "Workshop Quotation") — cite specific content values instead.

For images (vehicle photos, damage closeups, ID scans):
  {{
    "filename": "<exact stored filename>",
    "source_type": "image",
    "excerpt": null,
    "comment": "<what is visible in the image — describe the damage/evidence>",
    "conclusion": "<which output field this supports>",
    "node_id": "{node_id}",
    "field_path": "<output field name>"
  }}

{reference_block}

Available Files (use only these exact filenames):
{available}

Final response shape:
{{
  "data": {{...your domain-specific output...}},
  "reasoning": "...",
  "citations": [ ... ]
}}
"""


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
    "verified_total": None,  # Force escalation if truly missing
    "verified_parts": 0.0,
    "verified_labour": 0.0,
    "verified_paint": 0.0,
    "verified_towing": 0.0,
    "suspicious_parts": [],
}


def _ensure_damage_fields(data: dict[str, Any]) -> dict[str, Any]:
    """Merge safe defaults and perform auto-summation if total is missing."""
    raw_data = data.get("data", data)
    merged = {**_DAMAGE_DEFAULTS, **{k: v for k, v in raw_data.items() if v is not None}}

    if merged["verified_total"] is None:
        component_sum = (
            float(merged["verified_parts"])
            + float(merged["verified_labour"])
            + float(merged["verified_paint"])
            + float(merged["verified_towing"])
        )
        if component_sum > 0:
            merged["verified_total"] = component_sum

    return merged


def _annotate_node_id(citations: list[dict[str, Any]], node_id: str) -> list[dict[str, Any]]:
    """Ensure every citation carries the producing node_id, even if the LLM omitted it."""
    out: list[dict[str, Any]] = []
    for c in citations or []:
        if not isinstance(c, dict):
            continue
        if not c.get("node_id"):
            c = {**c, "node_id": node_id}
        out.append(c)
    return out


async def policy_analysis_task(
    state: ClusterState, feedback: Optional[str] = None
) -> dict[str, Any]:
    """Analyzes the insurance policy for coverage, excess, and limits.

    Uses an MCP tool to fetch authoritative policy guidelines before analysis
    so every extraction decision is grounded in standard industry rules.
    """
    node_id = "policy_analysis_task"
    doc = get_doc_info(state, "policy_covernote")
    citation_block = build_citation_instruction(state, node_id, [doc["filename"]])

    # MCP tool call — load authoritative policy guidelines
    policy_guidelines = fetch_motor_policy_guidelines()

    prompt = f"""
    You are a Policy Specialist. Analyze the provided policy document.

    AUTHORITATIVE POLICY GUIDELINES (fetched via MCP tool):
    {policy_guidelines}

    DOCUMENT (filename: {doc['filename']}):
    {doc['content']}

    Feedback from auditor/human: {feedback if feedback else "None"}

    IMPORTANT EXTRACTION RULES:
    1. You MUST extract every field below. Do NOT omit any.
    2. Refer to the Policy Guidelines above for depreciation schedules and standard terms.
    3. If a value cannot be found in the document, apply the defaults in the guidelines:
       - claim_type: "own_damage"
       - max_payout_myr: 50000.0
       - excess_myr: 0.0
       - depreciation_percent: 0.0
    4. excess_myr is the policy excess / deductible the insured must pay.
       Look for keywords: "Excess", "Deductible", "Policy Excess".
    5. CITATION RULE FOR DEFAULTED FIELDS: If a field was not found in the document
       and you applied a system default, you still need a citation. Use any stable
       identifier already present in the document (e.g. policy number, insured name,
       or effective date) as the excerpt, and set comment to
       "Field not stated in document; system default applied."
       Every field — whether extracted or defaulted — must have exactly one citation.

    {citation_block}
    """

    try:
        response = await rotating_llm.send_message_get_json(
            prompt,
            temperature=0.0,
            mock_data={"data": _POLICY_DEFAULTS, "reasoning": "Mocked", "citations": []}
        )
        raw = response.json_data if response.json_data else {}
        data = raw.get("data", raw)
        return {
            "data": _ensure_policy_fields(data),
            "reasoning": raw.get("reasoning", "Extracted with defaults"),
            "citations": _annotate_node_id(raw.get("citations", []), node_id),
        }
    except Exception as e:
        return {
            "data": _POLICY_DEFAULTS.copy(),
            "reasoning": f"Extraction failed ({e}), using safe defaults",
            "citations": [],
        }


async def liability_narrative_task(
    state: ClusterState, feedback: Optional[str] = None
) -> dict[str, Any]:
    """Extracts and analyzes the incident narrative from police reports."""
    node_id = "liability_narrative_task"
    doc = get_doc_info(state, "police_report")
    citation_block = build_citation_instruction(state, node_id, [doc["filename"]])

    prompt = f"""
    You are a Liability Adjuster. Extract the incident narrative from the police report.

    DOCUMENT (filename: {doc['filename']}):
    {doc['content']}

    Feedback: {feedback if feedback else "None"}

    {citation_block}
    """
    try:
        response = await rotating_llm.send_message_get_json(
            prompt,
            temperature=0.0,
            mock_data={"data": {}, "reasoning": "Mocked", "citations": []}
        )
        raw = response.json_data if response.json_data else {}
        return {
            "data": raw.get("data", raw),
            "reasoning": raw.get("reasoning", "Extracted"),
            "citations": _annotate_node_id(raw.get("citations", []), node_id),
        }
    except Exception as e:
        return {"data": {}, "reasoning": f"Error: {str(e)}", "citations": []}


async def liability_poi_task(
    state: ClusterState, feedback: Optional[str] = None
) -> dict[str, Any]:
    """Analyzes descriptions to determine the Point of Impact (POI)."""
    node_id = "liability_poi_task"
    plate_doc = get_doc_info(state, "car_photo_plate")
    closeup_doc = get_doc_info(state, "damage_closeup")
    citation_block = build_citation_instruction(
        state,
        node_id,
        [plate_doc["filename"], closeup_doc["filename"]],
    )

    prompt = f"""
    You are a Visual Forensic Analyst. Determine the Point of Impact (POI) from the damage descriptions.

    DOCUMENT (filename: {plate_doc['filename']}):
    {plate_doc['content']}

    DOCUMENT (filename: {closeup_doc['filename']}):
    {closeup_doc['content']}

    Feedback: {feedback if feedback else "None"}

    Required JSON in "data":
    - poi_location: "front" | "rear" | "left_side" | "right_side"
    - damage_severity: "minor" | "moderate" | "severe"

    {citation_block}
    """
    try:
        response = await rotating_llm.send_message_get_json(
            prompt,
            temperature=0.0,
            mock_data={"data": {"poi_location": "front", "damage_severity": "minor"}, "reasoning": "Mocked", "citations": []}
        )
        raw = response.json_data if response.json_data else {}
        return {
            "data": raw.get("data", raw),
            "reasoning": raw.get("reasoning", "Extracted"),
            "citations": _annotate_node_id(raw.get("citations", []), node_id),
        }
    except Exception as e:
        return {"data": {}, "reasoning": f"Error: {str(e)}", "citations": []}


async def damage_quote_audit_task(
    state: ClusterState, feedback: Optional[str] = None
) -> dict[str, Any]:
    """Audits the workshop quote for part costs and necessity.

    Uses an MCP tool to fetch the quotation workflow guide so that
    validation decisions reference standard document submission and
    repair procedures.
    """
    node_id = "damage_quote_audit_task"
    doc = get_doc_info(state, "workshop_quote")
    citation_block = build_citation_instruction(state, node_id, [doc["filename"]])

    # MCP tool call — load quotation workflow guide
    quotation_guide = fetch_quotation_workflow_guide()

    prompt = f"""
    You are a Damage Assessor. Audit the workshop repair quote.

    AUTHORITATIVE QUOTATION WORKFLOW GUIDE (fetched via MCP tool):
    {quotation_guide}

    DOCUMENT (filename: {doc['filename']}):
    {doc['content']}

    Feedback: {feedback if feedback else "None"}

    IMPORTANT: Extract the cost breakdown in MYR.
    If a value is not explicitly found, return 0.0 for that field.
    Use the quotation validation checklist above to verify each line item.

    CITATION SOURCE GUIDANCE: All citations must come from the workshop quote document above.
    When citing a line item, use a short single-line excerpt such as the part name and amount
    (e.g. "Rear Right Fender 1,200.00") — do not copy multi-line table rows or document headers.
    The Quotation Workflow Guide is an authoritative MCP reference, not an uploaded document;
    do not attempt to cite it.

    REQUIRED JSON FIELDS in "data":
    - verified_total: float (Total approved repair estimate)
    - verified_parts: float (Total for parts)
    - verified_labour: float (Total for labour hours)
    - verified_paint: float (Total for paint/refinishing)
    - verified_towing: float (Towing charges if any)
    - suspicious_parts: list[str] (List parts that seem overpriced or unnecessary)

    {citation_block}
    """
    try:
        response = await rotating_llm.send_message_get_json(
            prompt,
            temperature=0.0,
            mock_data={"data": _DAMAGE_DEFAULTS, "reasoning": "Mocked", "citations": []}
        )
        raw = response.json_data if response.json_data else {}
        return {
            "data": _ensure_damage_fields(raw),
            "reasoning": raw.get("reasoning", "Extracted"),
            "citations": _annotate_node_id(raw.get("citations", []), node_id),
        }
    except Exception as e:
        return {
            "data": _DAMAGE_DEFAULTS.copy(),
            "reasoning": f"Error during extraction: {str(e)}",
            "citations": [],
        }


async def pricing_validation_task(
    state: ClusterState, feedback: Optional[str] = None
) -> dict[str, Any]:
    """Cross-references workshop quote line items against the authoritative
    pricing reference fetched via MCP tool.

    Returns a structured validation verdict flagging overpriced or
    suspicious items with benchmark justification.
    """
    node_id = "pricing_validation_task"
    doc = get_doc_info(state, "workshop_quote")
    citation_block = build_citation_instruction(
        state,
        node_id,
        [doc["filename"]],
        reference_filenames=["parts_pricing_guide"],
    )

    # MCP tool call — load authoritative parts & labour pricing guide
    pricing_guide = fetch_parts_pricing_guide()

    prompt = f"""
    You are a Pricing Auditor. Your job is to validate the workshop repair quote against
    the authoritative pricing reference below.

    AUTHORITATIVE PARTS & LABOUR PRICING GUIDE (fetched via MCP tool):
    {pricing_guide}

    WORKSHOP QUOTE (filename: {doc['filename']}):
    {doc['content']}

    Feedback: {feedback if feedback else "None"}

    TASK:
    1. For each line item in the quote, compare it against the pricing benchmark ranges.
    2. Flag items that exceed the OEM/Standard upper bound by more than 20%.
    3. Flag items inconsistent with the stated damage type or vehicle model.
    4. Provide an overall pricing verdict.

    CITATION SOURCE GUIDANCE:
    - Use source_type="text" with filename "{doc['filename']}" for quoted workshop line items and total amounts.
    - Use source_type="reference" with filename "parts_pricing_guide" for benchmark ranges.
    - Benchmark excerpts must be exact rows or phrases from the Authoritative Parts & Labour Pricing Guide.

    REQUIRED JSON FIELDS in "data":
    - pricing_verdict: "acceptable" | "overpriced" | "suspicious"
    - flagged_items: list of objects with {{ "item": str, "quoted_myr": float, "benchmark_range": str, "issue": str }}
    - total_quoted_myr: float (sum of all quoted items)
    - recommended_adjustment_myr: float (how much to deduct; 0.0 if acceptable)
    - summary: str (one-sentence verdict explanation)

    {citation_block}
    """
    try:
        response = await rotating_llm.send_message_get_json(prompt, temperature=0.0)
        raw = response.json_data if response.json_data else {}
        return {
            "data": raw.get("data", raw),
            "reasoning": raw.get("reasoning", "Pricing cross-check complete"),
            "citations": _annotate_node_id(raw.get("citations", []), node_id),
        }
    except Exception as e:
        return {"data": {}, "reasoning": f"Pricing validation error: {str(e)}", "citations": []}


async def fraud_assessment_task(
    state: ClusterState, feedback: Optional[str] = None
) -> dict[str, Any]:
    """Checks for suspicious patterns or inconsistencies indicating fraud."""
    node_id = "fraud_assessment_task"
    citation_block = build_citation_instruction(state, node_id)

    # Fraud needs context from every document — label each block with its filename
    # so the model can attribute conclusions correctly.
    docs = state.get("documents", []) or []
    context_blocks = [
        f"DOCUMENT (filename: {d.get('filename', '')}):\n{d.get('content', '')}"
        for d in docs
    ]
    context = "\n\n".join(context_blocks) if context_blocks else "(no documents)"

    prompt = f"""
    You are a Fraud Investigator. Check for inconsistencies across all documents.

    ALL DOCUMENTS:
    {context}

    Feedback: {feedback if feedback else "None"}

    Required JSON in "data":
    - suspicion_score: float (0.0 to 1.0)
    - red_flags: list[str]

    {citation_block}
    """
    try:
        response = await rotating_llm.send_message_get_json(
            prompt,
            temperature=0.0,
            mock_data={"data": {"suspicion_score": 0.0, "red_flags": []}, "reasoning": "Mocked", "citations": []}
        )
        raw = response.json_data if response.json_data else {}
        return {
            "data": raw.get("data", raw),
            "reasoning": raw.get("reasoning", "Extracted"),
            "citations": _annotate_node_id(raw.get("citations", []), node_id),
        }
    except Exception as e:
        return {"data": {}, "reasoning": f"Error: {str(e)}", "citations": []}


async def entity_extraction_task(
    state: Union[ClaimWorkflowState, ClusterState], feedback: Optional[str] = None
) -> dict[str, Any]:
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
        response = await rotating_llm.send_message_get_json(
            prompt,
            temperature=0.0,
            mock_data={
                "data": {
                    "claim_no": "CLM-MOCK-999",
                    "policy_no": "POL-MOCK-123",
                    "insured_name": "MOCK USER",
                    "vehicle_no": "MOCK 8888",
                    "accident_date": "2024-01-01"
                },
                "reasoning": "Mock mode enabled."
            }
        )
        raw = response.json_data if response.json_data else {}
        return {"data": raw.get("data", raw), "reasoning": raw.get("reasoning", "Extracted")}
    except Exception as e:
        return {"data": {}, "reasoning": f"Error: {str(e)}"}
