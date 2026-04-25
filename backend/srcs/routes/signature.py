import logging
import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from srcs.services.signature_service import sign_and_stamp
from srcs.services.case_service import require_case, generate_artifacts

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/signature", tags=["Signature"])


class ApproveSignRequest(BaseModel):
    signer_name: str = Field(..., min_length=1)
    designation: str = Field(..., min_length=1)
    sign_date: str = Field(None)


@router.post("/{claim_no}/approve")
async def approve_and_sign(claim_no: str, body: ApproveSignRequest):
    """Sign the existing generated PDF in-place and return it.
    
    If the PDF has not been generated yet, it will be auto-generated first.
    """
    state = require_case(claim_no)

    # Auto-generate if missing
    if not state.decision_pdf_path or not os.path.isfile(state.decision_pdf_path):
        await generate_artifacts(state)
        
    pdf_path = state.decision_pdf_path
    if not pdf_path or not os.path.isfile(pdf_path):
        raise HTTPException(
            status_code=404,
            detail="No generated PDF found for this claim and auto-generation failed.",
        )

    try:
        sign_and_stamp(
            pdf_path=pdf_path,
            signer_name=body.signer_name,
            designation=body.designation,
            sign_date=body.sign_date,
            stamp_path="",
            output_path=pdf_path,
        )
    except Exception:
        logger.exception("PDF signing failed for %s", claim_no)
        raise HTTPException(status_code=500, detail="PDF signing failed")

    return {
        "status": "success",
        "claim_no": claim_no,
        "artifact_type": "decision_pdf",
        "url": f"/api/v1/cases/{claim_no}/artifacts/decision_pdf"
    }
