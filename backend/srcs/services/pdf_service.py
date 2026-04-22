from reportlab.pdfgen import canvas
from reportlab.platypus import (SimpleDocTemplate, Table, TableStyle,
    Paragraph, Spacer, PageBreak, HRFlowable)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from PIL import Image as PILImage
import io, os
from datetime import date
from typing import Literal, Optional
from pydantic import BaseModel


class ClaimReportData(BaseModel):
    claim_ref_no: str
    generated_date: date
    claimant_name: str
    claimant_ic: str
    claimant_phone: str
    claimant_address: str
    policy_number: str
    accident_date: date
    accident_time: str
    accident_location: str
    police_report_no: str
    accident_description: str
    vehicle_plate: str
    vehicle_make_model: str
    vehicle_year: int
    damage_description: str
    estimated_repair_cost: float
    tp_name: Optional[str] = None
    tp_ic: Optional[str] = None
    tp_vehicle_plate: Optional[str] = None
    tp_insurer: Optional[str] = None
    tp_policy_no: Optional[str] = None
    adjuster_name: str
    adjuster_license: str
    inspection_date: date
    approved_amount: float
    adjuster_remarks: str
    claim_status: Literal["PENDING", "APPROVED", "REJECTED"] = "PENDING"
    officer_name: Optional[str] = None
    officer_remarks: Optional[str] = None


NAVY = colors.HexColor("#1a3557")
STEEL = colors.HexColor("#2c5f8a")
LABEL_GRAY = colors.HexColor("#666666")
VALUE_BLACK = colors.HexColor("#000000")
BORDER_GRAY = colors.HexColor("#cccccc")
ROW_ALT = colors.HexColor("#f7f7f7")
APPROVED_GREEN = colors.HexColor("#1a7a3c")
STAMP_APPROVED = colors.Color(0x1a / 255, 0x7a / 255, 0x3c / 255, alpha=0.12)
STAMP_REJECTED = colors.Color(0xa0 / 255, 0, 0, alpha=0.12)
STAMP_PENDING = colors.Color(0xb3 / 255, 0x62 / 255, 0, alpha=0.12)

PAGE_W, PAGE_H = A4
MARGIN = 20 * mm
HEADER_H = 18 * mm


def _get_styles():
    ss = getSampleStyleSheet()

    ss.add(ParagraphStyle(
        "SectionBar", parent=ss["Normal"],
        fontName="Helvetica-Bold", fontSize=10, textColor=colors.white,
        backColor=STEEL, spaceBefore=10, spaceAfter=4,
        leftIndent=4, leading=16,
    ))
    ss.add(ParagraphStyle(
        "FieldLabel", parent=ss["Normal"],
        fontName="Helvetica", fontSize=8, textColor=LABEL_GRAY,
    ))
    ss.add(ParagraphStyle(
        "FieldValue", parent=ss["Normal"],
        fontName="Helvetica", fontSize=10, textColor=VALUE_BLACK,
    ))
    ss.add(ParagraphStyle(
        "FieldValueBold", parent=ss["Normal"],
        fontName="Helvetica-Bold", fontSize=10, textColor=VALUE_BLACK,
    ))
    ss.add(ParagraphStyle(
        "FieldValueRight", parent=ss["Normal"],
        fontName="Helvetica-Bold", fontSize=10, textColor=VALUE_BLACK,
        alignment=TA_RIGHT,
    ))
    ss.add(ParagraphStyle(
        "AmountGreen", parent=ss["Normal"],
        fontName="Helvetica-Bold", fontSize=10, textColor=APPROVED_GREEN,
        alignment=TA_RIGHT,
    ))
    ss.add(ParagraphStyle(
        "CenterItalic", parent=ss["Normal"],
        fontName="Helvetica-Oblique", fontSize=10, textColor=LABEL_GRAY,
        alignment=TA_CENTER,
    ))
    ss.add(ParagraphStyle(
        "TitleStyle", parent=ss["Normal"],
        fontName="Helvetica-Bold", fontSize=16, textColor=VALUE_BLACK,
        alignment=TA_CENTER, spaceAfter=4,
    ))
    ss.add(ParagraphStyle(
        "SubtitleStyle", parent=ss["Normal"],
        fontName="Helvetica", fontSize=10, textColor=LABEL_GRAY,
        alignment=TA_CENTER, spaceAfter=12,
    ))
    ss.add(ParagraphStyle(
        "BoxParagraph", parent=ss["Normal"],
        fontName="Helvetica", fontSize=10, textColor=VALUE_BLACK,
        leading=14,
    ))
    return ss


