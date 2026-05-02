"""Case service: lifecycle, snapshot building, officer actions, stub pipeline.

Real agent implementations live in `srcs/services/agents/` and plug in by
calling `SseService.emit(case_id, ...)` and mutating `CaseState` through this
service. Until then the stub pipeline below emits the full v5 SSE contract so
the frontend can integrate end-to-end.

Concurrency discipline
----------------------
- Officer-facing endpoints (approve/decline/message) MUST mutate `CaseState`
  inside `async with CaseStore.lock()`.
- Pipeline helpers in this module (e.g. `emit_agent_status`,
  `emit_agent_output`, `generate_artifacts`) are invoked from background
  pipeline tasks and mutate state without acquiring the store lock. This is
  safe under asyncio because each helper completes its synchronous mutations
  before the next `await`, and officer endpoints are gated by status checks
  that reject `RUNNING` cases. Do not call these helpers from request
  handlers without first reasoning about that invariant.
- Known open issue: `approve_case` still holds the global store lock across
  artifact I/O (medium-severity contention). A concurrent-approve race was
  identified during review and is intentionally deferred — fixing it
  correctly needs a per-case lock or an `approval_in_progress` reservation
  flag rather than a naive lock split.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any, Optional

from fastapi import HTTPException

from srcs.config import get_settings
from srcs.schemas.case_dto import (
    AgentId,
    AgentStatus,
    ArtifactInfo,
    ArtifactType,
    AuditorTrigger,
    BlackboardSection,
    CaseSnapshot,
    CaseStatus,
    DocumentInfo,
    ErrorCode,
    AgentStateInfo,
    OfficerMessageInfo,
    OfficerMessageType,
    SseAgentMessageToAgentData,
    SseAgentOutputData,
    SseAgentStatusChangedData,
    SseArtifactCreatedData,
    SseWorkflowCompletedData,
    SseWorkflowStartedData,
)
from srcs.services.case_store import (
    ArtifactRecord,
    CaseState,
    CaseStore,
    InvalidStatusTransition,
    OfficerMessageRecord,
    is_terminal,
    is_valid_case_id,
    now_iso,
    transition_status,
)
from srcs.services.sse_service import SseService
from srcs.schemas.chat_dto import SseRepliesData, SseNotifData

logger = logging.getLogger(__name__)
from srcs.schemas.state import ClaimWorkflowState, WorkflowNodes
from srcs.services.workflow_engine import (
    run_workflow_with_sse,
    resume_workflow_with_sse as resume_workflow_with_sse_engine,
    TOPOLOGY
)
from srcs.services.pdf_service import (
    RepairApprovalData,
    CostBreakdown,
    generate_repair_approval_pdf,
    get_report_path
)


# -- Error helper -------------------------------------------------------------

class ApiError(HTTPException):
    """HTTPException carrying a contract `code` alongside `detail`.

    A scoped exception handler in `main.py` serialises this to the documented
    `{"detail": ..., "code": ...}` top-level shape (see api_sse_plan.md §4.2).
    Framework / stdlib `HTTPException`s are left untouched so headers like
    `WWW-Authenticate` keep working on auth flows.
    """

    def __init__(self, status_code: int, code: ErrorCode, detail: str) -> None:
        super().__init__(status_code=status_code, detail=detail)
        self.code = code.value


def api_error(status_code: int, code: ErrorCode, detail: str) -> ApiError:
    return ApiError(status_code, code, detail)


# -- Category mapping ---------------------------------------------------------

_CATEGORY_TO_AGENT: dict[str, AgentId] = {
    "Fault determination": AgentId.LIABILITY,
    "Policy coverage": AgentId.POLICY,
    "Fraud assessment": AgentId.FRAUD,
    "Payout amount": AgentId.PAYOUT,
}

_CATEGORY_OPTIONS: list[str] = list(_CATEGORY_TO_AGENT.keys())


# -- Path helpers -------------------------------------------------------------

def case_upload_dir(case_id: str) -> str:
    settings = get_settings()
    path = os.path.join(settings.UPLOAD_DIR, case_id)
    os.makedirs(path, exist_ok=True)
    return path


def case_artifact_dir(case_id: str) -> str:
    path = os.path.join(case_upload_dir(case_id), "artifacts")
    os.makedirs(path, exist_ok=True)
    return path


# -- Lookups -----------------------------------------------------------------

def require_case(case_id: str) -> CaseState:
    if not is_valid_case_id(case_id):
        raise api_error(400, ErrorCode.INVALID_CASE_ID, "Invalid case ID format")
    state = CaseStore.get(case_id)
    if state is None:
        raise api_error(404, ErrorCode.CASE_NOT_FOUND, "Case not found")
    return state


# -- Snapshot builders --------------------------------------------------------

def _document_info_for(state: CaseState) -> list[DocumentInfo]:
    docs: list[DocumentInfo] = []
    base = f"/api/v1/cases/{state.case_id}/documents"
    
    # Use tagged mapping if available to set the correct public doc_type
    tagged_docs = (state.case_facts or {}).get("tagged_documents", {})

    def add(doc_type: str, path: Optional[str]) -> None:
        if path:
            docs.append(
                DocumentInfo(
                    doc_type=doc_type,
                    filename=os.path.basename(path),
                    url=f"{base}/{doc_type}",
                    text_url=f"{base}/{doc_type}/text",
                )
            )

    if state.uploaded_document_paths:
        for i, path in enumerate(state.uploaded_document_paths):
            # Map index-based uploads to their tagged roles (defaulting to "uploaded")
            raw_tags = tagged_docs.get(str(i), "uploaded")
            if isinstance(raw_tags, list):
                public_doc_type = raw_tags[0] if raw_tags else "uploaded"
            else:
                public_doc_type = raw_tags

            docs.append(
                DocumentInfo(
                    doc_type=public_doc_type,
                    filename=os.path.basename(path),
                    url=f"{base}/uploaded/{i}",
                    text_url=f"{base}/uploaded/{i}/text",
                    index=i,
                    tags=raw_tags if isinstance(raw_tags, list) else [raw_tags]
                )
            )
    else:
        add("police_report", state.police_report_path)
        add("policy_pdf", state.policy_pdf_path)
        add("repair_quotation", state.repair_quotation_path)
        add("adjuster_report", state.adjuster_report_path)
        for i, p in enumerate(state.photo_paths):
            docs.append(
                DocumentInfo(
                    doc_type="photo",
                    filename=os.path.basename(p),
                    url=f"{base}/photo/{i}",
                    text_url=f"{base}/photo/{i}/text",
                    index=i,
                )
            )
    if state.chat_transcript:
        docs.append(
            DocumentInfo(
                doc_type="chat_transcript",
                filename="chat_transcript.txt",
                url=f"{base}/chat_transcript",
            )
        )
    return docs


def _artifact_info_for(state: CaseState) -> list[ArtifactInfo]:
    base = f"/api/v1/cases/{state.case_id}/artifacts"
    return [
        ArtifactInfo(
            artifact_type=rec.artifact_type,
            filename=rec.filename,
            url=f"{base}/{rec.artifact_type.value}",
            ready=os.path.exists(rec.path),
            version=rec.version,
            superseded=rec.superseded,
        )
        for rec in state.artifacts
    ]


def _blackboard_for(state: CaseState) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for section in BlackboardSection:
        data = state.section_data(section)
        if data is not None:
            out[section.value] = data
    return out


# Metadata for agents (purpose and prompts)
AGENT_METADATA = {
    AgentId.INTAKE: {
        "purpose": "Categorizes and validates incoming claim documents for completeness.",
        "prompt": "You are an expert intake agent. Identify document types and check for missing evidence."
    },
    AgentId.POLICY: {
        "purpose": "Analyzes policy documents to determine coverage limits, excess, and exclusions.",
        "prompt": "Extract policy details precisely. Check if the incident type is covered under the specific plan."
    },
    AgentId.LIABILITY: {
        "purpose": "Determines the fault split between the insured and third parties based on narratives.",
        "prompt": "Be impartial and use standard motor liability guidelines. Determine % of fault."
    },
    AgentId.DAMAGE: {
        "purpose": "Audits workshop quotations against industry standard pricing and photo evidence.",
        "prompt": "Identify overpriced parts or labour that does not match the damage photos."
    },
    AgentId.FRAUD: {
        "purpose": "Evaluates the claim for red flags and suspicious patterns using cross-referenced data.",
        "prompt": "Check for common fraud indicators: staging, exaggerated damage, or inconsistencies."
    },
    AgentId.PAYOUT: {
        "purpose": "Calculates the final settlement amount after applying depreciation, excess, and liability.",
        "prompt": "Ensure mathematical accuracy. Final payout = (Estimate - Depr) * (1 - Fault) - Excess."
    },
    AgentId.AUDITOR: {
        "purpose": "Reviewer that ensures consistency across all agent findings before final approval.",
        "prompt": "Double check that Payout logic matches Policy and Liability findings."
    }
}


def build_snapshot(state: CaseState) -> CaseSnapshot:
    return CaseSnapshot(
        case_id=state.case_id,
        status=state.status,
        submitted_at=state.submitted_at,
        documents=_document_info_for(state),
        agents={
            agent.value: AgentStateInfo(
                status=rs.status,
                started_at=rs.started_at,
                completed_at=rs.completed_at,
                purpose=AGENT_METADATA.get(agent, {}).get("purpose"),
                system_prompt=AGENT_METADATA.get(agent, {}).get("prompt"),
                logs=rs.logs,
                sub_tasks={
                    name: AgentStateInfo(
                        status=sub_rs.status,
                        started_at=sub_rs.started_at,
                        completed_at=sub_rs.completed_at,
                        logs=sub_rs.logs
                    )
                    for name, sub_rs in rs.sub_tasks.items()
                }
            )
            for agent, rs in state.agent_states.items()
        },
        blackboard=_blackboard_for(state),
        # Citations keyed by exact BlackboardSection.value strings so the
        # frontend hydrates directly from snapshot.citations[section].
        citations={
            BlackboardSection.POLICY_VERDICT.value: list(state.policy_citations),
            BlackboardSection.LIABILITY_VERDICT.value: list(state.liability_citations),
            BlackboardSection.DAMAGE_RESULT.value: list(state.damage_citations),
            BlackboardSection.FRAUD_ASSESSMENT.value: list(state.fraud_citations),
            BlackboardSection.AUDIT_RESULT.value: list(state.auditor_citations),
        },
        artifacts=_artifact_info_for(state),
        officer_messages=[
            OfficerMessageInfo(
                message_id=m.message_id,
                role=m.role,  # type: ignore[arg-type]
                message=m.message,
                type=m.type,
                target_agent=m.target_agent,
                timestamp=m.timestamp,
            )
            for m in state.officer_messages
        ],
        auditor_loop_count=state.auditor_loop_count,
        officer_challenge_count=state.officer_challenge_count,
        awaiting_clarification=state.awaiting_clarification,
        chatbox_enabled=state.chatbox_enabled(),
        current_agent=state.current_agent,
        topology=TOPOLOGY
    )


# -- SSE emit helpers ---------------------------------------------------------

async def emit_agent_status(
    state: CaseState, agent: AgentId, status: AgentStatus
) -> None:
    def _active_agent() -> Optional[AgentId]:
        current_agent = state.current_agent
        if current_agent is not None:
            current_state = state.agent_states[current_agent]
            if current_state.status in (AgentStatus.WORKING, AgentStatus.WAITING):
                return current_agent
        active_agents = [
            candidate
            for candidate, candidate_state in state.agent_states.items()
            if candidate_state.status in (AgentStatus.WORKING, AgentStatus.WAITING)
        ]
        return active_agents[-1] if active_agents else None

    rs = state.agent_states[agent]
    timestamp = now_iso()
    rs.status = status
    if status is AgentStatus.WORKING:
        rs.started_at = timestamp
        state.current_agent = agent
    elif status is AgentStatus.WAITING:
        state.current_agent = agent
    elif status in (AgentStatus.COMPLETED, AgentStatus.ERROR):
        rs.completed_at = timestamp
        state.current_agent = _active_agent()
    await SseService.emit(
        state.case_id,
        SseAgentStatusChangedData(
            case_id=state.case_id,
            timestamp=timestamp,
            agent=agent,
            status=status,
        ),
    )


async def emit_agent_output(
    state: CaseState,
    agent: AgentId,
    section: BlackboardSection,
    data: dict[str, Any],
) -> None:
    state.set_section_data(section, data)
    await SseService.emit(
        state.case_id,
        SseAgentOutputData(
            case_id=state.case_id,
            timestamp=now_iso(),
            agent=agent,
            section=section,
            data=data,
        ),
    )


async def emit_message_to_agent(
    state: CaseState,
    *,
    from_agent: AgentId,
    to_agent: AgentId,
    message: str,
    reason: str,
    trigger: AuditorTrigger,
    loop_count: int,
    message_id: Optional[str] = None,
) -> None:
    await SseService.emit(
        state.case_id,
        SseAgentMessageToAgentData(
            case_id=state.case_id,
            timestamp=now_iso(),
            from_agent=from_agent,
            to_agent=to_agent,
            message_type="challenge",
            message=message,
            reason=reason,
            loop_count=loop_count,
            trigger=trigger,
            message_id=message_id,
        ),
    )


# -- Artifact generation (stub) ----------------------------------------------

def _next_artifact_version(state: CaseState, artifact_type: ArtifactType) -> int:
    existing = [a for a in state.artifacts if a.artifact_type == artifact_type]
    if not existing:
        return 1
    return max(a.version for a in existing) + 1


def _supersede_artifacts(state: CaseState, artifact_type: ArtifactType) -> None:
    for a in state.artifacts:
        if a.artifact_type == artifact_type and not a.superseded:
            a.superseded = True


def _write_pdf_artifact(path: str, content: bytes) -> None:
    with open(path, "wb") as f:
        f.write(content)


def _write_json_artifact(path: str, payload: dict[str, Any]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


_REQUIRED_ARTIFACT_TYPES: tuple[ArtifactType, ...] = (
    ArtifactType.DECISION_PDF,
    ArtifactType.AUDIT_TRAIL_JSON,
)


def current_artifacts_ready(state: CaseState) -> bool:
    """True iff every required artifact type has a non-superseded record
    whose file exists on disk.

    `generate_artifacts` is not atomic across PDF and audit JSON — it awaits
    an SSE emit between writing the two — so a PDF record alone does not
    imply the audit trail is ready. Callers that need "both artifacts are
    truly available" (approve flow, `pdf_ready` response flag) must use this
    helper instead of a single-type check.
    """
    for a_type in _REQUIRED_ARTIFACT_TYPES:
        rec = next(
            (
                r
                for r in state.artifacts
                if r.artifact_type == a_type and not r.superseded
            ),
            None,
        )
        if rec is None or not os.path.exists(rec.path):
            return False
    return True


def build_repair_approval_data(state: CaseState) -> RepairApprovalData:
    """Bridges blackboard sections to the PDF data model."""
    facts = state.section_data(BlackboardSection.CASE_FACTS) or {}
    payout = state.section_data(BlackboardSection.PAYOUT_RECOMMENDATION) or {}
    breakdown = payout.get("payout_breakdown") or {}
    
    # Use fallback defaults if facts are missing
    return RepairApprovalData(
        claim_no=facts.get("claim_no") or state.case_id,
        policy_no=facts.get("policy_no") or "N/A",
        insured_name=facts.get("insured_name") or "VALUED CUSTOMER",
        nric=facts.get("nric") or "N/A",
        vehicle_no=facts.get("vehicle_no") or "N/A",
        vehicle_model=facts.get("vehicle_model") or "N/A",
        accident_date=facts.get("accident_date") or "N/A",
        report_date=facts.get("report_date") or now_iso()[:10],
        workshop_name=facts.get("workshop_name") or "AUTHORIZED PANEL",
        workshop_code=facts.get("workshop_code") or "PANEL-001",
        workshop_address=facts.get("workshop_address") or "N/A",
        workshop_phone=facts.get("workshop_phone") or "N/A",
        costs=CostBreakdown(
            parts=float(breakdown.get("verified_parts") or 0.0),
            labour=float(breakdown.get("verified_labour") or 0.0),
            paint=float(breakdown.get("verified_paint") or 0.0),
            towing=float(breakdown.get("verified_towing") or 0.0),
            misc=0.0
        ),
        approved_by="MyClaim Agentic Engine",
        designation="Autonomous Claims Strategist",
        date=now_iso()[:10]
    )


async def generate_artifacts(state: CaseState) -> None:
    """Write stub artifacts and emit `artifact.created` for each."""
    adir = case_artifact_dir(state.case_id)

    pdf_version = _next_artifact_version(state, ArtifactType.DECISION_PDF)
    pdf_name = f"claim_decision_{state.case_id}_v{pdf_version}.pdf"
    
    # Generate real PDF using reportlab via pdf_service
    try:
        pdf_data = build_repair_approval_data(state)
        # We need to ensure the filename matches our versioned name
        # but the pdf_service uses its own suffix. We'll rename it after.
        temp_path = await asyncio.to_thread(generate_repair_approval_pdf, pdf_data)
        pdf_path = os.path.join(adir, pdf_name)
        if os.path.exists(temp_path):
            os.replace(temp_path, pdf_path)
        else:
            # Fallback to stub if generator failed
            await asyncio.to_thread(_write_pdf_artifact, pdf_path, b"%PDF-1.4\n% stub decision\n")
    except Exception as e:
        logger.error(f"Failed to generate real PDF: {e}")
        pdf_path = os.path.join(adir, pdf_name)
        await asyncio.to_thread(_write_pdf_artifact, pdf_path, b"%PDF-1.4\n% stub decision\n")

    _supersede_artifacts(state, ArtifactType.DECISION_PDF)
    state.artifacts.append(
        ArtifactRecord(
            artifact_type=ArtifactType.DECISION_PDF,
            filename=pdf_name,
            version=pdf_version,
            path=pdf_path,
        )
    )
    state.decision_pdf_path = pdf_path
    await SseService.emit(
        state.case_id,
        SseArtifactCreatedData(
            case_id=state.case_id,
            timestamp=now_iso(),
            artifact_type=ArtifactType.DECISION_PDF,
            filename=pdf_name,
            url=f"/api/v1/cases/{state.case_id}/artifacts/decision_pdf",
            version=pdf_version,
        ),
    )

    json_version = _next_artifact_version(state, ArtifactType.AUDIT_TRAIL_JSON)
    json_name = f"audit_trail_{state.case_id}_v{json_version}.json"
    json_path = os.path.join(adir, json_name)
    # Check for technical errors in clusters to apply watermark
    has_errors = any(
        rs.status == AgentStatus.ERROR or any(sub.status == AgentStatus.ERROR for sub in rs.sub_tasks.values())
        for rs in state.agent_states.values()
    )

    payload = {
        "case_id": state.case_id,
        "generated_at": now_iso(),
        "version": json_version,
        "blackboard": _blackboard_for(state),
        "auditor_loop_count": state.auditor_loop_count,
        "officer_challenge_count": state.officer_challenge_count,
        "manual_override_disclaimer": "TECHNICAL OVERRIDE: One or more autonomous checks failed or were bypassed." if has_errors else None
    }
    await asyncio.to_thread(_write_json_artifact, json_path, payload)

    _supersede_artifacts(state, ArtifactType.AUDIT_TRAIL_JSON)
    state.artifacts.append(
        ArtifactRecord(
            artifact_type=ArtifactType.AUDIT_TRAIL_JSON,
            filename=json_name,
            version=json_version,
            path=json_path,
        )
    )
    state.audit_trail_path = json_path
    await SseService.emit(
        state.case_id,
        SseArtifactCreatedData(
            case_id=state.case_id,
            timestamp=now_iso(),
            artifact_type=ArtifactType.AUDIT_TRAIL_JSON,
            filename=json_name,
            url=f"/api/v1/cases/{state.case_id}/artifacts/audit_trail_json",
            version=json_version,
        ),
    )


# -- Stub agent outputs -------------------------------------------------------

def _stub_section(section: BlackboardSection, state: CaseState) -> dict[str, Any]:
    if section is BlackboardSection.CASE_FACTS:
        return {
            "incident_summary": "Stub intake output — real agents not yet wired.",
            "vehicles": [],
            "narrative": "Stub narrative — real Intake agent will populate.",
            "police_verdict_summary": "",
            "photo_count": len(state.photo_paths),
            "extraction_confidence": 0.5,
        }
    if section is BlackboardSection.POLICY_VERDICT:
        return {
            "is_covered": True,
            "claim_type": "own_damage",
            "max_payout_myr": 50000,
            "excess_myr": 500,
            "exclusions": [],
        }
    if section is BlackboardSection.LIABILITY_VERDICT:
        return {
            "fault_split": {"insured": 100, "third_party": 0},
            "reasoning": "Stub liability reasoning.",
            "citations": [],
        }
    if section is BlackboardSection.FRAUD_ASSESSMENT:
        return {"suspicion_score": 0.1, "signals": [], "escalate": False}
    if section is BlackboardSection.PAYOUT_RECOMMENDATION:
        return {
            "recommended_action": "approve",
            "payout_breakdown": {
                "repair_estimate_myr": 5000,
                "liability_adjusted_myr": 5000,
                "excess_deducted_myr": 4500,
                "ncd_adjusted_myr": 4500,
                "depreciation_deducted_myr": 0,
                "final_payout_myr": 4500,
            },
            "rationale": "Stub payout rationale.",
            "confidence": 0.8,
        }
    if section is BlackboardSection.AUDIT_RESULT:
        return {"verdict": "approve", "challenges": [], "reasoning": "Stub audit."}
    return {}


# -- Pipeline (stub) ----------------------------------------------------------

_STEP_DELAY_SECONDS = 0.4  # visible but quick for demo replay


async def _run_agent_stub(
    state: CaseState, agent: AgentId, section: BlackboardSection
) -> None:
    await emit_agent_status(state, agent, AgentStatus.WORKING)
    await asyncio.sleep(_STEP_DELAY_SECONDS)
    await emit_agent_output(state, agent, section, _stub_section(section, state))
    await emit_agent_status(state, agent, AgentStatus.COMPLETED)


# -- Workflow State Mapper ---------------------------------------------------

_WORKFLOW_DOC_SLOTS: tuple[tuple[str, str, str, Optional[str]], ...] = (
    ("police_report", "police_report_path", "police_report", "police_report"),
    ("policy_pdf", "policy_pdf_path", "policy_covernote", "policy_pdf"),
    ("repair_quotation", "repair_quotation_path", "workshop_quote", "repair_quotation"),
    ("road_tax", "road_tax_path", "road_tax_reg", "road_tax"),
    ("adjuster_report", "adjuster_report_path", "adjuster_report", "adjuster_report"),
)


def _extraction_for(case: CaseState, slot: str) -> dict[str, Any]:
    extraction = case.document_extractions.get(slot)
    return extraction if isinstance(extraction, dict) else {}


def _content_from_extraction(case: CaseState, slot: str) -> str:
    extraction = _extraction_for(case, slot)
    text = extraction.get("text")
    if isinstance(text, str) and text.strip():
        return text

    method = extraction.get("method", "not_extracted")
    error = extraction.get("error") or extraction.get("gemini_error")
    if error:
        return f"[Extraction unavailable via {method}: {error}]"
    return "[No extracted content available]"


def _workflow_document(
    case: CaseState,
    *,
    slot: str,
    path: Optional[str],
    source_type: str,
    doc_type_hint: str,
) -> Optional[dict[str, Any]]:
    if not path:
        return None

    extraction = _extraction_for(case, slot)
    return {
        "slot": slot,
        "filename": os.path.basename(path),
        "source_type": source_type,
        "doc_type": doc_type_hint,
        "content": _content_from_extraction(case, slot),
        "extraction_method": extraction.get("method", "not_extracted"),
        "extraction_error": extraction.get("error") or extraction.get("gemini_error"),
        "path": path,
    }


def _source_type_for_path(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    if ext in {".jpg", ".jpeg", ".png"}:
        return "image"
    if ext in {".pdf", ".docx", ".doc", ".pptx", ".ppt"}:
        return "document"
    return "unknown"


def _to_workflow_state(case: CaseState) -> ClaimWorkflowState:
    """Maps internal CaseState to LangGraph ClaimWorkflowState."""
    docs = []
    if case.uploaded_document_paths:
        for index, path in enumerate(case.uploaded_document_paths):
            source_type = _source_type_for_path(path)
            doc = _workflow_document(
                case,
                slot=f"uploaded_{index}",
                path=path,
                source_type=source_type,
                doc_type_hint="photo" if source_type == "image" else "unknown",
            )
            if doc:
                docs.append(doc)
    else:
        for slot, attr_name, doc_type_hint, source_type in _WORKFLOW_DOC_SLOTS:
            doc = _workflow_document(
                case,
                slot=slot,
                path=getattr(case, attr_name),
                source_type=source_type or "document",
                doc_type_hint=doc_type_hint,
            )
            if doc:
                docs.append(doc)

        for i, path in enumerate(case.photo_paths):
            doc = _workflow_document(
                case,
                slot=f"photo_{i}",
                path=path,
                source_type="image",
                doc_type_hint="photo",
            )
            if doc:
                docs.append(doc)

    return {
        "case_id": case.case_id,
        "documents": docs,
        "processed_indices": [],
        "case_facts": case.case_facts or {},
        "policy_results": case.policy_verdict or {},
        "liability_results": case.liability_verdict or {},
        "damage_results": case.damage_result or {},
        "fraud_results": case.fraud_assessment or {},
        "payout_results": case.payout_recommendation or {},
        "auditor_results": case.audit_result or {},
        "policy_citations": list(case.policy_citations),
        "liability_citations": list(case.liability_citations),
        "damage_citations": list(case.damage_citations),
        "fraud_citations": list(case.fraud_citations),
        "auditor_citations": list(case.auditor_citations),
        "trace_log": [],
        "active_challenge": None,
        "status": case.status.value,
        "current_agent": case.current_agent.value if case.current_agent else None,
        "latest_user_message": None,
        "human_audit_log": case.human_audit_log or [],
        "force_approve": False,
        "human_decision_reason": None,
        "human_decision": None
    }


async def run_pipeline(case_id: str) -> None:
    """Background entry point for the agentic workflow."""
    state = CaseStore.get(case_id)
    if state is None:
        return

    async with CaseStore.lock(case_id):
        try:
            transition_status(state, CaseStatus.RUNNING)
        except InvalidStatusTransition:
            return
        state.auditor_loop_count = 0

    await SseService.emit(
        case_id,
        SseWorkflowStartedData(
            case_id=case_id,
            timestamp=now_iso(),
            trigger="submit",
            documents=[
                os.path.basename(p)
                for p in [
                    state.police_report_path,
                    state.policy_pdf_path,
                    state.repair_quotation_path,
                    state.adjuster_report_path,
                    *state.photo_paths,
                ]
                if p
            ],
        ),
    )

    # UI: Start spinner for Intake immediately
    await emit_agent_status(state, AgentId.INTAKE, AgentStatus.WORKING)

    try:
        # Assemble initial state for LangGraph
        initial_workflow_state = _to_workflow_state(state)
        
        # Execute the Agentic Graph
        final_state_wrapper = await run_workflow_with_sse(case_id, initial_workflow_state)

        # 2. Check for interrupts (HITL or Missing Docs)
        # If the graph has 'next' nodes, it means it hit an interrupt point.
        if final_state_wrapper and final_state_wrapper.next:
            async with CaseStore.lock(case_id):
                if WorkflowNodes.WAIT_FOR_DOCS in final_state_wrapper.next:
                    transition_status(state, CaseStatus.AWAITING_DOCS)
                elif WorkflowNodes.DECISION_GATE in final_state_wrapper.next:
                    # Case reached auditor decision point, awaiting officer action
                    transition_status(state, CaseStatus.AWAITING_APPROVAL)
                
                state.current_agent = None
            return

        # 3. Normal completion (Reached END)
        # Sync back final artifacts (SSE for this will be separate or handled by frontend refresh)
        await generate_artifacts(state)

        async with CaseStore.lock(case_id):
            if state.status == CaseStatus.RUNNING:
                transition_status(state, CaseStatus.AWAITING_APPROVAL)
            state.current_agent = None
    except Exception:
        async with CaseStore.lock(case_id):
            try:
                transition_status(state, CaseStatus.FAILED)
            except InvalidStatusTransition:
                pass
        raise


# -- Partial rerun (stub) -----------------------------------------------------

_RERUN_CHAINS: dict[AgentId, list[tuple[AgentId, BlackboardSection]]] = {
    AgentId.POLICY: [
        (AgentId.POLICY, BlackboardSection.POLICY_VERDICT),
        (AgentId.PAYOUT, BlackboardSection.PAYOUT_RECOMMENDATION),
        (AgentId.AUDITOR, BlackboardSection.AUDIT_RESULT),
    ],
    AgentId.LIABILITY: [
        (AgentId.LIABILITY, BlackboardSection.LIABILITY_VERDICT),
        (AgentId.PAYOUT, BlackboardSection.PAYOUT_RECOMMENDATION),
        (AgentId.AUDITOR, BlackboardSection.AUDIT_RESULT),
    ],
    AgentId.FRAUD: [
        (AgentId.FRAUD, BlackboardSection.FRAUD_ASSESSMENT),
        (AgentId.PAYOUT, BlackboardSection.PAYOUT_RECOMMENDATION),
        (AgentId.AUDITOR, BlackboardSection.AUDIT_RESULT),
    ],
    AgentId.PAYOUT: [
        (AgentId.PAYOUT, BlackboardSection.PAYOUT_RECOMMENDATION),
        (AgentId.AUDITOR, BlackboardSection.AUDIT_RESULT),
    ],
}


async def run_partial_pipeline(
    case_id: str, target_agent: AgentId, message_id: str, officer_message: str
) -> None:
    """Handles surgical reruns triggered by human feedback."""
    state = CaseStore.get(case_id)
    if state is None:
        return

    await SseService.emit(
        case_id,
        SseWorkflowStartedData(
            case_id=case_id,
            timestamp=now_iso(),
            trigger="officer_rerun",
            target_agent=target_agent,
            message_id=message_id,
        ),
    )

    # Chat feedback
    await SseService.emit(
        case_id,
        SseNotifData(message=f"Instruction received. Rerunning {target_agent.value} analysis...")
    )
    
    # Map the human feedback into the active_challenge for the graph
    workflow_state = _to_workflow_state(state)
    workflow_state["latest_user_message"] = officer_message
    
    try:
        # Re-run the graph with the new challenge
        await run_workflow_with_sse(case_id, workflow_state)

        await generate_artifacts(state)

        async with CaseStore.lock(case_id):
            if state.status == CaseStatus.RUNNING:
                transition_status(state, CaseStatus.AWAITING_APPROVAL)
            state.current_agent = None
    except Exception:
        async with CaseStore.lock(case_id):
            try:
                transition_status(state, CaseStatus.FAILED)
            except InvalidStatusTransition:
                pass
        raise


async def resume_workflow_with_sse(
    case_id: str, 
    *, 
    operator_name: Optional[str] = None,
    action: Optional[str] = None,
    reason: Optional[str] = None,
    force_approve: bool = False
) -> None:
    """Service-layer entry point for resuming the agentic workflow."""
    state = CaseStore.get(case_id)
    if state is None:
        return

    # 1. Safety Guard: Verify case is in a resumable status
    if state.status not in (CaseStatus.AWAITING_APPROVAL, CaseStatus.ESCALATED, CaseStatus.AWAITING_DOCS):
        return

    # 2. Audit Logging & Final Decision Setup
    async with CaseStore.lock(case_id):
        if operator_name and action:
            audit_entry = {
                "timestamp": now_iso(),
                "operator": operator_name,
                "action": action,
                "reason": reason
            }
            state.human_audit_log.append(audit_entry)
            
        if force_approve:
            state.operator_decision = "approved"
            state.approved_at = now_iso()
            state.operator_decision_reason = reason or "Manual override"

    # 3. Transition to RUNNING
    async with CaseStore.lock(case_id):
        try:
            transition_status(state, CaseStatus.RUNNING)
        except InvalidStatusTransition:
            return

    # 3. Emit Workflow Started (Resumption)
    await SseService.emit(
        case_id,
        SseWorkflowStartedData(
            case_id=case_id,
            timestamp=now_iso(),
            trigger="submit" if action == "upload_docs" else "officer_rerun",
        ),
    )

    try:
        from srcs.schemas.state import WorkflowAction

        # 4. Prepare updates for the graph
        updates = {
            "human_audit_log": [
                {
                    "action": WorkflowAction.FORCE_APPROVE if action == "approve" else action,
                    "reasoning": reason or "No reasoning provided.",
                    "operator_id": operator_name or "System",
                    "timestamp": now_iso()
                }
            ],
            "force_approve": force_approve,
            "human_decision": {
                "action": WorkflowAction.FORCE_APPROVE,
                "reasoning": reason or "Manual intervention",
                "operator_id": operator_name or "System",
                "timestamp": now_iso()
            } if action == "approve" else None
        }
        
        # If we are resuming for docs, we need to refresh the documents list
        if action == "upload_docs":
            workflow_state = _to_workflow_state(state)
            updates["documents"] = workflow_state["documents"]
            updates["status"] = "running" # Clear the awaiting_docs status in the graph

        # 5. Execute Resumption
        from srcs.services.workflow_engine import resume_workflow_with_sse as resume_workflow_with_sse_engine
        final_state_wrapper = await resume_workflow_with_sse_engine(case_id, updates)

        # 6. Check for interrupts (HITL or Missing Docs)
        if final_state_wrapper and final_state_wrapper.next:
            async with CaseStore.lock(case_id):
                if WorkflowNodes.WAIT_FOR_DOCS in final_state_wrapper.next:
                    transition_status(state, CaseStatus.AWAITING_DOCS)
                elif WorkflowNodes.DECISION_GATE in final_state_wrapper.next:
                    transition_status(state, CaseStatus.AWAITING_APPROVAL)
                
                state.current_agent = None
            return

        # 7. Normal completion
        await generate_artifacts(state)

        async with CaseStore.lock(case_id):
            if state.status == CaseStatus.RUNNING:
                transition_status(state, CaseStatus.AWAITING_APPROVAL)
                # When the operator triggered this resumption via approve+sign
                # (force_approve=True from /cases/{id}/approve), advance through
                # AWAITING_APPROVAL straight to APPROVED so dashboards and the
                # action bar reflect the terminal state. Without this the case
                # lingers as "pending review" forever.
                if force_approve:
                    try:
                        transition_status(state, CaseStatus.APPROVED)
                    except InvalidStatusTransition:
                        pass
            state.current_agent = None
    except Exception:
        async with CaseStore.lock(case_id):
            try:
                transition_status(state, CaseStatus.FAILED)
            except InvalidStatusTransition:
                pass
        raise


# -- Officer actions ---------------------------------------------------------

def _next_message_id(state: CaseState) -> str:
    return f"msg_{len(state.officer_messages) + 1:03d}"


def _classify_freeform(message: str) -> Optional[AgentId]:
    """Very small keyword classifier — real pipeline replaces this."""
    m = message.lower()
    if any(k in m for k in ("fault", "liability", "who caused", "percentage")):
        return AgentId.LIABILITY
    if any(k in m for k in ("policy", "coverage", "covered", "exclusion")):
        return AgentId.POLICY
    if any(k in m for k in ("fraud", "suspicious", "fake")):
        return AgentId.FRAUD
    if any(k in m for k in ("payout", "amount", "payment", "money", "settle")):
        return AgentId.PAYOUT
    return None


def resolve_category(message: str) -> AgentId:
    agent = _CATEGORY_TO_AGENT.get(message)
    if agent is None:
        raise api_error(
            400,
            ErrorCode.UNKNOWN_CATEGORY,
            f"Unknown category: {message}",
        )
    return agent


def ensure_action_allowed(state: CaseState) -> None:
    """Common guard for approve/decline/message."""
    if is_terminal(state.status):
        raise api_error(409, ErrorCode.CASE_TERMINAL, "Case is already terminal")
    if state.status == CaseStatus.RUNNING:
        raise api_error(409, ErrorCode.PIPELINE_RUNNING, "Pipeline is running")
    if state.status not in (CaseStatus.AWAITING_APPROVAL, CaseStatus.ESCALATED):
        raise api_error(409, ErrorCode.INVALID_STATUS, "Action not allowed in current status")


def classify_officer_message(
    state: CaseState, body_message: str, body_type: OfficerMessageType
) -> tuple[Optional[AgentId], OfficerMessageRecord]:
    """Append the officer message, determine target agent.

    Returns (target_agent or None for clarification, stored record).
    """
    record = OfficerMessageRecord(
        message_id=_next_message_id(state),
        role="officer",
        message=body_message,
        type=body_type.value,
    )
    state.officer_messages.append(record)

    if body_type is OfficerMessageType.CATEGORY_SELECTION:
        target = resolve_category(body_message)
        record.target_agent = target
        return target, record

    target = _classify_freeform(body_message)
    if target is not None:
        record.target_agent = target
        return target, record

    # Clarification needed
    state.awaiting_clarification = True
    clarification_text = (
        "Could you be more specific about which part of the decision"
        " seems wrong?"
    )
    clarification_record = OfficerMessageRecord(
        message_id=_next_message_id(state),
        role="system",
        message=clarification_text,
        type="clarification",
    )
    state.officer_messages.append(clarification_record)

    # Emit SSE so the chat UI updates immediately
    asyncio.create_task(
        SseService.emit(
            state.case_id,
            SseRepliesData(
                message_id=clarification_record.message_id,
                text=clarification_text
            )
        )
    )

    return None, record


def category_options() -> list[str]:
    return list(_CATEGORY_OPTIONS)
