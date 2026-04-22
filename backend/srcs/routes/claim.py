from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from srcs.services.pdf_service import generate_repair_approval_pdf, RepairApprovalData
import os

router = APIRouter(prefix="/claims", tags=["Claims"])


MOCK_CLAIM_DATA = {
    "claim_no": "CLM-2026-000123",
    "policy_no": "POL-12345678",
    "insured_name": "Ivin Lee",
    "nric": "010101-10-1234",
    "vehicle_no": "ABC1234",
    "vehicle_model": "Perodua Myvi 1.5",
    "accident_date": "01/04/2026",
    "report_date": "02/04/2026",
    "workshop_name": "XYZ Auto Service Sdn Bhd",
    "workshop_code": "PWS-00123",
    "workshop_address": "No. 12, Jalan Industri 3, Taman Perindustrian, 47500 Subang Jaya, Selangor",
    "workshop_phone": "012-3456789",
    "costs": {
        "parts": 3000.00,
        "labour": 1200.00,
        "paint": 800.00,
        "towing": 200.00,
        "misc": 150.00,
    },
    "approved_by": "John Tan Wei Ming",
    "designation": "Senior Claims Executive",
    "date": "05/04/2026",
}


@router.post("/generate-repair-approval")
def generate_repair_approval(data: RepairApprovalData):
    try:
        file_path = generate_repair_approval_pdf(data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")
    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=f"repair_approval_{data.claim_no}.pdf",
        headers={"Content-Disposition": "attachment"},
    )


@router.get("/generate-mock-report")
def generate_mock_report():
    data = RepairApprovalData(**MOCK_CLAIM_DATA)
    try:
        file_path = generate_repair_approval_pdf(data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")
    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=f"repair_approval_{data.claim_no}.pdf",
    )


@router.get("/{claim_no}/repair-approval")
def get_repair_approval(claim_no: str):
    """Retrieve a previously generated repair approval PDF."""
    file_path = os.path.join("reports", f"{claim_no}_repair_approval.pdf")
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="Report not found. Generate it first.")
    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=f"repair_approval_{claim_no}.pdf",
    )
