"""Document preprocessing for uploaded claim files.

This runs at upload time so later workflow steps can reason over extracted
document text instead of raw binaries.
"""
from __future__ import annotations

import asyncio
import base64
import logging
import random
import re
from pathlib import Path
from typing import Any

from markitdown import MarkItDown

from srcs.config import get_settings
from srcs.services.agents.rotating_llm import rotating_llm

_md = MarkItDown()
logger = logging.getLogger(__name__)

_DOC_EXTS = {".pdf", ".docx", ".doc", ".pptx", ".ppt"}
_IMAGE_EXTS = {".jpg", ".jpeg", ".png"}

_IMAGE_MIME = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
}

_IMAGE_PROMPT = (
    "You are processing an image submitted as part of an insurance claim.\n"
    "If it is an identity card, passport, driving license, or registration card, "
    "extract all visible fields as concise structured text.\n"
    "If it is a vehicle damage photo, describe all visible damage with location, "
    "affected parts, and severity.\n"
    "For every vehicle image, always check whether a vehicle license/registration "
    "plate is visible. If visible, transcribe the plate exactly and state where it "
    "appears, for example: 'front license plate visible: ABC1234'.\n"
    "If it is another kind of image, transcribe all visible text exactly.\n"
    "Do not invent information that is not visible in the image."
)

_GEMINI_KEY_TIMEOUT = 15.0
_GEMINI_BATCH_SIZE = 4
_MAX_GEMINI_KEYS = 12
_GEMINI_KEY_RE = re.compile(r"AIza[0-9A-Za-z_-]+")
_URL_KEY_RE = re.compile(r"([?&]key=)[^&\s]+")


def _error_summary(exc: Exception) -> str:
    message = str(exc).strip()
    message = _GEMINI_KEY_RE.sub("AIza...REDACTED", message)
    message = _URL_KEY_RE.sub(r"\1REDACTED", message)
    return f"{type(exc).__name__}: {message}" if message else type(exc).__name__


def _ocr_fallback(path: str) -> dict[str, Any]:
    """Fallback OCR path when Gemini vision is unavailable."""
    try:
        import pytesseract
        from PIL import Image as PILImage

        with PILImage.open(path) as img:
            text = pytesseract.image_to_string(img)
        return {"text": text, "method": "tesseract", "path": path}
    except ImportError:
        return {
            "text": "",
            "method": "unavailable",
            "path": path,
            "error": "No vision capability: add GEMINI_API_KEY_LIST or install Tesseract",
        }
    except Exception as exc:
        return {
            "text": "",
            "method": "tesseract_error",
            "path": path,
            "error": str(exc),
        }


def _compress_image_to_base64(path: str, max_size: int = 1920) -> str:
    """Read an image, resize it if too large, convert to JPEG, and return as base64."""
    import io
    from PIL import Image as PILImage

    with PILImage.open(path) as img:
        # Convert to RGB to ensure compatibility with JPEG
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        
        # Resize if max dimension exceeds max_size
        if max(img.width, img.height) > max_size:
            ratio = max_size / float(max(img.width, img.height))
            new_size = (int(img.width * ratio), int(img.height * ratio))
            img = img.resize(new_size, PILImage.Resampling.LANCZOS)
            
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=85)
        return base64.b64encode(buffer.getvalue()).decode("utf-8")


async def _extract_image_async(path: str) -> dict[str, Any]:
    """Use Unified RotatingLLM for vision, then fall back to OCR."""
    from langchain_core.messages import HumanMessage

    try:
        # 1. Compress image to prevent base64 payload bloat
        image_b64 = await asyncio.to_thread(_compress_image_to_base64, path)
        mime_type = "image/jpeg"

        # 2. Construct multi-modal message
        message = HumanMessage(
            content=[
                {"type": "text", "text": _IMAGE_PROMPT},
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{mime_type};base64,{image_b64}"},
                },
            ]
        )

        # 3. Use unified rotating_llm
        response = await rotating_llm.send_message(
            [message], 
            temperature=0.0,
            use_cache=True
        )

        if response.status == "ok":
            return {
                "text": response.text,
                "method": "rotating_llm_vision",
                "model": response.model,
                "path": path,
            }
        
        # If LLM failed, fallback to OCR
        logger.warning(f"RotatingLLM vision failed for {path}: {response.text}")
        return await asyncio.to_thread(_ocr_fallback, path)

    except Exception as exc:
        logger.error(f"Error in image extraction for {path}: {exc}")
        return await asyncio.to_thread(_ocr_fallback, path)



def _extract_doc_sync(path: str) -> dict[str, Any]:
    """MarkItDown extraction for PDFs and Office documents."""
    try:
        result = _md.convert(path)
        return {"text": result.text_content or "", "method": "markitdown", "path": path}
    except Exception as exc:
        return {
            "text": "",
            "method": "markitdown_error",
            "path": path,
            "error": str(exc),
        }


async def extract(path: str) -> dict[str, Any]:
    """Extract text or a structured visual description from one file."""
    ext = Path(path).suffix.lower()

    if ext in _IMAGE_EXTS:
        return await _extract_image_async(path)

    if ext in _DOC_EXTS:
        return await asyncio.to_thread(_extract_doc_sync, path)

    return {"text": "", "method": "unsupported", "path": path}


async def extract_case_documents(
    police_report_path: str | None,
    policy_pdf_path: str | None,
    repair_quotation_path: str | None,
    road_tax_path: str | None,
    adjuster_report_path: str | None,
    photo_paths: list[str],
) -> dict[str, dict[str, Any]]:
    """Extract text from all uploaded case documents concurrently."""
    named: dict[str, str] = {}
    if police_report_path:
        named["police_report"] = police_report_path
    if policy_pdf_path:
        named["policy_pdf"] = policy_pdf_path
    if repair_quotation_path:
        named["repair_quotation"] = repair_quotation_path
    if road_tax_path:
        named["road_tax"] = road_tax_path
    if adjuster_report_path:
        named["adjuster_report"] = adjuster_report_path
    for i, photo_path in enumerate(photo_paths):
        named[f"photo_{i}"] = photo_path

    if not named:
        return {}

    keys = list(named)
    results = await asyncio.gather(
        *(extract(named[key]) for key in keys),
        return_exceptions=True,
    )

    return {
        key: (
            result
            if not isinstance(result, Exception)
            else {"text": "", "method": "error", "error": str(result)}
        )
        for key, result in zip(keys, results)
    }


async def extract_uploaded_documents(paths: list[str]) -> dict[str, dict[str, Any]]:
    """Extract an arbitrary ordered list of uploaded documents.

    Keys are stable positional slots: uploaded_0, uploaded_1, ...
    The tagging agent assigns semantic roles later from extracted content.
    """
    if not paths:
        return {}

    keys = [f"uploaded_{index}" for index in range(len(paths))]
    results = await asyncio.gather(
        *(extract(path) for path in paths),
        return_exceptions=True,
    )

    return {
        key: (
            result
            if not isinstance(result, Exception)
            else {
                "text": "",
                "method": "error",
                "path": path,
                "error": _error_summary(result),
            }
        )
        for key, path, result in zip(keys, paths, results)
    }
