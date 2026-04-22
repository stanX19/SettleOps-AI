"""Claims Engine case routes.

See `docs/api_sse_plan.md` for the authoritative public API contract.
"""
from __future__ import annotations

import asyncio
import mimetypes
import os
import shutil
from typing import Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.responses import FileResponse, StreamingResponse

from srcs.schemas.case_dto import (
    ApproveResponse,
    ArtifactType,
    CaseCreateResponse,
    CaseListItem,
    CaseSnapshot,
    CaseStatus,
    ClarificationPayload,
    DeclineRequest,
    DeclineResponse,
    ErrorCode,
    MessageClarificationResponse,
    MessageRequest,
    MessageRerunResponse,
    OfficerMessageType,
)
from srcs.services.case_service import (
    api_error,
    build_snapshot,
    case_upload_dir,
    category_options,
    classify_officer_message,
    ensure_action_allowed,
    generate_artifacts,
    require_case,
    run_partial_pipeline,
    run_pipeline,
)
from srcs.services.case_store import (
    CaseState,
    CaseStore,
    InvalidStatusTransition,
    is_terminal,
    is_valid_case_id,
    now_iso,
    transition_status,
)
from srcs.services.sse_service import SseService


router = APIRouter(prefix="/api/v1/cases", tags=["cases"])


# -- Upload constraints ------------------------------------------------------

_MB = 1024 * 1024
_PDF_MAX = 10 * _MB
_PHOTO_MAX = 5 * _MB

_PDF_MIMES = {"application/pdf"}
_PHOTO_MIMES = {"image/jpeg", "image/png"}


def _safe_name(name: Optional[str]) -> str:
    """Strip path components and leading dots from a client-supplied filename.

    Defends against path traversal (`../`, absolute paths, Windows `\\`) by
    keeping only the basename. Leading dots are stripped so the result can't
    masquerade as a hidden file or `..`. Empty input falls back to `"file"`.
    """
    base = os.path.basename((name or "").replace("\\", "/"))
    base = base.lstrip(".")
    return base or "file"


async def _save_upload(upload: UploadFile, dest_path: str, max_bytes: int) -> int:
    """Stream *upload* to *dest_path*, enforcing *max_bytes*.

    Removes the partially-written file and raises 413 if the limit is exceeded.
    The caller is responsible for cleaning up sibling files if an earlier
    upload in the same request failed.
    """
    total = 0
    try:
        with open(dest_path, "wb") as f:
            while True:
                chunk = await upload.read(1024 * 64)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise api_error(
                        413,
                        ErrorCode.FILE_TOO_LARGE,
                        f"File exceeds limit ({max_bytes // _MB} MB): {upload.filename}",
                    )
                f.write(chunk)
    except BaseException:
        # Ensure the half-written file never lingers.
        if os.path.exists(dest_path):
            try:
                os.remove(dest_path)
            except OSError:
                pass
        raise
    return total


def _require_mime(upload: UploadFile, allowed: set[str]) -> None:
    if upload.content_type not in allowed:
        raise api_error(
            400,
            ErrorCode.INVALID_FILE_TYPE,
            f"Unsupported file type: {upload.content_type} ({upload.filename})",
        )


# -- Create case --------------------------------------------------------------

