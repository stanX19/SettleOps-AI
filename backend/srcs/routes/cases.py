"""Claims Engine case routes.

See `docs/api_sse_plan.md` for the authoritative public API contract.
"""
from __future__ import annotations

import asyncio
import io
import logging
import mimetypes
import os
import shutil
from typing import Any, BinaryIO, Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    Form,
    Query,
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
)
from srcs.services.document_processor import extract_case_documents, extract_uploaded_documents
from srcs.services.case_service import (
    api_error,
    build_snapshot,
    case_upload_dir,
    category_options,
    classify_officer_message,
    current_artifacts_ready,
    ensure_action_allowed,
    generate_artifacts,
    require_case,
    run_partial_pipeline,
    run_pipeline,
    resume_workflow_with_sse,
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
from srcs.services.sse_service import CLOSE_EVENT_KEY, SseService


router = APIRouter(prefix="/api/v1/cases", tags=["cases"])
logger = logging.getLogger(__name__)


# -- Upload constraints ------------------------------------------------------

_MB = 1024 * 1024
_PDF_MAX = 10 * _MB
_PHOTO_MAX = 5 * _MB

_PDF_MIMES = {"application/pdf"}
_DOC_MIMES = {
    *_PDF_MIMES,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # .docx
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",  # .pptx
    "application/msword",  # .doc
    "application/vnd.ms-powerpoint",  # .ppt
}
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


def _write_upload_file(
    file_obj: BinaryIO,
    dest_path: str,
    max_bytes: int,
    filename: Optional[str],
) -> int:
    """Write a spooled upload file to disk, enforcing a byte limit."""
    total = 0
    try:
        with open(dest_path, "wb") as f:
            while True:
                chunk = file_obj.read(1024 * 64)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise api_error(
                        413,
                        ErrorCode.FILE_TOO_LARGE,
                        f"File exceeds limit ({max_bytes // _MB} MB): {filename}",
                    )
                f.write(chunk)
    except BaseException:
        if os.path.exists(dest_path):
            try:
                os.remove(dest_path)
            except OSError as cleanup_exc:
                logger.warning(
                    "Failed to remove partial upload %s after write failure: %s",
                    dest_path,
                    cleanup_exc,
                )
        raise
    return total


def _write_text_file(path: str, content: str) -> None:
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


async def _save_upload(upload: UploadFile, dest_path: str, max_bytes: int) -> int:
    """Stream *upload* to *dest_path*, enforcing *max_bytes*.

    Removes the partially-written file and raises 413 if the limit is exceeded.
    The caller is responsible for cleaning up sibling files if an earlier
    upload in the same request failed.
    """
    return await asyncio.to_thread(
        _write_upload_file,
        upload.file,
        dest_path,
        max_bytes,
        upload.filename,
    )


def _require_mime(upload: UploadFile, allowed: set[str]) -> None:
    if upload.content_type not in allowed:
        raise api_error(
            400,
            ErrorCode.INVALID_FILE_TYPE,
            f"Unsupported file type: {upload.content_type} ({upload.filename})",
        )


def _validate_case_uploads(
    police_report: Optional[UploadFile],
    policy_pdf: Optional[UploadFile],
    repair_quotation: Optional[UploadFile],
    photos: list[UploadFile],
    adjuster_report: Optional[UploadFile],
    documents: list[UploadFile] | None = None,
) -> None:
    if not photos:
        # We still want at least something to be uploaded to start,
        # but let's see if we should even allow 0 photos.
        # The prompt says "the workflow can self identify if something is missing".
        pass

    if police_report:
        _require_mime(police_report, _DOC_MIMES)
    if policy_pdf:
        _require_mime(policy_pdf, _DOC_MIMES)
    if repair_quotation:
        _require_mime(repair_quotation, _DOC_MIMES)
    for p in photos:
        _require_mime(p, _PHOTO_MIMES | _PDF_MIMES)
    if adjuster_report is not None:
        _require_mime(adjuster_report, _DOC_MIMES)
    for document in documents or []:
        _require_mime(document, _DOC_MIMES | _PHOTO_MIMES)


async def _save_case_uploads(
    case_id: str,
    police_report: Optional[UploadFile],
    policy_pdf: Optional[UploadFile],
    repair_quotation: Optional[UploadFile],
    photos: list[UploadFile],
    road_tax: Optional[UploadFile],
    adjuster_report: Optional[UploadFile],
    documents: list[UploadFile],
    chat_transcript: Optional[str],
) -> tuple[
    Optional[str],
    Optional[str],
    Optional[str],
    Optional[str],
    Optional[str],
    list[str],
    list[str],
    Optional[str],
]:
    upload_dir = case_upload_dir(case_id)
    saved_paths: list[str] = []

    try:
        police_path = None
        uploaded_document_paths: list[str] = []
        if police_report:
            police_path = os.path.join(
                upload_dir, f"police_report_{_safe_name(police_report.filename)}"
            )
            await _save_upload(police_report, police_path, _PDF_MAX)
            saved_paths.append(police_path)
            uploaded_document_paths.append(police_path)

        policy_path = None
        if policy_pdf:
            policy_path = os.path.join(
                upload_dir, f"policy_pdf_{_safe_name(policy_pdf.filename)}"
            )
            await _save_upload(policy_pdf, policy_path, _PDF_MAX)
            saved_paths.append(policy_path)
            uploaded_document_paths.append(policy_path)

        quote_path = None
        if repair_quotation:
            quote_path = os.path.join(
                upload_dir, f"repair_quotation_{_safe_name(repair_quotation.filename)}"
            )
            await _save_upload(repair_quotation, quote_path, _PDF_MAX)
            saved_paths.append(quote_path)
            uploaded_document_paths.append(quote_path)

        photo_paths: list[str] = []
        for i, p in enumerate(photos):
            path = os.path.join(upload_dir, f"photo_{i}_{_safe_name(p.filename)}")
            # Dynamic limit based on content type
            limit = _PDF_MAX if p.content_type in _PDF_MIMES else _PHOTO_MAX
            await _save_upload(p, path, limit)
            saved_paths.append(path)
            photo_paths.append(path)
            uploaded_document_paths.append(path)

        road_tax_path: Optional[str] = None
        if road_tax is not None:
            road_tax_path = os.path.join(
                upload_dir,
                f"road_tax_{_safe_name(road_tax.filename)}",
            )
            await _save_upload(road_tax, road_tax_path, _PDF_MAX)
            saved_paths.append(road_tax_path)
            uploaded_document_paths.append(road_tax_path)

        adjuster_path: Optional[str] = None
        if adjuster_report is not None:
            adjuster_path = os.path.join(
                upload_dir,
                f"adjuster_report_{_safe_name(adjuster_report.filename)}",
            )
            await _save_upload(adjuster_report, adjuster_path, _PDF_MAX)
            saved_paths.append(adjuster_path)
            uploaded_document_paths.append(adjuster_path)

        for i, document in enumerate(documents):
            path = os.path.join(
                upload_dir,
                f"uploaded_{i}_{_safe_name(document.filename)}",
            )
            limit = _PHOTO_MAX if document.content_type in _PHOTO_MIMES else _PDF_MAX
            await _save_upload(document, path, limit)
            saved_paths.append(path)
            uploaded_document_paths.append(path)

        transcript_path: Optional[str] = None
        if chat_transcript:
            transcript_path = os.path.join(upload_dir, "chat_transcript.txt")
            await asyncio.to_thread(_write_text_file, transcript_path, chat_transcript)
            saved_paths.append(transcript_path)
    except BaseException:
        for path in saved_paths:
            try:
                os.remove(path)
            except FileNotFoundError:
                pass
            except OSError as cleanup_exc:
                logger.warning(
                    "Failed to remove partial upload %s after request failure: %s",
                    path,
                    cleanup_exc,
                )
        raise

    return (
        police_path,
        policy_path,
        quote_path,
        road_tax_path,
        adjuster_path,
        photo_paths,
        uploaded_document_paths,
        transcript_path,
    )


# -- Create case --------------------------------------------------------------

@router.post("", response_model=CaseCreateResponse, status_code=201)
async def create_case_draft() -> CaseCreateResponse:
    case_id = CaseStore.new_case_id()
    state = CaseState(
        case_id=case_id,
        submitted_at=now_iso(),
        status=CaseStatus.DRAFT,
    )
    CaseStore.add(state)
    return CaseCreateResponse(case_id=case_id, status=state.status)


@router.post("/{case_id}/documents", response_model=CaseCreateResponse)
async def submit_case_documents(
    case_id: str,
    background: BackgroundTasks,
    police_report: Optional[UploadFile] = File(None),
    policy_pdf: Optional[UploadFile] = File(None),
    repair_quotation: Optional[UploadFile] = File(None),
    photos: list[UploadFile] = File([]),
    documents: list[UploadFile] = File([]),
    road_tax: Optional[UploadFile] = File(None),
    adjuster_report: Optional[UploadFile] = File(None),
    chat_transcript: Optional[str] = Form(None),
) -> CaseCreateResponse:
    state = require_case(case_id)
    if state.status not in (CaseStatus.DRAFT, CaseStatus.AWAITING_DOCS):
        raise api_error(
            409,
            ErrorCode.INVALID_STATUS,
            "Documents can only be submitted for a draft or awaiting_docs case",
        )

    has_new_uploads = bool(
        police_report
        or policy_pdf
        or repair_quotation
        or road_tax
        or adjuster_report
        or photos
        or documents
        or chat_transcript
    )

    if state.status == CaseStatus.AWAITING_DOCS and not has_new_uploads:
        async with CaseStore.lock(case_id):
            state = require_case(case_id)
            if state.status != CaseStatus.AWAITING_DOCS:
                raise api_error(
                    409,
                    ErrorCode.INVALID_STATUS,
                    "Documents can only be submitted for a draft or awaiting_docs case",
                )
            transition_status(state, CaseStatus.RUNNING)

        background.add_task(
            resume_workflow_with_sse,
            case_id,
            operator_name="Operator Jack",
            action="upload_docs",
        )
        return CaseCreateResponse(case_id=case_id, status=state.status)

    _validate_case_uploads(
        police_report,
        policy_pdf,
        repair_quotation,
        photos,
        adjuster_report,
        documents,
    )
    if road_tax is not None:
        _require_mime(road_tax, _DOC_MIMES)
    (
        police_path,
        policy_path,
        quote_path,
        road_tax_path,
        adjuster_path,
        photo_paths,
        uploaded_document_paths,
        transcript_path,
    ) = await _save_case_uploads(
        case_id,
        police_report,
        policy_pdf,
        repair_quotation,
        photos,
        road_tax,
        adjuster_report,
        documents,
        chat_transcript,
    )

    final_police_path = police_path
    final_policy_path = policy_path
    final_quote_path = quote_path
    final_road_tax_path = road_tax_path
    final_adjuster_path = adjuster_path
    final_photo_paths = photo_paths
    final_uploaded_document_paths = uploaded_document_paths

    async with CaseStore.lock(case_id):
        state = require_case(case_id)
        if state.status not in (CaseStatus.DRAFT, CaseStatus.AWAITING_DOCS):
            shutil.rmtree(case_upload_dir(case_id), ignore_errors=True)
            raise api_error(
                409,
                ErrorCode.INVALID_STATUS,
                "Documents can only be submitted for a draft or awaiting_docs case",
            )

        old_status = state.status
        if old_status == CaseStatus.AWAITING_DOCS:
            # Preserve existing evidence and append newly uploaded evidence.
            # The previous behavior replaced paths with the latest request, so
            # a "resume" action with no files could wipe the in-memory document
            # list even though files still existed on disk.
            state.police_report_path = police_path or state.police_report_path
            state.policy_pdf_path = policy_path or state.policy_pdf_path
            state.repair_quotation_path = quote_path or state.repair_quotation_path
            state.road_tax_path = road_tax_path or state.road_tax_path
            state.adjuster_report_path = adjuster_path or state.adjuster_report_path
            state.photo_paths = [*state.photo_paths, *photo_paths]
            state.uploaded_document_paths = [
                *state.uploaded_document_paths,
                *uploaded_document_paths,
            ]
            state.chat_transcript = transcript_path or state.chat_transcript
        else:
            state.police_report_path = police_path
            state.policy_pdf_path = policy_path
            state.repair_quotation_path = quote_path
            state.road_tax_path = road_tax_path
            state.adjuster_report_path = adjuster_path
            state.photo_paths = photo_paths
            state.uploaded_document_paths = uploaded_document_paths
            state.chat_transcript = transcript_path

        final_police_path = state.police_report_path
        final_policy_path = state.policy_pdf_path
        final_quote_path = state.repair_quotation_path
        final_road_tax_path = state.road_tax_path
        final_adjuster_path = state.adjuster_report_path
        final_photo_paths = list(state.photo_paths)
        final_uploaded_document_paths = list(state.uploaded_document_paths)

        transition_status(state, CaseStatus.RUNNING)

    # Extract content before pipeline starts. Prefer the generic ordered upload
    # list so tagging, not field names, determines each document's role.
    if final_uploaded_document_paths:
        extractions = await extract_uploaded_documents(final_uploaded_document_paths)
    else:
        extractions = await extract_case_documents(
            final_police_path,
            final_policy_path,
            final_quote_path,
            final_road_tax_path,
            final_adjuster_path,
            final_photo_paths,
        )
    async with CaseStore.lock(case_id):
        state = require_case(case_id)
        state.document_extractions = extractions

    if old_status == CaseStatus.AWAITING_DOCS:
        background.add_task(
            resume_workflow_with_sse, 
            case_id, 
            operator_name="Operator Jack", 
            action="upload_docs"
        )
    else:
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
        if s.status != CaseStatus.DRAFT
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
                    # Broadcaster disconnected this subscriber (queue full).
                    # Exit cleanly; client recovers via GET /cases/{id}.
                    if msg.get("event") == CLOSE_EVENT_KEY:
                        break
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
    "road_tax": "road_tax_path",
    "adjuster_report": "adjuster_report_path",
    "chat_transcript": "chat_transcript",
}


