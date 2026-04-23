from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image,
)
from reportlab.platypus.flowables import HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
import os
import re
import logging
from pathlib import Path
from typing import List
from pydantic import BaseModel, Field
from srcs.config import get_settings

logger = logging.getLogger(__name__)

CLAIM_NO_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")


def get_report_path(claim_no: str, suffix: str = "_repair_approval.pdf") -> str:
    if not CLAIM_NO_PATTERN.match(claim_no):
        raise ValueError("Invalid claim number format")
    settings = get_settings()
    reports_dir = Path(settings.REPORTS_DIR).resolve()
    reports_dir.mkdir(parents=True, exist_ok=True)
    file_path = (reports_dir / f"{claim_no}{suffix}").resolve()
    if not file_path.is_relative_to(reports_dir):
        raise ValueError("Path traversal detected")
    return str(file_path)


# ── Pydantic Models (variables for API) ─────────────────────

class CostBreakdown(BaseModel):
    parts: float = Field(..., ge=0)
    labour: float = Field(..., ge=0)
    paint: float = Field(..., ge=0)
    towing: float = Field(..., ge=0)
    misc: float = Field(..., ge=0)


class RepairApprovalData(BaseModel):
    claim_no: str = Field(..., min_length=1)
    policy_no: str = Field(..., min_length=1)
    insured_name: str = Field(..., min_length=1)
    nric: str = Field(..., min_length=1)
    vehicle_no: str = Field(..., min_length=1)
    vehicle_model: str = Field(..., min_length=1)
    accident_date: str = Field(..., min_length=1)
    report_date: str = Field(..., min_length=1)
    workshop_name: str = Field(..., min_length=1)
    workshop_code: str = Field(..., min_length=1)
    workshop_address: str = Field(..., min_length=1)
    workshop_phone: str = Field(..., min_length=1)
    costs: CostBreakdown
    approved_by: str = Field(..., min_length=1)
    designation: str = Field(..., min_length=1)
    date: str = Field(..., min_length=1)


# ── Page Constants ───────────────────────────────────────────
PAGE_W, PAGE_H = A4
MARGIN = 2.5 * cm
AVAIL_W = PAGE_W - 2 * MARGIN
HEADER_H = 22 * mm

BLACK = colors.black
GREY_FILL = colors.HexColor("#CCCCCC")


# ── Styles ───────────────────────────────────────────────────
def _get_styles():
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle(
        "DocTitle", parent=ss["Normal"],
        fontName="Helvetica-Bold", fontSize=12, textColor=BLACK,
        alignment=TA_CENTER, leading=15,
    ))
    ss.add(ParagraphStyle(
        "SectionTitle", parent=ss["Normal"],
        fontName="Helvetica-Bold", fontSize=10, textColor=BLACK,
        leading=13, spaceBefore=2, spaceAfter=4,
    ))
    ss.add(ParagraphStyle(
        "Body", parent=ss["Normal"],
        fontName="Helvetica", fontSize=9, textColor=BLACK, leading=12,
    ))
    ss.add(ParagraphStyle(
        "BodyBold", parent=ss["Normal"],
        fontName="Helvetica-Bold", fontSize=9, textColor=BLACK, leading=12,
    ))
    ss.add(ParagraphStyle(
        "BodyRight", parent=ss["Normal"],
        fontName="Helvetica", fontSize=9, textColor=BLACK,
        leading=12, alignment=TA_RIGHT,
    ))
    ss.add(ParagraphStyle(
        "BodyBoldRight", parent=ss["Normal"],
        fontName="Helvetica-Bold", fontSize=9, textColor=BLACK,
        leading=12, alignment=TA_RIGHT,
    ))
    ss.add(ParagraphStyle(
        "TblHeader", parent=ss["Normal"],
        fontName="Helvetica-Bold", fontSize=9, textColor=BLACK, leading=12,
    ))
    ss.add(ParagraphStyle(
        "TblHeaderRight", parent=ss["Normal"],
        fontName="Helvetica-Bold", fontSize=9, textColor=BLACK,
        leading=12, alignment=TA_RIGHT,
    ))
    ss.add(ParagraphStyle(
        "ItalicNote", parent=ss["Normal"],
        fontName="Helvetica-Oblique", fontSize=8, textColor=BLACK, leading=10,
    ))
    ss.add(ParagraphStyle(
        "SmallText", parent=ss["Normal"],
        fontName="Helvetica", fontSize=6.5, textColor=BLACK,
        leading=8, alignment=TA_CENTER,
    ))
    return ss