@router.post("", response_model=CaseCreateResponse, status_code=201)
async def create_case(
    background: BackgroundTasks,
    police_report: UploadFile = File(...),
    policy_pdf: UploadFile = File(...),
    repair_quotation: UploadFile = File(...),
    photos: list[UploadFile] = File(...),
    adjuster_report: Optional[UploadFile] = File(None),
    chat_transcript: Optional[str] = Form(None),
) -> CaseCreateResponse:
    if not photos:
        raise api_error(
            400, ErrorCode.MISSING_REQUIRED_FILES, "At least one photo is required"
        )

    _require_mime(police_report, _PDF_MIMES)
    _require_mime(policy_pdf, _PDF_MIMES)
    _require_mime(repair_quotation, _PDF_MIMES)
    for p in photos:
        _require_mime(p, _PHOTO_MIMES)
    if adjuster_report is not None:
        _require_mime(adjuster_report, _PDF_MIMES)

    case_id = CaseStore.new_case_id()
    upload_dir = case_upload_dir(case_id)

    try:
        police_path = os.path.join(
            upload_dir, f"police_report_{_safe_name(police_report.filename)}"
        )
        policy_path = os.path.join(
            upload_dir, f"policy_pdf_{_safe_name(policy_pdf.filename)}"
        )
        quote_path = os.path.join(
            upload_dir, f"repair_quotation_{_safe_name(repair_quotation.filename)}"
        )
        await _save_upload(police_report, police_path, _PDF_MAX)
        await _save_upload(policy_pdf, policy_path, _PDF_MAX)
        await _save_upload(repair_quotation, quote_path, _PDF_MAX)

        photo_paths: list[str] = []
        for i, p in enumerate(photos):
            path = os.path.join(upload_dir, f"photo_{i}_{_safe_name(p.filename)}")
            await _save_upload(p, path, _PHOTO_MAX)
            photo_paths.append(path)

        adjuster_path: Optional[str] = None
        if adjuster_report is not None:
            adjuster_path = os.path.join(
                upload_dir,
                f"adjuster_report_{_safe_name(adjuster_report.filename)}",
            )
            await _save_upload(adjuster_report, adjuster_path, _PDF_MAX)

        transcript_path: Optional[str] = None
        if chat_transcript:
            transcript_path = os.path.join(upload_dir, "chat_transcript.txt")
            with open(transcript_path, "w", encoding="utf-8") as f:
                f.write(chat_transcript)
    except BaseException:
        # Any upload failure wipes the per-case directory so no orphaned
        # files linger on disk and no half-initialised case enters the store.
        shutil.rmtree(upload_dir, ignore_errors=True)
        raise

    state = CaseState(
        case_id=case_id,
        submitted_at=now_iso(),
        status=CaseStatus.SUBMITTED,
        police_report_path=police_path,
        policy_pdf_path=policy_path,
        repair_quotation_path=quote_path,
        adjuster_report_path=adjuster_path,
        photo_paths=photo_paths,
        chat_transcript=transcript_path,
    )
    CaseStore.add(state)

    background.add_task(run_pipeline, case_id)

    return CaseCreateResponse(case_id=case_id, status=state.status)


# -- List / detail ------------------------------------------------------------

@router.get("", response_model=list[CaseListItem])
async def list_cases() -> list[CaseListItem]:
    return [
        CaseListItem(
            case_id=s.case_id,
            status=s.status,
            submitted_at=s.submitted_at,
            current_agent=s.current_agent,
        )
        for s in CaseStore.all()
    ]


@router.get("/{case_id}", response_model=CaseSnapshot)
async def get_case(case_id: str) -> CaseSnapshot:
    state = require_case(case_id)
    return build_snapshot(state)


# -- SSE stream ---------------------------------------------------------------

@router.get("/{case_id}/stream")
async def stream_case(case_id: str, request: Request) -> StreamingResponse:
    if not is_valid_case_id(case_id):
        raise api_error(400, ErrorCode.INVALID_CASE_ID, "Invalid case ID format")
    if CaseStore.get(case_id) is None:
        raise api_error(404, ErrorCode.CASE_NOT_FOUND, "Case not found")

    queue = SseService.subscribe(case_id)

    async def _event_generator():
        yield ": ready\n\n"
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    msg = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield f"event: {msg['event']}\ndata: {msg['data']}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            SseService.unsubscribe(case_id, queue)

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# -- Document download -------------------------------------------------------

_DOC_FIELDS: dict[str, str] = {
    "police_report": "police_report_path",
    "policy_pdf": "policy_pdf_path",
    "repair_quotation": "repair_quotation_path",
    "adjuster_report": "adjuster_report_path",
    "chat_transcript": "chat_transcript",
}


@router.get("/{case_id}/documents/{doc_type}")
async def get_document(case_id: str, doc_type: str) -> FileResponse:
    state = require_case(case_id)
    field = _DOC_FIELDS.get(doc_type)
    if field is None:
        raise api_error(404, ErrorCode.INVALID_DOC_TYPE, "Document type not recognized")
    path = getattr(state, field)
    if not path or not os.path.exists(path):
        raise api_error(404, ErrorCode.DOCUMENT_NOT_FOUND, "Document not uploaded")
    media_type, _ = mimetypes.guess_type(path)
    return FileResponse(path, media_type=media_type or "application/octet-stream")


@router.get("/{case_id}/documents/photo/{index}")
async def get_photo(case_id: str, index: int) -> FileResponse:
    state = require_case(case_id)
    if index < 0 or index >= len(state.photo_paths):
        raise api_error(404, ErrorCode.INVALID_DOC_TYPE, "Photo index out of range")
    path = state.photo_paths[index]
    if not os.path.exists(path):
        raise api_error(404, ErrorCode.DOCUMENT_NOT_FOUND, "Photo missing on disk")
    media_type, _ = mimetypes.guess_type(path)
    return FileResponse(path, media_type=media_type or "image/jpeg")


# -- Artifact download -------------------------------------------------------