def _find_pdf_evidence(path: str, excerpt: str | None) -> dict[str, Any]:
    import fitz

    doc = fitz.open(path)
    try:
        page_index = 0
        matches: list[Any] = []

        if excerpt:
            for candidate in (excerpt, excerpt.replace("/", " "), excerpt.replace(" ", "")):
                for candidate_page_index in range(doc.page_count):
                    candidate_page = doc[candidate_page_index]
                    matches = candidate_page.search_for(candidate)
                    if matches:
                        page_index = candidate_page_index
                        break
                if matches:
                    break

        page = doc[page_index]
        target_rect = None
        if matches:
            target_rect = matches[0]
            for rect in matches[1:]:
                target_rect |= rect

        return {
            "page_index": page_index,
            "page_width": page.rect.width,
            "page_height": page.rect.height,
            "target": {
                "x0": target_rect.x0,
                "y0": target_rect.y0,
                "x1": target_rect.x1,
                "y1": target_rect.y1,
            } if target_rect else None,
        }
    finally:
        doc.close()


def _render_pdf_evidence_png(path: str, excerpt: str | None) -> bytes:
    """Render the original PDF page at a consistent full-page scale."""
    import fitz

    doc = fitz.open(path)
    try:
        meta = _find_pdf_evidence(path, excerpt)
        page = doc[meta["page_index"]]
        matches = []
        if excerpt:
            for candidate in (excerpt, excerpt.replace("/", " "), excerpt.replace(" ", "")):
                matches = page.search_for(candidate)
                if matches:
                    break

        for rect in matches:
            annot = page.add_highlight_annot(rect)
            annot.set_colors(stroke=(1, 0.82, 0))
            annot.update()

        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        return pix.tobytes("png")
    finally:
        doc.close()


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


