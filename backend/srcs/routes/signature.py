import logging
import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from srcs.services.pdf_service import get_report_path
from srcs.services.signature_service import sign_and_stamp

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/signature", tags=["Signature"])


class ApproveSignRequest(BaseModel):
    signer_name: str = Field(..., min_length=1)
    designation: str = Field(..., min_length=1)
    sign_date: str = Field(None)


@router.post("/{claim_no}/approve")
def approve_and_sign(claim_no: str, body: ApproveSignRequest):
    """Sign the existing generated PDF in-place and return it."""
    try:
        pdf_path = get_report_path(claim_no)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid claim number format")

    if not os.path.isfile(pdf_path):
        raise HTTPException(
            status_code=404,
            detail="No generated PDF found for this claim. Generate it first.",
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

    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename=f"repair_approval_{claim_no}.pdf",
    )
