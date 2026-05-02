import logging
import os
import tempfile

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from srcs.services.signature_service import sign_and_stamp
from srcs.services.case_service import (
    require_case,
    generate_artifacts,
    case_artifact_dir,
    _next_artifact_version,
)
from srcs.services.case_store import ArtifactRecord, now_iso
from srcs.schemas.case_dto import ArtifactType, SseArtifactCreatedData
from srcs.services.sse_service import SseService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/signature", tags=["Signature"])


class ApproveSignRequest(BaseModel):
    signer_name: str = Field(..., min_length=1)
    designation: str = Field(..., min_length=1)
    sign_date: str = Field(None)
    stamp_path: str = Field("")


@router.get("/{claim_no}/preview")
async def preview_artifact(claim_no: str):
    """Ensure artifacts are generated for preview."""
    state = require_case(claim_no)
    if not state.decision_pdf_path or not os.path.isfile(state.decision_pdf_path):
        await generate_artifacts(state)
    
    return {
        "status": "success",
        "url": f"/api/v1/cases/{claim_no}/artifacts/decision_pdf"
    }


@router.post("/{claim_no}/preview-signed")
async def preview_signed_artifact(
    claim_no: str,
    body: ApproveSignRequest,
    background_tasks: BackgroundTasks,
):
    """Render a signed PDF on the fly and return it as binary.

    This endpoint is **read-only** with respect to case state: it does NOT
    persist the signed PDF as an artifact, does NOT supersede the unsigned
    draft, and does NOT emit SSE. It exists so the Signature Modal's "Final
    Review" step can show what the signed letter will look like before the
    operator commits to final approval. The persisted signed artifact is
    only created by `POST /{claim_no}/approve`, which itself is only
    invoked at the moment of final approval.
    """
    state = require_case(claim_no)

    if not state.decision_pdf_path or not os.path.isfile(state.decision_pdf_path):
        await generate_artifacts(state)

    pdf_path = state.decision_pdf_path
    if not pdf_path or not os.path.isfile(pdf_path):
        raise HTTPException(
            status_code=404,
            detail="No generated PDF found for this claim and auto-generation failed.",
        )

    tmp = tempfile.NamedTemporaryFile(
        prefix=f"{claim_no}_preview_signed_", suffix=".pdf", delete=False
    )
    tmp.close()

    try:
        sign_and_stamp(
            pdf_path=pdf_path,
            signer_name=body.signer_name,
            designation=body.designation,
            sign_date=body.sign_date,
            stamp_path=None if body.stamp_path == "" else body.stamp_path,
            output_path=tmp.name,
        )
    except Exception:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass
        logger.exception("PDF signed-preview failed for %s", claim_no)
        raise HTTPException(status_code=500, detail="PDF signed-preview failed")

    def _cleanup(path: str) -> None:
        try:
            os.unlink(path)
        except OSError:
            pass

    background_tasks.add_task(_cleanup, tmp.name)

    return FileResponse(
        tmp.name,
        media_type="application/pdf",
        filename=f"{claim_no}_signed_preview.pdf",
        headers={"Cache-Control": "no-store"},
    )


@router.post("/{claim_no}/approve")
async def approve_and_sign(claim_no: str, body: ApproveSignRequest):
    """Persist a signed copy of the decision PDF as a separate artifact.

    Behavior contract:
      * The unsigned `decision_pdf` artifact is **never** modified or
        superseded by this endpoint.
      * A new `decision_pdf_signed` artifact is appended (or version-bumped
        if re-signing) at a fresh file path. After approval, the case has
        both the unsigned draft and the signed copy on disk and in
        `state.artifacts`.
      * SSE is emitted for the new signed artifact so the frontend can
        pick it up reactively.
    """
    state = require_case(claim_no)

    if not state.decision_pdf_path or not os.path.isfile(state.decision_pdf_path):
        await generate_artifacts(state)

    unsigned_path = state.decision_pdf_path
    if not unsigned_path or not os.path.isfile(unsigned_path):
        raise HTTPException(
            status_code=404,
            detail="No generated PDF found for this claim and auto-generation failed.",
        )

    version = _next_artifact_version(state, ArtifactType.DECISION_PDF_SIGNED)
    filename = f"decision_signed_v{version}.pdf"
    signed_path = os.path.join(case_artifact_dir(claim_no), filename)

    try:
        sign_and_stamp(
            pdf_path=unsigned_path,
            signer_name=body.signer_name,
            designation=body.designation,
            sign_date=body.sign_date,
            stamp_path=None if body.stamp_path == "" else body.stamp_path,
            output_path=signed_path,
        )
    except Exception:
        logger.exception("PDF signing failed for %s", claim_no)
        raise HTTPException(status_code=500, detail="PDF signing failed")

    for a in state.artifacts:
        if a.artifact_type == ArtifactType.DECISION_PDF_SIGNED and not a.superseded:
            a.superseded = True

    state.artifacts.append(
        ArtifactRecord(
            artifact_type=ArtifactType.DECISION_PDF_SIGNED,
            filename=filename,
            version=version,
            path=signed_path,
        )
    )

    await SseService.emit(
        claim_no,
        SseArtifactCreatedData(
            case_id=claim_no,
            timestamp=now_iso(),
            artifact_type=ArtifactType.DECISION_PDF_SIGNED,
            filename=filename,
            url=f"/api/v1/cases/{claim_no}/artifacts/decision_pdf_signed",
            version=version,
        ),
    )

    return {
        "status": "success",
        "claim_no": claim_no,
        "artifact_type": ArtifactType.DECISION_PDF_SIGNED.value,
        "url": f"/api/v1/cases/{claim_no}/artifacts/decision_pdf_signed",
        "version": version,
    }