@router.get("/{case_id}/documents/{doc_type}/evidence")
async def get_document_evidence(
    case_id: str,
    doc_type: str,
    excerpt: Optional[str] = Query(None),
) -> StreamingResponse:
    state = require_case(case_id)
    field = _DOC_FIELDS.get(doc_type)
    if field is None:
        raise api_error(404, ErrorCode.INVALID_DOC_TYPE, "Document type not recognized")
    path = getattr(state, field)
    if not path or not os.path.exists(path):
        raise api_error(404, ErrorCode.DOCUMENT_NOT_FOUND, "Document not uploaded")
    if os.path.splitext(path)[1].lower() != ".pdf":
        raise api_error(400, ErrorCode.INVALID_DOC_TYPE, "Evidence preview is only available for PDFs")
    png = await asyncio.to_thread(_render_pdf_evidence_png, path, excerpt)
    return StreamingResponse(io.BytesIO(png), media_type="image/png")


@router.get("/{case_id}/documents/{doc_type}/evidence/meta")
async def get_document_evidence_meta(
    case_id: str,
    doc_type: str,
    excerpt: Optional[str] = Query(None),
) -> dict[str, Any]:
    state = require_case(case_id)
    field = _DOC_FIELDS.get(doc_type)
    if field is None:
        raise api_error(404, ErrorCode.INVALID_DOC_TYPE, "Document type not recognized")
    path = getattr(state, field)
    if not path or not os.path.exists(path):
        raise api_error(404, ErrorCode.DOCUMENT_NOT_FOUND, "Document not uploaded")
    if os.path.splitext(path)[1].lower() != ".pdf":
        raise api_error(400, ErrorCode.INVALID_DOC_TYPE, "Evidence preview is only available for PDFs")
    return await asyncio.to_thread(_find_pdf_evidence, path, excerpt)


