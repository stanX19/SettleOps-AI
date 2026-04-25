import logging
import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from srcs.services.pdf_service import (
    generate_repair_approval_pdf,
    RepairApprovalData,
    get_report_path,
)
from srcs.services.signature_service import sign_and_stamp

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/claims", tags=["Claims"])
mock_router = APIRouter(prefix="/api/v1/claims", tags=["Claims (Mock)"])


MOCK_CLAIM_DATA = {
    "claim_no": "CLM-2026-000456",
    "policy_no": "POL-87654321",
    "insured_name": "Ahmad bin Ibrahim",
    "nric": "850315-14-5678",
    "vehicle_no": "WKL8899",
    "vehicle_model": "Honda City 1.5 V",
    "accident_date": "10/04/2026",
    "report_date": "11/04/2026",
    "workshop_name": "Weng Heng Motor Sdn Bhd",
    "workshop_code": "PWS-00789",
    "workshop_address": "No. 88, Jalan PJS 11/20, Bandar Sunway, 46150 Petaling Jaya, Selangor",
    "workshop_phone": "03-5621 8888",
    "costs": {
        "parts": 4500.00,
        "labour": 1800.00,
        "paint": 1200.00,
        "towing": 350.00,
        "misc": 200.00,
    },
    "approved_by": "Siti Nurhaliza binti Mohd",
    "designation": "Claims Manager",
    "date": "15/04/2026",
}


@router.post("/generate-repair-approval")
def generate_repair_approval(data: RepairApprovalData):
    try:
        file_path = generate_repair_approval_pdf(data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("PDF generation failed")
        raise HTTPException(status_code=500, detail="PDF generation failed")
    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=f"repair_approval_{data.claim_no}.pdf",
        headers={"Content-Disposition": "attachment"},
    )


@router.get("/{claim_no}/repair-approval")
def get_repair_approval(claim_no: str):
    """Retrieve a previously generated repair approval PDF."""
    try:
        file_path = get_report_path(claim_no)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid claim number format")
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="Report not found. Generate it first.")
    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=f"repair_approval_{claim_no}.pdf",
    )


# ── Mock / debug-only routes ────────────────────────────────


@mock_router.get("/generate-mock-report")
def generate_mock_report():
    data = RepairApprovalData(**MOCK_CLAIM_DATA)
    try:
        file_path = generate_repair_approval_pdf(data)
    except Exception:
        logger.exception("Mock PDF generation failed")
        raise HTTPException(status_code=500, detail="PDF generation failed")
    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=f"repair_approval_{data.claim_no}.pdf",
    )


@mock_router.get("/generate-mock-signed-report")
def generate_mock_signed_report():
    data = RepairApprovalData(**MOCK_CLAIM_DATA)
    try:
        unsigned_path = generate_repair_approval_pdf(data)
        signed_path = sign_and_stamp(
            pdf_path=unsigned_path,
            signer_name=data.approved_by,
            designation=data.designation,
            sign_date=data.date,
        )
    except Exception:
        logger.exception("Mock signed PDF generation failed")
        raise HTTPException(status_code=500, detail="PDF generation failed")
    return FileResponse(
        path=signed_path,
        media_type="application/pdf",
        filename=f"repair_approval_{data.claim_no}_signed.pdf",
    )
