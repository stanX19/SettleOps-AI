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


async def _gemini_vision_once(
    model_name: str,
    mime_type: str,
    image_b64: str,
    api_key: str,
) -> str:
    from langchain_google_genai import ChatGoogleGenerativeAI
    from langchain_core.messages import HumanMessage

    llm = ChatGoogleGenerativeAI(
        model=model_name,
        google_api_key=api_key,
        temperature=0.0,
        max_retries=0,
    )
    message = HumanMessage(
        content=[
            {"type": "text", "text": _IMAGE_PROMPT},
            {
                "type": "image_url",
                "image_url": {"url": f"data:{mime_type};base64,{image_b64}"},
            },
        ]
    )
    result = await llm.ainvoke([message])
    return result.content if isinstance(result.content, str) else str(result.content)


def _vision_model_candidates(model_name: str) -> list[str]:
    candidates = [model_name, "gemini-2.5-flash", "gemini-2.0-flash"]
    return list(dict.fromkeys(model for model in candidates if model))


async def _extract_image_async(path: str) -> dict[str, Any]:
    """Use Gemini vision first, then fall back to OCR."""
    try:
        settings = get_settings()
    except Exception as exc:
        fallback = await asyncio.to_thread(_ocr_fallback, path)
        fallback.setdefault("gemini_error", _error_summary(exc))
        return fallback

    single_key = getattr(settings, "GEMINI_API_KEY", "")
    primary_keys = [single_key] if single_key else []
    fallback_keys = list(settings.GEMINI_API_KEY_LIST)
    configured_keys = primary_keys + fallback_keys

    gemini_keys = list(
        dict.fromkeys(key.strip() for key in configured_keys if key and key.strip())
    )

    if gemini_keys:
        try:
            # Compress the image to dramatically reduce base64 size and prevent timeouts
            image_b64 = await asyncio.to_thread(_compress_image_to_base64, path)
            mime_type = "image/jpeg"

            timeout_seconds = float(
                getattr(settings, "GEMINI_VISION_TIMEOUT_SECONDS", _GEMINI_KEY_TIMEOUT)
                or _GEMINI_KEY_TIMEOUT
            )
            batch_size = max(
                1,
                int(
                    getattr(settings, "GEMINI_VISION_BATCH_SIZE", _GEMINI_BATCH_SIZE)
                    or _GEMINI_BATCH_SIZE
                ),
            )
            max_keys = max(
                1,
                int(
                    getattr(settings, "GEMINI_VISION_MAX_KEYS", _MAX_GEMINI_KEYS)
                    or _MAX_GEMINI_KEYS
                ),
            )

            # Keep GEMINI_API_KEY first when present; shuffle the rest to spread usage.
            primary_key = single_key.strip() if single_key else ""
            if primary_key and primary_key in gemini_keys:
                remaining_keys = [key for key in gemini_keys if key != primary_key]
                random.shuffle(remaining_keys)
                gemini_keys = [primary_key, *remaining_keys][:max_keys]
            else:
                random.shuffle(gemini_keys)
                gemini_keys = gemini_keys[:max_keys]
            errors: list[str] = []

            for model_name in _vision_model_candidates(settings.GEMINI_MODEL_NAME):
                for start in range(0, len(gemini_keys), batch_size):
                    batch = gemini_keys[start : start + batch_size]
                    tasks = [
                        asyncio.create_task(
                            asyncio.wait_for(
                                _gemini_vision_once(
                                    model_name,
                                    mime_type,
                                    image_b64,
                                    key,
                                ),
                                timeout=timeout_seconds,
                            )
                        )
                        for key in batch
                    ]
                    try:
                        for task in asyncio.as_completed(tasks):
                            try:
                                text = await task
                                for other in tasks:
                                    if not other.done():
                                        other.cancel()
                                await asyncio.gather(*tasks, return_exceptions=True)
                                return {
                                    "text": text,
                                    "method": "gemini_vision",
                                    "model": model_name,
                                    "path": path,
                                }
                            except Exception as exc:  # noqa: PERF203
                                error = _error_summary(exc)
                                if error not in errors:
                                    errors.append(error)
                                logger.warning(
                                    "Gemini vision extraction failed for %s using %s: %s",
                                    Path(path).name,
                                    model_name,
                                    error[:300],
                                )
                    finally:
                        for task in tasks:
                            if not task.done():
                                task.cancel()
                        await asyncio.gather(*tasks, return_exceptions=True)

            fallback = await asyncio.to_thread(_ocr_fallback, path)
            if errors:
                fallback.setdefault("gemini_error", "; ".join(errors[-3:])[:500])
            return fallback
        except ImportError as exc:
            fallback = await asyncio.to_thread(_ocr_fallback, path)
            fallback.setdefault("gemini_error", _error_summary(exc))
            return fallback
        except Exception as exc:
            fallback = await asyncio.to_thread(_ocr_fallback, path)
            fallback.setdefault("gemini_error", _error_summary(exc)[:300])
            return fallback

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