@router.get("/{case_id}/documents/{doc_type}/text")
async def get_document_text(case_id: str, doc_type: str) -> dict[str, Any]:
    state = require_case(case_id)
    field = _DOC_FIELDS.get(doc_type)
    if field is None:
        raise api_error(404, ErrorCode.INVALID_DOC_TYPE, "Document type not recognized")
    path = getattr(state, field)
    if not path or not os.path.exists(path):
        raise api_error(404, ErrorCode.DOCUMENT_NOT_FOUND, "Document not uploaded")
    extraction = state.document_extractions.get(doc_type, {})
    return {
        "filename": os.path.basename(path),
        "text": extraction.get("text") or "",
        "method": extraction.get("method", "not_extracted"),
        "error": extraction.get("error") or extraction.get("gemini_error"),
    }


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


@router.get("/{case_id}/documents/photo/{index}/text")
async def get_photo_text(case_id: str, index: int) -> dict[str, Any]:
    state = require_case(case_id)
    if index < 0 or index >= len(state.photo_paths):
        raise api_error(404, ErrorCode.INVALID_DOC_TYPE, "Photo index out of range")
    path = state.photo_paths[index]
    if not os.path.exists(path):
        raise api_error(404, ErrorCode.DOCUMENT_NOT_FOUND, "Photo missing on disk")
    extraction = state.document_extractions.get(f"photo_{index}", {})
    return {
        "filename": os.path.basename(path),
        "text": extraction.get("text") or "",
        "method": extraction.get("method", "not_extracted"),
        "error": extraction.get("error") or extraction.get("gemini_error"),
    }


