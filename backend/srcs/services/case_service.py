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

    def add(doc_type: str, path: Optional[str]) -> None:
        if path:
            docs.append(
                DocumentInfo(
                    doc_type=doc_type,
                    filename=os.path.basename(path),
                    url=f"{base}/{doc_type}",
                )
            )

    add("police_report", state.police_report_path)
    add("policy_pdf", state.policy_pdf_path)
    add("repair_quotation", state.repair_quotation_path)
    add("adjuster_report", state.adjuster_report_path)
    if state.chat_transcript:
        docs.append(
            DocumentInfo(
                doc_type="chat_transcript",
                filename="chat_transcript.txt",
                url=f"{base}/chat_transcript",
            )
        )
    for i, p in enumerate(state.photo_paths):
        docs.append(
            DocumentInfo(
                doc_type="photo",
                filename=os.path.basename(p),
                url=f"{base}/photo/{i}",
                index=i,
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
            )
            for agent, rs in state.agent_states.items()
        },
        blackboard=_blackboard_for(state),
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


async def generate_artifacts(state: CaseState) -> None:
    """Write stub artifacts and emit `artifact.created` for each."""
    adir = case_artifact_dir(state.case_id)

    pdf_version = _next_artifact_version(state, ArtifactType.DECISION_PDF)
    pdf_name = f"claim_decision_{state.case_id}_v{pdf_version}.pdf"
    pdf_path = os.path.join(adir, pdf_name)
    # Stub PDF payload — a teammate will swap this for ReportLab output.
    await asyncio.to_thread(
        _write_pdf_artifact, pdf_path, b"%PDF-1.4\n% stub decision\n"
    )

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
    payload = {
        "case_id": state.case_id,
        "generated_at": now_iso(),
        "version": json_version,
        "blackboard": _blackboard_for(state),
        "auditor_loop_count": state.auditor_loop_count,
        "officer_challenge_count": state.officer_challenge_count,
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


async def run_pipeline(case_id: str) -> None:
    """Background entry point for the initial pipeline run."""
    state = CaseStore.get(case_id)
    if state is None:
        return

    async with CaseStore.lock():
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

    try:
        await _run_agent_stub(state, AgentId.INTAKE, BlackboardSection.CASE_FACTS)

        # Fan out policy/liability/fraud
        await asyncio.gather(
            _run_agent_stub(state, AgentId.POLICY, BlackboardSection.POLICY_VERDICT),
            _run_agent_stub(
                state, AgentId.LIABILITY, BlackboardSection.LIABILITY_VERDICT
            ),
            _run_agent_stub(
                state, AgentId.FRAUD, BlackboardSection.FRAUD_ASSESSMENT
            ),
        )

        await _run_agent_stub(
            state, AgentId.PAYOUT, BlackboardSection.PAYOUT_RECOMMENDATION
        )
        await _run_agent_stub(
            state, AgentId.AUDITOR, BlackboardSection.AUDIT_RESULT
        )

        await generate_artifacts(state)

        async with CaseStore.lock():
            transition_status(state, CaseStatus.AWAITING_APPROVAL)
            state.current_agent = None

        await SseService.emit(
            case_id,
            SseWorkflowCompletedData(
                case_id=case_id,
                timestamp=now_iso(),
                status=CaseStatus.AWAITING_APPROVAL,
                pdf_ready=True,
                auditor_loop_count=state.auditor_loop_count,
                officer_challenge_count=state.officer_challenge_count,
                chatbox_enabled=state.chatbox_enabled(),
            ),
        )
    except Exception:
        async with CaseStore.lock():
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
    state = CaseStore.get(case_id)
    if state is None:
        return

    chain = _RERUN_CHAINS.get(target_agent)
    if chain is None:
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
    await emit_message_to_agent(
        state,
        from_agent=AgentId.AUDITOR,
        to_agent=target_agent,
        message=(
            f"Officer challenged the {target_agent.value} decision. "
            "Re-evaluate and propagate changes downstream."
        ),
        reason=officer_message,
        trigger=AuditorTrigger.OFFICER_MESSAGE,
        loop_count=0,
        message_id=message_id,
    )

    try:
        for agent, section in chain:
            await _run_agent_stub(state, agent, section)

        await generate_artifacts(state)

        async with CaseStore.lock():
            transition_status(state, CaseStatus.AWAITING_APPROVAL)
            state.current_agent = None

        await SseService.emit(
            case_id,
            SseWorkflowCompletedData(
                case_id=case_id,
                timestamp=now_iso(),
                status=CaseStatus.AWAITING_APPROVAL,
                pdf_ready=True,
                auditor_loop_count=state.auditor_loop_count,
                officer_challenge_count=state.officer_challenge_count,
                chatbox_enabled=state.chatbox_enabled(),
            ),
        )
    except Exception:
        async with CaseStore.lock():
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
    state.officer_messages.append(
        OfficerMessageRecord(
            message_id=_next_message_id(state),
            role="system",
            message=(
                "Could you be more specific about which part of the decision"
                " seems wrong?"
            ),
            type="clarification",
        )
    )
    return None, record


def category_options() -> list[str]:
    return list(_CATEGORY_OPTIONS)