def _field_cell(label, value, styles):
    return [
        Paragraph(label, styles["FieldLabel"]),
        Paragraph(str(value), styles["FieldValue"]),
    ]


def _two_col_table(rows, col_widths=None):
    avail = PAGE_W - 2 * MARGIN
    if col_widths is None:
        col_widths = [avail / 2, avail / 2]
    style_cmds = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    for i in range(len(rows)):
        if i % 2 == 1:
            style_cmds.append(("BACKGROUND", (0, i), (-1, i), ROW_ALT))
    t = Table(rows, colWidths=col_widths, hAlign="LEFT")
    t.setStyle(TableStyle(style_cmds))
    return t


def _bordered_box(text, styles, min_height=None):
    avail = PAGE_W - 2 * MARGIN - 12
    p = Paragraph(text, styles["BoxParagraph"])
    row_data = [[p]]
    t = Table(row_data, colWidths=[avail])
    style_cmds = [
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER_GRAY),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]
    if min_height:
        style_cmds.append(("MINROWHEIGHT", (0, 0), (-1, -1), min_height))
    t.setStyle(TableStyle(style_cmds))
    return t


def _draw_header_footer(c, doc, data: ClaimReportData):
    c.saveState()

    # Header bar
    c.setFillColor(NAVY)
    c.rect(MARGIN, PAGE_H - MARGIN - HEADER_H, PAGE_W - 2 * MARGIN, HEADER_H, fill=1, stroke=0)

    # Header left text
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(MARGIN + 6, PAGE_H - MARGIN - HEADER_H + 7 * mm, "MyClaim Insurance Berhad")

    # Header right text
    c.setFont("Helvetica", 9)
    c.drawRightString(PAGE_W - MARGIN - 6, PAGE_H - MARGIN - HEADER_H + 10 * mm,
                      f"Claim Ref: {data.claim_ref_no}")
    c.drawRightString(PAGE_W - MARGIN - 6, PAGE_H - MARGIN - HEADER_H + 5.5 * mm,
                      f"Generated: {data.generated_date.strftime('%d/%m/%Y')}")

    # Line below header
    c.setStrokeColor(STEEL)
    c.setLineWidth(1)
    c.line(MARGIN, PAGE_H - MARGIN - HEADER_H - 1, PAGE_W - MARGIN, PAGE_H - MARGIN - HEADER_H - 1)

    # Footer
    c.setFont("Helvetica", 8)
    c.setFillColor(LABEL_GRAY)
    c.drawCentredString(PAGE_W / 2, MARGIN - 12 * mm,
                        "CONFIDENTIAL — FOR OFFICER USE ONLY")

    page_num = doc.page
    c.drawRightString(PAGE_W - MARGIN, MARGIN - 12 * mm,
                      f"Page {page_num}")

    c.restoreState()

    _draw_stamp(c, data.claim_status)


def _draw_stamp(c, status):
    c.saveState()
    c.translate(PAGE_W / 2, PAGE_H / 2)
    c.rotate(35)

    if status == "APPROVED":
        c.setFillColor(STAMP_APPROVED)
    elif status == "REJECTED":
        c.setFillColor(STAMP_REJECTED)
    else:
        c.setFillColor(STAMP_PENDING)

    c.setFont("Helvetica-Bold", 64)
    c.drawCentredString(0, 0, status)
    c.restoreState()


