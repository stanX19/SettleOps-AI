"""Functionality tests for extracting fixture documents and images.

This test calls the real extraction stack:
- MarkItDown for PDF/DOC/DOCX/PPT/PPTX
- Gemini vision for JPG/JPEG/PNG

Run:
    python -m pytest tests/test_document_extraction.py -v -s
"""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import pytest

from srcs.services.document_processor import extract

FIXTURES_ROOT = Path(__file__).parent / "fixtures"
DOC_EXTS = (".pdf", ".docx", ".doc", ".pptx", ".ppt")
IMAGE_EXTS = (".jpg", ".jpeg", ".png")
SUPPORTED_EXTS = DOC_EXTS + IMAGE_EXTS


def _run(coro):
    return asyncio.run(coro)


def _discover_cases() -> list[Path]:
    if not FIXTURES_ROOT.exists():
        return []
    return sorted(
        path
        for path in FIXTURES_ROOT.iterdir()
        if path.is_dir() and path.name.startswith("case_")
    )


CASES = _discover_cases()


def _fixture_files(case_dir: Path) -> list[Path]:
    return sorted(
        path
        for path in case_dir.rglob("*")
        if path.is_file()
        and path.suffix.lower() in SUPPORTED_EXTS
        and not any(part.startswith(".") or part == "__pycache__" for part in path.parts)
    )


def _preview(text: str, limit: int = 500) -> str:
    compact = " ".join(text.split())
    return compact[:limit] + ("..." if len(compact) > limit else "")


def _print_result(label: str, result: dict[str, Any]) -> None:
    text = result.get("text") or ""
    method = result.get("method")
    model = result.get("model")
    print(
        f"\n- {label}: method={method}"
        f"{f' model={model}' if model else ''} chars={len(text)}"
    )
    print(f"  preview: {_preview(text) if text else '[empty]'}")
    if result.get("error"):
        print(f"  error: {result['error']}")
    if result.get("gemini_error"):
        print(f"  gemini_error: {result['gemini_error']}")


def _extract_with_retry(path: Path) -> dict[str, Any]:
    attempts = 3 if path.suffix.lower() in IMAGE_EXTS else 1
    result: dict[str, Any] = {}
    for _ in range(attempts):
        result = _run(extract(str(path)))
        if path.suffix.lower() not in IMAGE_EXTS or result.get("method") == "gemini_vision":
            return result
    return result


def _extract_case_sequential(case_dir: Path) -> dict[str, dict[str, Any]]:
    results: dict[str, dict[str, Any]] = {}

    for index, path in enumerate(_fixture_files(case_dir)):
        results[f"uploaded_{index}"] = _extract_with_retry(path)

    return results


@pytest.mark.parametrize("case_dir", CASES, ids=lambda path: path.name)
def test_extract_all_documents_in_fixture_case(case_dir: Path):
    """Every case fixture should produce readable extraction output."""
    results = _extract_case_sequential(case_dir)

    assert results, f"{case_dir.name} has no extractable fixture files"
    print(f"\n\n[{case_dir.name}] files: {', '.join(results)}")

    for slot, result in results.items():
        _print_result(slot, result)
        text = result.get("text") or ""

        if result.get("path") and Path(result["path"]).suffix.lower() in IMAGE_EXTS:
            assert result.get("method") == "gemini_vision", (
                f"{case_dir.name}/{slot} did not use Gemini vision. "
                f"method={result.get('method')}, gemini_error={result.get('gemini_error')}"
            )
            assert text.strip(), f"{case_dir.name}/{slot} Gemini returned empty text"
            continue

        assert text.strip(), f"{case_dir.name}/{slot} extracted empty text"
        assert not result.get("error"), f"{case_dir.name}/{slot}: {result.get('error')}"
