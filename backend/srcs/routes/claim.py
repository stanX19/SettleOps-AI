from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from srcs.services.pdf_service import generate_claim_report, ClaimReportData
import os

router = APIRouter(prefix="/claims", tags=["Claims"])


@router.post("/generate-report")
def generate_report(data: ClaimReportData):
    try:
        file_path = generate_claim_report(data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")
    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=f"{data.claim_ref_no}_report.pdf",
        headers={"Content-Disposition": "attachment"},
    )


@router.get("/{claim_ref}/report")
def get_report(claim_ref: str):
    file_path = os.path.join("reports", f"{claim_ref}.pdf")
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="Report not found. Generate it first.")
    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=f"{claim_ref}_report.pdf",
    )


# --- Malaysian test data (for manual / unit testing) ---
# {
#     "claim_ref_no": "CLM-2025-001234",
#     "generated_date": "2025-03-15",
#     "claimant_name": "Muhammad Hafiz bin Abdullah",
#     "claimant_ic": "900615-14-5890",
#     "claimant_phone": "011-2345 6789",
#     "claimant_address": "No. 12, Jalan Mawar 3, Taman Bunga, 47500 Subang Jaya, Selangor",
#     "policy_number": "POL-MY-2024-887766",
#     "accident_date": "2025-03-14",
#     "accident_time": "08:45",
#     "accident_location": "Lebuhraya KESAS, KM 12.5, arah Klang, Shah Alam, Selangor",
#     "police_report_no": "PDRM/SAL/2025/03/4421",
#     "accident_description": "Kenderaan tertuduh memotong lorong secara mengejut menyebabkan perlanggaran sisi kanan. Kenderaan insured bergerak lurus di lorong tengah.",
#     "vehicle_plate": "WXY 4521",
#     "vehicle_make_model": "Perodua Myvi 1.5 AV",
#     "vehicle_year": 2022,
#     "damage_description": "Kerosakan bahagian depan kanan, bumper depan, bonnet, lampu hadapan kanan, fender kanan",
#     "estimated_repair_cost": 8750.00,
#     "tp_name": "Lim Chee Keong",
#     "tp_ic": "851123-10-7654",
#     "tp_vehicle_plate": "PJL 3388",
#     "tp_insurer": "Allianz General Insurance Malaysia",
#     "tp_policy_no": null,
#     "adjuster_name": "Ahmad Fauzi bin Osman",
#     "adjuster_license": "PIAM/ADJ/2019/00334",
#     "inspection_date": "2025-03-17",
#     "approved_amount": 7900.00,
#     "adjuster_remarks": "Kerosakan konsisten dengan fakta kemalangan. Kadar baik pulih diluluskan berdasarkan jadual CART.",
#     "claim_status": "PENDING",
#     "officer_name": null,
#     "officer_remarks": null
# }
