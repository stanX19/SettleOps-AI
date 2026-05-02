import io
import os
import logging
from datetime import datetime
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib import colors
from pypdf import PdfReader, PdfWriter

logger = logging.getLogger(__name__)

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
ASSETS_DIR = os.path.join(PROJECT_ROOT, "backend", "assets")
DEFAULT_STAMP_PATH = os.path.join(ASSETS_DIR, "MyClaim-Stamp.png")

PAGE_W, PAGE_H = A4
MARGIN = 2.5 * cm


def _create_signature_overlay(
    page_width: float,
    page_height: float,
    signer_name: str,
    designation: str,
    sign_date: str,
    stamp_path: str = None,
    sig_x: float = None,
    sig_y: float = None,
    stamp_x: float = None,
    stamp_y: float = None,
) -> io.BytesIO:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(page_width, page_height))

    if sig_x is None:
        sig_x = MARGIN + 2 * mm
    if sig_y is None:
        sig_y = 48 * mm

    c.setFont("Helvetica-BoldOblique", 14)
    c.setFillColor(colors.HexColor("#00008B"))
    c.drawString(sig_x, sig_y, signer_name)

    c.setFont("Helvetica", 6.5)
    c.setFillColor(colors.HexColor("#444444"))
    c.drawString(sig_x, sig_y - 11, f"Digitally signed on {sign_date}")
    c.drawString(sig_x, sig_y - 20, designation)

    if stamp_path and os.path.isfile(stamp_path):
        if stamp_x is None:
            stamp_x = page_width - MARGIN - 42 * mm
        if stamp_y is None:
            stamp_y = 32 * mm

        c.drawImage(
            stamp_path,
            stamp_x, stamp_y,
            width=40 * mm, height=40 * mm,
            preserveAspectRatio=True,
            mask="auto",
        )
    elif stamp_path:
        logger.warning("Stamp image not found at %s — skipping stamp overlay", stamp_path)

    c.save()
    buf.seek(0)
    return buf


def sign_and_stamp(
    pdf_path: str,
    signer_name: str,
    designation: str,
    sign_date: str = None,
    stamp_path: str = None,
    output_path: str = None,
) -> str:
    """
    Overlay a digital signature and company stamp onto the last page of a PDF.

    Returns the path to the signed PDF.
    """
    if sign_date is None:
        sign_date = datetime.now().strftime("%d/%m/%Y %H:%M")

    if stamp_path is None:
        stamp_path = DEFAULT_STAMP_PATH

    reader = PdfReader(pdf_path)
    writer = PdfWriter()
    last_idx = len(reader.pages) - 1

    sig_x = None
    sig_y = None
    stamp_y = None

    try:
        import fitz
        doc = fitz.open(pdf_path)
        fitz_page = doc[last_idx]
        ph_fitz = fitz_page.rect.height

        sig_rects = fitz_page.search_for("Tandatangan Bertauliah")
        if sig_rects:
            rect = sig_rects[0]
            # We don't overwrite sig_x here because searching for a substring might
            # shift the x coordinate to the middle of the sentence. We want it left-aligned.
            
            # reportlab Y is from bottom. rect.y1 is the bottom of the text from top.
            # 15mm offset places the signature neatly between the text and the 25mm line.
            sig_y = ph_fitz - rect.y1 - 15 * mm

        stamp_rects = fitz_page.search_for("Cop Syarikat")
        if stamp_rects:
            rect = stamp_rects[0]
            # Stamp image is drawn upwards from stamp_y. Place it 2mm above the text.
            stamp_y = ph_fitz - rect.y0 + 2 * mm

        doc.close()
    except Exception as e:
        logger.warning(f"Could not dynamically position signature via fitz: {e}")

    for i, page in enumerate(reader.pages):
        if i == last_idx:
            box = page.mediabox
            pw = float(box.width)
            ph = float(box.height)

            overlay_buf = _create_signature_overlay(
                page_width=pw,
                page_height=ph,
                signer_name=signer_name,
                designation=designation,
                sign_date=sign_date,
                stamp_path=stamp_path,
                sig_x=sig_x,
                sig_y=sig_y,
                stamp_y=stamp_y,
            )
            overlay_page = PdfReader(overlay_buf).pages[0]
            page.merge_page(overlay_page)

        writer.add_page(page)

    if output_path is None:
        base, ext = os.path.splitext(pdf_path)
        output_path = f"{base}_signed{ext}"

    with open(output_path, "wb") as f:
        writer.write(f)

    return output_path