def _on_page(c, doc, data):
    _draw_header_footer(c, doc, data)


def _add_page_count(file_path):
    from reportlab.pdfgen import canvas as canvas_mod
    from PyPDF2 import PdfReader, PdfWriter

    reader = PdfReader(file_path)
    total = len(reader.pages)
    writer = PdfWriter()

    for i, page in enumerate(reader.pages):
        packet = io.BytesIO()
        overlay = canvas_mod.Canvas(packet, pagesize=A4)
        overlay.setFont("Helvetica", 8)
        overlay.setFillColor(LABEL_GRAY)
        overlay.drawRightString(PAGE_W - MARGIN, MARGIN - 12 * mm,
                                f"Page {i + 1} of {total}")
        overlay.save()
        packet.seek(0)

        overlay_reader = PdfReader(packet)
        page.merge_page(overlay_reader.pages[0])
        writer.add_page(page)

    with open(file_path, "wb") as f:
        writer.write(f)


def generate_claim_report(data: ClaimReportData) -> str:
    os.makedirs("reports", exist_ok=True)
    file_path = os.path.join("reports", f"{data.claim_ref_no}.pdf")

    styles = _get_styles()
    avail_width = PAGE_W - 2 * MARGIN

    doc = SimpleDocTemplate(
        file_path, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN + HEADER_H + 4 * mm,
        bottomMargin=MARGIN + 4 * mm,
    )

    elements = []

    # SECTION 1 — Report title block
    elements.append(Spacer(1, 6 * mm))
    elements.append(Paragraph("MOTOR ACCIDENT CLAIM REPORT", styles["TitleStyle"]))
    elements.append(Paragraph(f"Policy No: {data.policy_number}", styles["SubtitleStyle"]))

    # SECTION 2 — Claimant information
    elements.append(Paragraph("Claimant Information", styles["SectionBar"]))
    elements.append(Spacer(1, 2 * mm))
    sec2_rows = [
        _field_cell("Name", data.claimant_name, styles) +
        _field_cell("IC Number", data.claimant_ic, styles),
        _field_cell("Phone", data.claimant_phone, styles) +
        _field_cell("Policy No", data.policy_number, styles),
        _field_cell("Address", data.claimant_address, styles) + ["", ""],
    ]
    elements.append(_two_col_table(sec2_rows))

    # SECTION 3 — Accident details
    elements.append(Paragraph("Accident Details", styles["SectionBar"]))
    elements.append(Spacer(1, 2 * mm))
    sec3_rows = [
        _field_cell("Date & Time",
                    f"{data.accident_date.strftime('%d/%m/%Y')}  {data.accident_time}",
                    styles) +
        _field_cell("Location", data.accident_location, styles),
    ]
    elements.append(_two_col_table(sec3_rows))
    elements.append(Spacer(1, 2 * mm))
    elements.append(_bordered_box(data.accident_description, styles))
    elements.append(Spacer(1, 2 * mm))
    sec3_pr = [
        _field_cell("Police Report No", data.police_report_no, styles) + ["", ""],
    ]
    elements.append(_two_col_table(sec3_pr))

    # SECTION 4 — Vehicle information
    elements.append(Paragraph("Vehicle Information", styles["SectionBar"]))
    elements.append(Spacer(1, 2 * mm))
    sec4_rows = [
        _field_cell("Plate No", data.vehicle_plate, styles) +
        _field_cell("Make & Model", data.vehicle_make_model, styles),
        _field_cell("Year", str(data.vehicle_year), styles) +
        _field_cell("Damage Description", data.damage_description, styles),
    ]
    elements.append(_two_col_table(sec4_rows))
    elements.append(Spacer(1, 2 * mm))
    elements.append(Paragraph(
        f"Estimated Repair Cost: RM {data.estimated_repair_cost:,.2f}",
        styles["FieldValueRight"],
    ))

    # SECTION 5 — Third party information
    elements.append(Paragraph("Third Party Information", styles["SectionBar"]))
    elements.append(Spacer(1, 2 * mm))
    tp_fields = [data.tp_name, data.tp_ic, data.tp_vehicle_plate, data.tp_insurer, data.tp_policy_no]
    if all(v is None for v in tp_fields):
        elements.append(Paragraph("No third party involved", styles["CenterItalic"]))
    else:
        sec5_rows = [
            _field_cell("Name", data.tp_name or "—", styles) +
            _field_cell("IC Number", data.tp_ic or "—", styles),
            _field_cell("Vehicle Plate", data.tp_vehicle_plate or "—", styles) +
            _field_cell("Insurer", data.tp_insurer or "—", styles),
            _field_cell("Policy No", data.tp_policy_no or "—", styles) + ["", ""],
        ]
        elements.append(_two_col_table(sec5_rows))

    # SECTION 6 — Loss adjuster assessment
    elements.append(Paragraph("Loss Adjuster Assessment", styles["SectionBar"]))
    elements.append(Spacer(1, 2 * mm))
    sec6_rows = [
        _field_cell("Adjuster Name", data.adjuster_name, styles) +
        _field_cell("Licence No", data.adjuster_license, styles),
        _field_cell("Inspection Date", data.inspection_date.strftime("%d/%m/%Y"), styles) +
        ["", ""],
    ]
    elements.append(_two_col_table(sec6_rows))
    elements.append(Spacer(1, 2 * mm))
    elements.append(Paragraph(
        f"Approved Amount: RM {data.approved_amount:,.2f}",
        styles["AmountGreen"],
    ))
    elements.append(Spacer(1, 2 * mm))
    elements.append(_bordered_box(data.adjuster_remarks, styles))

    # SECTION 7 — Officer decision
    elements.append(Paragraph("Officer Decision", styles["SectionBar"]))
    elements.append(Spacer(1, 4 * mm))

    def _checkbox(label, checked):
        mark = "■" if checked else "□"
        return Paragraph(f"{mark}  {label}", styles["FieldValueBold"])

    cb_row = [[
        _checkbox("APPROVED", data.claim_status == "APPROVED"),
        _checkbox("REJECTED", data.claim_status == "REJECTED"),
        _checkbox("PENDING", data.claim_status == "PENDING"),
    ]]
    cb_table = Table(cb_row, colWidths=[avail_width / 3] * 3)
    cb_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(cb_table)
    elements.append(Spacer(1, 3 * mm))

    elements.append(Paragraph("Officer Remarks:", styles["FieldLabel"]))
    elements.append(Spacer(1, 1 * mm))
    elements.append(_bordered_box(data.officer_remarks or "", styles, min_height=30 * mm))
    elements.append(Spacer(1, 4 * mm))

    officer_line_data = [
        [Paragraph("Officer Name:", styles["FieldLabel"]),
         Paragraph(f"  {data.officer_name or ''}", styles["FieldValue"]),
         Paragraph("__________________________", styles["FieldValue"])],
    ]
    officer_table = Table(officer_line_data, colWidths=[avail_width * 0.2, avail_width * 0.35, avail_width * 0.45])
    officer_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    elements.append(officer_table)
    elements.append(Spacer(1, 6 * mm))

    sig_data = [
        [Paragraph("Authorised Signature: ___________________________", styles["FieldValue"]),
         Paragraph("Date: _______________", styles["FieldValue"])],
    ]
    sig_table = Table(sig_data, colWidths=[avail_width * 0.6, avail_width * 0.4])
    sig_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    elements.append(sig_table)

    on_page = lambda c, doc: _on_page(c, doc, data)
    doc.build(elements, onFirstPage=on_page, onLaterPages=on_page)

    _add_page_count(file_path)

    return file_path