# ── Canvas: header, footer, page border ─────────────────────
def _draw_page(canvas, doc, data):
    canvas.saveState()

    # Page border frame
    canvas.setStrokeColor(BLACK)
    canvas.setLineWidth(0.5)
    border_margin = MARGIN - 5 * mm
    canvas.rect(
        border_margin, border_margin,
        PAGE_W - 2 * border_margin, PAGE_H - 2 * border_margin,
    )

    # Company header
    y_top = PAGE_H - MARGIN
    canvas.setFont("Helvetica-Bold", 14)
    canvas.drawString(MARGIN, y_top - 4 * mm, "MyClaim Insurance Berhad")

    canvas.setFont("Helvetica", 8)
    canvas.drawString(
        MARGIN, y_top - 10 * mm,
        "Level 18, Menara IGB, Mid Valley City, Lingkaran Syed Putra, "
        "59200 Kuala Lumpur",
    )
    canvas.drawString(
        MARGIN, y_top - 14 * mm,
        "Tel: 03-2772 5000 | Fax: 03-2772 5001 | Email: myclaim@settleops.com.my",
    )

    # Horizontal divider line below header
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, y_top - 18 * mm, PAGE_W - MARGIN, y_top - 18 * mm)

    canvas.restoreState()


# ── Build document content (platypus) ────────────────────────
def _build_content(elements, data: RepairApprovalData, styles):
    label_w = AVAIL_W * 0.35
    value_w = AVAIL_W * 0.65

    TABLE_STYLE = TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, BLACK),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, BLACK),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ])

    # ── 2. Document Reference ──
    elements.append(Spacer(1, 4 * mm))
    elements.append(Paragraph(f"Our Ref: {data.claim_no}", styles["Body"]))
    elements.append(Paragraph(f"Date: {data.date}", styles["Body"]))
    elements.append(Spacer(1, 6 * mm))

    # ── 3. Addressee ──
    elements.append(Paragraph("The Workshop Manager / Pengurus Bengkel", styles["Body"]))
    elements.append(Paragraph(data.workshop_name, styles["BodyBold"]))
    elements.append(Paragraph(data.workshop_address, styles["Body"]))
    elements.append(Paragraph(f"Tel: {data.workshop_phone}", styles["Body"]))
    elements.append(Spacer(1, 8 * mm))

    # ── 4. Document Title ──
    elements.append(Paragraph(
        "MOTOR VEHICLE REPAIR APPROVAL LETTER", styles["DocTitle"],
    ))
    elements.append(Spacer(1, 1 * mm))
    elements.append(HRFlowable(width="100%", thickness=0.5, color=BLACK))
    elements.append(Spacer(1, 6 * mm))

    # ── 5. Claim Information Table ──
    elements.append(Paragraph(
        "Claim Information / Maklumat Tuntutan", styles["SectionTitle"],
    ))
    claim_rows = [
        ("Claim No / No. Tuntutan", data.claim_no),
        ("Policy No / No. Polisi", data.policy_no),
        ("Insured Name / Nama Pihak Diinsurans", data.insured_name),
        ("NRIC / No. KP", data.nric),
        ("Vehicle No / No. Kenderaan", data.vehicle_no),
        ("Vehicle Model / Model Kenderaan", data.vehicle_model),
        ("Date of Accident / Tarikh Kemalangan", data.accident_date),
        ("Date Reported / Tarikh Dilaporkan", data.report_date),
    ]
    claim_table = Table(
        [[Paragraph(l, styles["BodyBold"]), Paragraph(v, styles["Body"])]
         for l, v in claim_rows],
        colWidths=[label_w, value_w], hAlign="LEFT",
    )
    claim_table.setStyle(TABLE_STYLE)
    elements.append(claim_table)
    elements.append(Spacer(1, 6 * mm))

    # ── 6. Workshop Information Table ──
    elements.append(Paragraph(
        "Workshop Information / Maklumat Bengkel", styles["SectionTitle"],
    ))
    ws_rows = [
        ("Workshop Name / Nama Bengkel", data.workshop_name),
        ("Panel Workshop Code / Kod Bengkel Panel", data.workshop_code),
        ("Address / Alamat", data.workshop_address),
        ("Contact No / No. Telefon", data.workshop_phone),
    ]
    ws_table = Table(
        [[Paragraph(l, styles["BodyBold"]), Paragraph(v, styles["Body"])]
         for l, v in ws_rows],
        colWidths=[label_w, value_w], hAlign="LEFT",
    )
    ws_table.setStyle(TABLE_STYLE)
    elements.append(ws_table)
    elements.append(Spacer(1, 6 * mm))

    # ── 7. Opening Paragraph ──
    elements.append(Paragraph(
        "We refer to the above matter and the repair quotation submitted by your "
        "workshop, together with the Loss Adjuster’s report and investigation "
        "findings. Having reviewed all relevant documents, we are pleased to inform "
        "that the following repair costs have been approved for the above-mentioned "
        "vehicle.",
        styles["Body"],
    ))
    elements.append(Spacer(1, 2 * mm))
    elements.append(Paragraph(
        "<i>Kami merujuk kepada perkara di atas dan sebut harga pembaikan yang "
        "dikemukakan oleh bengkel anda, berserta laporan Penilai Kerugian dan "
        "dapatan siasatan. Setelah meneliti semua dokumen yang berkaitan, kami "
        "dengan sukacitanya memaklumkan bahawa kos pembaikan berikut telah "
        "diluluskan bagi kenderaan yang tersebut di atas.</i>",
        styles["Body"],
    ))
    elements.append(Spacer(1, 6 * mm))

    # ── 8. Approved Cost Table ──
    elements.append(Paragraph(
        "Approved Repair Costs / Kos Pembaikan Diluluskan", styles["SectionTitle"],
    ))

    total = (
        data.costs.parts + data.costs.labour + data.costs.paint
        + data.costs.towing + data.costs.misc
    )

    no_w = AVAIL_W * 0.08
    desc_w = AVAIL_W * 0.62
    amt_w = AVAIL_W * 0.30

    header_row = [
        Paragraph("No.", styles["TblHeader"]),
        Paragraph("Description / Keterangan", styles["TblHeader"]),
        Paragraph("Amount (RM) / Jumlah (RM)", styles["TblHeaderRight"]),
    ]
    cost_items = [
        ("1", "Spare Parts / Alat Ganti", data.costs.parts),
        ("2", "Labour Charges / Upah Kerja", data.costs.labour),
        ("3", "Painting Cost / Kos Mengecat", data.costs.paint),
        ("4", "Towing Charges / Kos Tunda", data.costs.towing),
        ("5", "Miscellaneous / Lain-lain", data.costs.misc),
    ]
    rows = [header_row]
    for num, desc, amt in cost_items:
        rows.append([
            Paragraph(num, styles["Body"]),
            Paragraph(desc, styles["Body"]),
            Paragraph(f"{amt:,.2f}", styles["BodyRight"]),
        ])
    rows.append([
        "",
        Paragraph("TOTAL APPROVED AMOUNT / JUMLAH KELULUSAN (RM)", styles["BodyBold"]),
        Paragraph(f"{total:,.2f}", styles["BodyBoldRight"]),
    ])

    cost_table = Table(rows, colWidths=[no_w, desc_w, amt_w], hAlign="LEFT")
    cost_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), GREY_FILL),
        ("BOX", (0, 0), (-1, -1), 0.5, BLACK),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, BLACK),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LINEABOVE", (0, -1), (-1, -1), 1, BLACK),
    ]))
    elements.append(cost_table)
    elements.append(Spacer(1, 2 * mm))

    elements.append(Paragraph(
        "* Betterment, Excess and Endorsement 2(f) charges (if applicable) are to "
        "be borne by the insured and are NOT included in the above approved amount.",
        styles["ItalicNote"],
    ))
    elements.append(Paragraph(
        "* Caj Kemajuan (Betterment), Lebihan (Excess) dan Endorsemen 2(f) "
        "(jika berkenaan) adalah tanggungan pihak diinsurans dan TIDAK termasuk "
        "dalam jumlah kelulusan di atas.",
        styles["ItalicNote"],
    ))
    elements.append(Spacer(1, 6 * mm))

    # ── 9. Terms and Conditions ──
    elements.append(Paragraph(
        "Terms and Conditions / Terma dan Syarat", styles["SectionTitle"],
    ))
    terms = [
        ("Repairs must be carried out strictly within the approved amount stated above.",
         "Pembaikan mestilah dijalankan mengikut jumlah yang telah diluluskan sahaja."),
        ("Any additional damage discovered during repair must be reported to us "
         "immediately for supplementary approval before work proceeds.",
         "Sebarang kerosakan tambahan yang ditemui semasa pembaikan mestilah "
         "dilaporkan kepada kami dengan segera untuk kelulusan tambahan sebelum "
         "kerja diteruskan."),
        ("This company shall not be liable for any cost exceeding the approved "
         "amount without prior written consent.",
         "Syarikat ini tidak bertanggungjawab ke atas sebarang kos yang melebihi "
         "jumlah yang diluluskan tanpa kebenaran bertulis terlebih dahulu."),
        ("Payment will only be processed upon submission of the completed tax invoice, "
         "repair bill, and satisfaction voucher duly signed by the insured.",
         "Pembayaran hanya akan diproses setelah invois cukai, bil pembaikan, dan "
         "baucar kepuasan yang telah ditandatangani oleh pihak diinsurans dikemukakan."),
        ("Repairs must be completed within thirty (30) days from the date of this letter.",
         "Pembaikan mestilah disiapkan dalam tempoh tiga puluh (30) hari dari tarikh "
         "surat ini."),
        ("Four (4) colour photographs of the vehicle after repair, taken from four "
         "different angles, must be submitted within 14 days of completion.",
         "Empat (4) keping gambar berwarna kenderaan selepas pembaikan dari empat "
         "sudut yang berlainan mestilah dikemukakan dalam tempoh 14 hari selepas "
         "siap pembaikan."),
    ]
    for i, (en, ms) in enumerate(terms, 1):
        elements.append(Paragraph(f"{i}. {en}", styles["Body"]))
        elements.append(Paragraph(f"<i>    {ms}</i>", styles["Body"]))
        elements.append(Spacer(1, 1 * mm))
    elements.append(Spacer(1, 4 * mm))

    # ── 10. Reference Documents ──
    elements.append(Paragraph(
        "Reference Documents / Dokumen Rujukan", styles["SectionTitle"],
    ))
    ref_docs = [
        "Police Report / Laporan Polis",
        "Investigation Result / Keputusan Siasatan",
        "Loss Adjuster’s Report / Laporan Penilai Kerugian",
        "Workshop Repair Quotation / Sebut Harga Pembaikan Bengkel",
    ]
    for i, doc_name in enumerate(ref_docs, 1):
        elements.append(Paragraph(f"{i}. {doc_name}", styles["Body"]))
        elements.append(Spacer(1, 1 * mm))
    elements.append(Spacer(1, 4 * mm))

    # ── 11. Closing Paragraph ──
    elements.append(Paragraph(
        "Should you have any queries regarding this approval, please do not hesitate "
        "to contact our Claims Department at the above number quoting the claim "
        "reference above. Thank you.",
        styles["Body"],
    ))
    elements.append(Spacer(1, 2 * mm))
    elements.append(Paragraph(
        "<i>Sekiranya anda mempunyai sebarang pertanyaan berkenaan kelulusan ini, "
        "sila hubungi Jabatan Tuntutan kami di nombor di atas dengan menyatakan "
        "nombor rujukan tuntutan tersebut. Terima kasih.</i>",
        styles["Body"],
    ))
    elements.append(Spacer(1, 10 * mm))

    # ── 12. Signature Section ──
    sig_left_rows = [
        [Paragraph("Authorised Signatory / Tandatangan Bertauliah:", styles["Body"])],
        [Spacer(1, 15 * mm)],
        [HRFlowable(width=55 * mm, thickness=0.5, color=BLACK)],
        [Paragraph(f"<b>{data.approved_by}</b>", styles["Body"])],
        [Paragraph(data.designation, styles["Body"])],
        [Paragraph("MyClaim Insurance Berhad", styles["Body"])],
        [Paragraph(f"Date: {data.date}", styles["Body"])],
    ]
    sig_left_table = Table(sig_left_rows, colWidths=[60 * mm])
    sig_left_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
    ]))

    stamp_box = Table(
        [[Paragraph("Company Stamp / Cop Syarikat", styles["SmallText"])]],
        colWidths=[45 * mm], rowHeights=[45 * mm],
    )
    stamp_box.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, BLACK),
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))

    sig_main = Table(
        [[sig_left_table, stamp_box]],
        colWidths=[AVAIL_W * 0.55, AVAIL_W * 0.45],
    )
    sig_main.setStyle(TableStyle([
        ("VALIGN", (0, 0), (0, 0), "TOP"),
        ("VALIGN", (1, 0), (1, 0), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
    ]))
    elements.append(sig_main)


# ── Main Generator ───────────────────────────────────────────
def generate_repair_approval_pdf(data: RepairApprovalData) -> str:
    file_path = get_report_path(data.claim_no)

    styles = _get_styles()

    doc = SimpleDocTemplate(
        file_path, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN + HEADER_H,
        bottomMargin=MARGIN + 5 * mm,
    )

    elements = []
    _build_content(elements, data, styles)

    on_page = lambda c, doc_tmpl: _draw_page(c, doc_tmpl, data)
    doc.build(elements, onFirstPage=on_page, onLaterPages=on_page)

    return file_path