_ARTIFACT_MEDIA = {
    ArtifactType.DECISION_PDF: "application/pdf",
    ArtifactType.AUDIT_TRAIL_JSON: "application/json",
}


@router.get("/{case_id}/artifacts/{artifact_type}")
async def get_artifact(case_id: str, artifact_type: str) -> FileResponse:
    state = require_case(case_id)
    try:
        a_type = ArtifactType(artifact_type)
    except ValueError:
        raise api_error(
            404, ErrorCode.ARTIFACT_NOT_READY, "Unknown artifact type"
        )
    latest = None
    for rec in state.artifacts:
        if rec.artifact_type == a_type and not rec.superseded:
            latest = rec
            break
    if latest is None or not os.path.exists(latest.path):
        raise api_error(
            404, ErrorCode.ARTIFACT_NOT_READY, "Artifact is not generated yet"
        )
    return FileResponse(
        latest.path,
        media_type=_ARTIFACT_MEDIA[a_type],
        filename=latest.filename,
    )


# -- Officer: approve --------------------------------------------------------

@router.post("/{case_id}/approve", response_model=ApproveResponse)
async def approve_case(case_id: str) -> ApproveResponse:
    state = require_case(case_id)
    if state.status not in (CaseStatus.AWAITING_APPROVAL, CaseStatus.ESCALATED):
        raise api_error(
            409, ErrorCode.INVALID_STATUS, "Approve is only valid when awaiting officer"
        )

    async with CaseStore.lock():
        # If escalated with no active artifacts, generate before approval.
        has_current_pdf = any(
            r.artifact_type == ArtifactType.DECISION_PDF and not r.superseded
            for r in state.artifacts
        )
        if state.status == CaseStatus.ESCALATED and not has_current_pdf:
            await generate_artifacts(state)

        state.operator_decision = "approved"
        state.approved_at = now_iso()
        try:
            transition_status(state, CaseStatus.APPROVED)
        except InvalidStatusTransition as exc:
            raise api_error(409, ErrorCode.INVALID_STATUS, str(exc))

    return ApproveResponse(status=state.status, pdf_ready=True)


# -- Officer: decline --------------------------------------------------------

@router.post("/{case_id}/decline", response_model=DeclineResponse)
async def decline_case(case_id: str, body: DeclineRequest) -> DeclineResponse:
    state = require_case(case_id)
    if state.status not in (CaseStatus.AWAITING_APPROVAL, CaseStatus.ESCALATED):
        raise api_error(
            409, ErrorCode.INVALID_STATUS, "Decline is only valid when awaiting officer"
        )

    async with CaseStore.lock():
        state.operator_decision = "declined"
        state.operator_decision_reason = body.reason
        try:
            transition_status(state, CaseStatus.DECLINED)
        except InvalidStatusTransition as exc:
            raise api_error(409, ErrorCode.INVALID_STATUS, str(exc))

    return DeclineResponse(status=state.status)


# -- Officer: message (challenge / clarification) ---------------------------

@router.post("/{case_id}/message")
async def officer_message(
    case_id: str,
    body: MessageRequest,
    background: BackgroundTasks,
):
    state = require_case(case_id)

    async with CaseStore.lock():
        # Re-check preconditions inside the lock so a concurrent pipeline
        # transition (or another officer message) can't slip past the guard
        # between validation and mutation.
        ensure_action_allowed(state)
        if state.officer_challenge_count >= 2:
            raise api_error(
                409,
                ErrorCode.CHALLENGES_EXHAUSTED,
                "Officer has used both challenge attempts",
            )

        target, record = classify_officer_message(state, body.message, body.type)

        if target is None:
            return MessageClarificationResponse(
                message_id=record.message_id,
                clarification=ClarificationPayload(
                    message=(
                        "Could you be more specific about which part of the decision"
                        " seems wrong?"
                    ),
                    options=category_options(),
                ),
            )

        # Actionable — supersede current decision artifacts, bump counter,
        # transition to running, and fire the partial rerun.
        state.officer_challenge_count += 1
        state.auditor_loop_count = 0
        state.awaiting_clarification = False
        for rec in state.artifacts:
            rec.superseded = True

        try:
            transition_status(state, CaseStatus.RUNNING)
        except InvalidStatusTransition as exc:
            raise api_error(409, ErrorCode.INVALID_STATUS, str(exc))

    background.add_task(
        run_partial_pipeline,
        case_id,
        target,
        record.message_id,
        body.message,
    )

    return MessageRerunResponse(
        message_id=record.message_id,
        target_agent=target,
        officer_challenge_count=state.officer_challenge_count,
    )