@router.get("/{case_id}/documents/uploaded/{index}")
async def get_uploaded_document(case_id: str, index: int) -> FileResponse:
    state = require_case(case_id)
    if index < 0 or index >= len(state.uploaded_document_paths):
        raise api_error(
            404,
            ErrorCode.INVALID_DOC_TYPE,
            "Uploaded document index out of range",
        )
    path = state.uploaded_document_paths[index]
    if not os.path.exists(path):
        raise api_error(404, ErrorCode.DOCUMENT_NOT_FOUND, "Document missing on disk")
    media_type, _ = mimetypes.guess_type(path)
    return FileResponse(path, media_type=media_type or "application/octet-stream")


@router.get("/{case_id}/documents/uploaded/{index}/evidence")
async def get_uploaded_document_evidence(
    case_id: str,
    index: int,
    excerpt: Optional[str] = Query(None),
) -> StreamingResponse:
    state = require_case(case_id)
    if index < 0 or index >= len(state.uploaded_document_paths):
        raise api_error(
            404,
            ErrorCode.INVALID_DOC_TYPE,
            "Uploaded document index out of range",
        )
    path = state.uploaded_document_paths[index]
    if not os.path.exists(path):
        raise api_error(404, ErrorCode.DOCUMENT_NOT_FOUND, "Document missing on disk")
    if os.path.splitext(path)[1].lower() != ".pdf":
        raise api_error(400, ErrorCode.INVALID_DOC_TYPE, "Evidence preview is only available for PDFs")
    png = await asyncio.to_thread(_render_pdf_evidence_png, path, excerpt)
    return StreamingResponse(io.BytesIO(png), media_type="image/png")


@router.get("/{case_id}/documents/uploaded/{index}/evidence/meta")
async def get_uploaded_document_evidence_meta(
    case_id: str,
    index: int,
    excerpt: Optional[str] = Query(None),
) -> dict[str, Any]:
    state = require_case(case_id)
    if index < 0 or index >= len(state.uploaded_document_paths):
        raise api_error(
            404,
            ErrorCode.INVALID_DOC_TYPE,
            "Uploaded document index out of range",
        )
    path = state.uploaded_document_paths[index]
    if not os.path.exists(path):
        raise api_error(404, ErrorCode.DOCUMENT_NOT_FOUND, "Document missing on disk")
    if os.path.splitext(path)[1].lower() != ".pdf":
        raise api_error(400, ErrorCode.INVALID_DOC_TYPE, "Evidence preview is only available for PDFs")
    return await asyncio.to_thread(_find_pdf_evidence, path, excerpt)


