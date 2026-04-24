"""Functionality tests for tagging extracted fixture documents.

This test calls the real extraction stack and the real intake tagging LLM.
It verifies the implementation plan end-to-end:

fixtures -> document extraction -> normalized workflow documents -> tagging agent

Run:
    python -m pytest tests/test_document_tagging.py -v -s
"""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import pytest

from srcs.services.agents.intake import REQUIRED_DOCS, ingest_tagging
from srcs.services.case_service import _to_workflow_state
from srcs.services.case_store import CaseState
from srcs.services.document_processor import extract, extract_uploaded_documents

FIXTURES_ROOT = Path(__file__).parent / "fixtures"
DOC_EXTS = (".pdf", ".docx", ".doc", ".pptx", ".ppt")
IMAGE_EXTS = (".jpg", ".jpeg", ".png")
SUPPORTED_EXTS = DOC_EXTS + IMAGE_EXTS

CORE_EXPECTED_TAGS = {
    "police_report": "police_report",
    "policy_pdf": "policy_covernote",
    "repair_quotation": "workshop_quote",
    "road_tax": "road_tax_reg",
}


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


def _preview(text: str, limit: int = 220) -> str:
    compact = " ".join(text.split())
    return compact[:limit] + ("..." if len(compact) > limit else "")


def _extract_with_retry(path: Path) -> dict[str, Any]:
    attempts = 3 if path.suffix.lower() in IMAGE_EXTS else 1
    result: dict[str, Any] = {}
    for _ in range(attempts):
        result = _run(extract(str(path)))
        if path.suffix.lower() not in IMAGE_EXTS or result.get("method") == "gemini_vision":
            return result
    return result


def _build_case_state(case_dir: Path) -> CaseState:
    uploaded_paths = _fixture_files(case_dir)

    extractions = _run(extract_uploaded_documents([str(path) for path in uploaded_paths]))

    for index, path in enumerate(uploaded_paths):
        key = f"uploaded_{index}"
        if path.suffix.lower() in IMAGE_EXTS and extractions.get(key, {}).get("method") != "gemini_vision":
            extractions[key] = _extract_with_retry(path)

    return CaseState(
        case_id=f"TAG-{case_dir.name}",
        submitted_at="2026-04-25T00:00:00+00:00",
        uploaded_document_paths=[str(path) for path in uploaded_paths],
        document_extractions=extractions,
    )


def _slot_tags(workflow_documents: list[dict[str, Any]], tagged: dict[str, str]) -> dict[str, str]:
    tags_by_slot = {}
    for index, tag in tagged.items():
        try:
            doc = workflow_documents[int(index)]
        except (ValueError, IndexError):
            continue
        tags_by_slot[doc.get("slot", f"document_{index}")] = tag
    return tags_by_slot


@pytest.mark.parametrize("case_dir", CASES, ids=lambda path: path.name)
def test_tagging_agent_tags_extracted_fixture_case(case_dir: Path):
    case_state = _build_case_state(case_dir)
    workflow_state = _to_workflow_state(case_state)
    documents = workflow_state["documents"]

    print(f"\n\n[{case_dir.name}] documents sent to tagging agent:")
    for index, doc in enumerate(documents):
        print(
            f"- {index}: slot={doc.get('slot')} hint={doc.get('doc_type')} "
            f"method={doc.get('extraction_method')}"
        )
        print(f"  content: {_preview(doc.get('content') or '')}")
        assert doc.get("content") and not str(doc.get("content")).startswith(
            "[Extraction unavailable"
        ), f"{case_dir.name}/{doc.get('slot')} has no extracted content"
        if str(doc.get("slot", "")).startswith("photo_"):
            assert doc.get("extraction_method") == "gemini_vision", (
                f"{case_dir.name}/{doc.get('slot')} did not use Gemini vision"
            )

    result = _run(ingest_tagging(workflow_state))
    tagged = result.get("case_facts", {}).get("tagged_documents", {})
    tags_by_slot = _slot_tags(documents, tagged)

    print(f"\n[{case_dir.name}] raw tags: {tagged}")
    print(f"[{case_dir.name}] tags by slot: {tags_by_slot}")
    print(f"[{case_dir.name}] trace: {result.get('trace_log')}")

    assert tagged, f"{case_dir.name}: tagging agent returned no tags"
    assert all(tag in REQUIRED_DOCS or tag == "unknown" for tag in tagged.values())

    found_tags = set(tags_by_slot.values())
    for expected_tag in CORE_EXPECTED_TAGS.values():
        assert expected_tag in found_tags, (
            f"{case_dir.name}: expected tag {expected_tag}, got {tags_by_slot}"
        )

    image_slots = [
        doc["slot"]
        for doc in documents
        if doc.get("source_type") == "image"
    ]
    if image_slots:
        assert any(slot in tags_by_slot for slot in image_slots), (
            f"{case_dir.name}: images were not tagged"
        )
        assert any(
            tags_by_slot.get(slot) in {"damage_closeup", "car_photo_plate", "nric", "driver_license"}
            for slot in image_slots
        ), f"{case_dir.name}: no image was tagged as claim evidence"


@pytest.mark.parametrize("case_dir", CASES, ids=lambda path: path.name)
def test_tagging_agent_preserves_existing_tags_when_resuming(case_dir: Path):
    case_state = _build_case_state(case_dir)
    workflow_state = _to_workflow_state(case_state)
    documents = workflow_state["documents"]

    if len(documents) < 2:
        pytest.skip(f"{case_dir.name} needs at least two documents for resume tagging")

    workflow_state["case_facts"] = {"tagged_documents": {"0": "police_report"}}
    workflow_state["processed_indices"] = [0]

    result = _run(ingest_tagging(workflow_state))
    tagged = result.get("case_facts", {}).get("tagged_documents", {})

    print(f"\n\n[{case_dir.name}] resume tags: {tagged}")

    assert tagged.get("0") == "police_report"
    assert any(index != "0" for index in tagged), (
        f"{case_dir.name}: tagging did not process new documents during resume"
    )