@router.get("/{case_id}/documents/uploaded/{index}/text")
async def get_uploaded_document_text(case_id: str, index: int) -> dict[str, Any]:
    state = require_case(case_id)
    if index < 0 or index >= len(state.uploaded_document_paths):
        raise api_error(
            404,
            ErrorCode.INVALID_DOC_TYPE,
            "Uploaded document index out of range",
        )
    path = state.uploaded_document_paths[index]
    if not os.path.exists(path):
        raise api_error(404, ErrorCode.DOCUMENT_NOT_FOUND, "Document missing on disk")
    extraction = state.document_extractions.get(f"uploaded_{index}", {})
    return {
        "filename": os.path.basename(path),
        "text": extraction.get("text") or "",
        "method": extraction.get("method", "not_extracted"),
        "error": extraction.get("error") or extraction.get("gemini_error"),
    }


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
async def approve_case(case_id: str, background: BackgroundTasks) -> ApproveResponse:
    state = require_case(case_id)

    async with CaseStore.lock(case_id):
        # Re-check inside the lock: a concurrent pipeline transition or
        # officer message could have moved `state.status` between the
        # initial read and acquiring the lock.
        if state.status not in (CaseStatus.AWAITING_APPROVAL, CaseStatus.ESCALATED):
            raise api_error(
                409,
                ErrorCode.INVALID_STATUS,
                "Approve is only valid when awaiting officer",
            )

        # Escalated cases may land here before artifacts are generated, or
        # with only the PDF ready if a prior `generate_artifacts` was cut
        # short between the PDF emit and the JSON write. Regenerate when
        # either required artifact is missing.
        if state.status == CaseStatus.ESCALATED and not current_artifacts_ready(state):
            await generate_artifacts(state)

        # Transition first; if it fails, decision fields stay untouched.
        # We don't transition directly to APPROVED here anymore, we let the graph reach END.
        # However, we must ensure we are in a valid state to resume.
        pass

    background.add_task(
        resume_workflow_with_sse, 
        case_id, 
        operator_name="Operator Jack", 
        action="approve",
        reason="Manual override by Operator Jack",
        force_approve=True
    )

    return ApproveResponse(status=state.status, pdf_ready=current_artifacts_ready(state))


@router.patch("/{case_id}/blackboard/{section}")
async def update_blackboard_section(
    case_id: str, 
    section: str, 
    body: dict[str, Any]
) -> dict[str, Any]:
    state = require_case(case_id)
    try:
        sec_enum = BlackboardSection(section)
    except ValueError:
        raise api_error(400, ErrorCode.INVALID_STATUS, f"Invalid blackboard section: {section}")

    async with CaseStore.lock(case_id):
        # Update the blackboard section using the internal setter
        state.set_section_data(sec_enum, body)
        # Clear any existing artifacts so they are regenerated with new data
        for rec in state.artifacts:
            rec.superseded = True
        
    return {"status": "success", "section": section, "data": body}


# -- Officer: decline --------------------------------------------------------

@router.post("/{case_id}/decline", response_model=DeclineResponse)
async def decline_case(case_id: str, body: DeclineRequest) -> DeclineResponse:
    state = require_case(case_id)

    async with CaseStore.lock(case_id):
        # Re-check inside the lock to close the TOCTOU window that
        # `approve_case` suffered from before.
        if state.status not in (CaseStatus.AWAITING_APPROVAL, CaseStatus.ESCALATED):
            raise api_error(
                409,
                ErrorCode.INVALID_STATUS,
                "Decline is only valid when awaiting officer",
            )

        try:
            transition_status(state, CaseStatus.DECLINED)
        except InvalidStatusTransition as exc:
            raise api_error(409, ErrorCode.INVALID_STATUS, str(exc))

        state.operator_decision = "declined"
        state.operator_decision_reason = body.reason

    return DeclineResponse(status=state.status)


# -- Officer: message (challenge / clarification) ---------------------------

@router.post(
    "/{case_id}/message",
    response_model=MessageClarificationResponse | MessageRerunResponse,
    status_code=200,
)
async def officer_message(
    case_id: str,
    body: MessageRequest,
    background: BackgroundTasks,
) -> MessageClarificationResponse | MessageRerunResponse:
    state = require_case(case_id)

    async with CaseStore.lock(case_id):
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
