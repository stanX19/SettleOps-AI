"""Citation validation gate.

Runs after every agent task returns JSON. Verifies that every cited filename
exists in the workflow state and that text excerpts are actually present in
the document content. Retries the task with structured feedback if the LLM
cited something invalid; raises ``CitationValidationError`` after retries
exhaust so the caller can fail the node hard rather than silently accepting
unverified output.
"""
from __future__ import annotations

import re
import inspect
from typing import Any, Awaitable, Callable, Mapping, Optional

from srcs.logger import logger
from srcs.schemas.citations import (
    Citation,
    CitationSourceType,
    CitationValidationError,
)

MAX_RETRIES = 2

# Logical filenames the auditor is allowed to cite when source_type == agent_output.
KNOWN_AGENT_OUTPUT_FILENAMES = frozenset({
    "policy_analysis_output",
    "liability_analysis_output",
    "damage_analysis_output",
    "fraud_analysis_output",
    "payout_calculation_output",
})

TaskFn = Callable[..., Mapping[str, Any] | Awaitable[Mapping[str, Any]]]


def _accepts_feedback(task_fn: TaskFn) -> bool:
    try:
        signature = inspect.signature(task_fn)
    except (TypeError, ValueError):
        return True
    return any(
        name == "feedback" or param.kind is inspect.Parameter.VAR_KEYWORD
        for name, param in signature.parameters.items()
    )


async def _call_task(
    task_fn: TaskFn,
    state: Mapping[str, Any],
    feedback: str,
) -> Mapping[str, Any]:
    if _accepts_feedback(task_fn):
        result = task_fn(state, feedback=feedback)
    else:
        result = task_fn(state)
    if inspect.isawaitable(result):
        result = await result
    return result


async def validate_citations(
    raw_result: Mapping[str, Any],
    state: Mapping[str, Any],
    task_fn: TaskFn,
    feedback: Optional[str],
    node_id: str,
) -> tuple[dict[str, Any], list[str]]:
    """Validate citations in ``raw_result``; retry the task if invalid.

    Args:
        raw_result: The agent's most recent JSON response (dict-like).
        state: Workflow state — only ``state["documents"]`` is read.
        task_fn: The agent task to re-call on retry. Must accept ``state`` and
            an optional ``feedback`` keyword.
        feedback: Pre-existing feedback (e.g. an active challenge) to preserve
            across retries.
        node_id: Identifier for this task — used in errors and citation tagging.

    Returns:
        A tuple ``(validated_result, warnings)`` where ``validated_result`` is
        a mutable dict copy of the agent output with citation offsets enriched.

    Raises:
        CitationValidationError: After ``MAX_RETRIES`` retries still fail.
    """
    documents: list[dict[str, Any]] = list(state.get("documents", []) or [])
    filename_to_doc = {d.get("filename", ""): d for d in documents if d.get("filename")}
    image_filenames = {
        d["filename"] for d in documents
        if d.get("filename") and (d.get("source_type") == "image")
    }

    current = dict(raw_result)
    last_errors: list[str] = []

    for attempt in range(MAX_RETRIES + 1):
        errors = _collect_errors(
            citations=list(current.get("citations") or []),
            filename_to_doc=filename_to_doc,
            image_filenames=image_filenames,
        )
        if not errors:
            return current, []

        last_errors = errors
        if attempt == MAX_RETRIES:
            logger.warning(
                "Citation validation exhausted retries for %s: %s",
                node_id, errors,
            )
            raise CitationValidationError(errors, node_id=node_id)

        retry_feedback = _build_retry_feedback(errors, list(filename_to_doc.keys()))
        combined = (
            f"{feedback}\n\n{retry_feedback}" if feedback else retry_feedback
        )
        logger.info(
            "Retrying %s due to citation validation errors (attempt %d/%d)",
            node_id, attempt + 1, MAX_RETRIES,
        )
        current = dict(await _call_task(task_fn, state, combined))

    # Should not reach here, but be defensive.
    raise CitationValidationError(last_errors or ["unknown"], node_id=node_id)


def _collect_errors(
    citations: list[dict[str, Any]],
    filename_to_doc: Mapping[str, dict[str, Any]],
    image_filenames: set[str],
) -> list[str]:
    """Validate each citation; mutate the dict in-place to enrich offsets."""
    errors: list[str] = []

    if not citations:
        return ["No citations provided. Every factual claim requires at least one citation."]

    for idx, raw in enumerate(citations):
        if not isinstance(raw, dict):
            errors.append(f"citations[{idx}] is not an object")
            continue

        # Pydantic validation — catches missing required fields and wrong types.
        try:
            citation = Citation.model_validate(raw)
        except Exception as e:
            errors.append(f"citations[{idx}] schema invalid: {e}")
            continue

        if citation.source_type is CitationSourceType.AGENT_OUTPUT:
            if citation.filename not in KNOWN_AGENT_OUTPUT_FILENAMES:
                errors.append(
                    f"citations[{idx}]: '{citation.filename}' is not a known agent output. "
                    f"Use one of: {sorted(KNOWN_AGENT_OUTPUT_FILENAMES)}"
                )
            if not citation.excerpt:
                errors.append(f"citations[{idx}]: agent_output citations need a non-empty excerpt")
            continue

        if citation.filename not in filename_to_doc:
            errors.append(
                f"citations[{idx}]: filename '{citation.filename}' not found in uploaded documents"
            )
            continue

        doc = filename_to_doc[citation.filename]

        if citation.source_type is CitationSourceType.IMAGE:
            if citation.filename not in image_filenames:
                errors.append(
                    f"citations[{idx}]: '{citation.filename}' is not an image document"
                )
            if citation.excerpt is not None:
                errors.append(
                    f"citations[{idx}]: image citation must have excerpt=null"
                )
            # comment + conclusion already required as min_length=1 by schema
            continue

        # source_type == TEXT
        if not citation.excerpt:
            errors.append(f"citations[{idx}]: text citation requires a non-empty excerpt")
            continue

        content = doc.get("content") or ""
        match = _find_excerpt(citation.excerpt, content)
        if match is None:
            errors.append(
                f"citations[{idx}]: excerpt not found in '{citation.filename}': "
                f"'{citation.excerpt[:80]}{'...' if len(citation.excerpt) > 80 else ''}'"
            )
        else:
            start, end = match
            raw["char_start"] = start
            raw["char_end"] = end

    return errors


def _find_excerpt(excerpt: str, content: str) -> Optional[tuple[int, int]]:
    """Return ``(start, end)`` if excerpt is present in content, else None.

    Matching cascade (stops at first hit):
    1. Case-insensitive exact substring
    2. Label-value split — e.g. "No. Pendaftaran: OPS 1111" → find "OPS 1111"
    3. Normalized alphanumeric substring (tolerates OCR spacing/punctuation drift)
    """
    if not excerpt or not content:
        return None

    if _has_ellipsis(excerpt):
        return None

    lc_excerpt = excerpt.lower()
    lc_content = content.lower()
    pos = lc_content.find(lc_excerpt)
    if pos != -1:
        return pos, pos + len(excerpt)

    label_value_match = _find_label_value_excerpt(excerpt, content)
    if label_value_match is not None:
        return label_value_match

    return _find_normalized_excerpt(excerpt, content)


def _normalize_for_match(value: str) -> tuple[str, list[int]]:
    """Normalize OCR/PDF text while keeping a map back to original offsets."""
    normalized: list[str] = []
    index_map: list[int] = []

    for index, char in enumerate(value):
        if char.isalnum():
            normalized.append(char.lower())
            index_map.append(index)

    return "".join(normalized), index_map


def _find_normalized_excerpt(excerpt: str, content: str) -> Optional[tuple[int, int]]:
    normalized_excerpt, _ = _normalize_for_match(excerpt)
    normalized_content, content_index_map = _normalize_for_match(content)

    if len(normalized_excerpt) < 8:
        return None

    normalized_pos = normalized_content.find(normalized_excerpt)
    if normalized_pos == -1:
        return None

    original_start = content_index_map[normalized_pos]
    original_end = content_index_map[normalized_pos + len(normalized_excerpt) - 1] + 1
    return original_start, original_end


def _find_label_value_excerpt(excerpt: str, content: str) -> Optional[tuple[int, int]]:
    """Value-aware fallback for label/value citations split across PDF lines.

    Extracts candidate values from structured excerpts like:
      "No. Pendaftaran: OPS 1111"       → tries "OPS 1111"
      "Warna / Colour: KUNING / YELLOW" → tries "KUNING / YELLOW"
      "No. Casis/No. Sin BNR34-305612"  → tries "BNR34-305612"
    and returns offsets of the first value found in the document content.
    """
    for value in _candidate_values_from_excerpt(excerpt):
        match = _find_value_only(value, content)
        if match is not None:
            return match
    return None


def _has_ellipsis(value: str) -> bool:
    return "..." in value or "\u2026" in value


def _find_value_only(value: str, content: str) -> Optional[tuple[int, int]]:
    value = value.strip(" \t\r\n:;,.")
    if len(value) < 4 or _has_ellipsis(value):
        return None

    lc_value = value.lower()
    lc_content = content.lower()
    pos = lc_content.find(lc_value)
    if pos != -1:
        return pos, pos + len(value)

    norm_value, _ = _normalize_for_match(value)
    if len(norm_value) < 4:
        return None

    norm_content, content_idx = _normalize_for_match(content)
    norm_pos = norm_content.find(norm_value)
    if norm_pos == -1:
        return None

    original_start = content_idx[norm_pos]
    original_end = content_idx[norm_pos + len(norm_value) - 1] + 1
    return original_start, original_end


def _candidate_values_from_excerpt(excerpt: str) -> list[str]:
    cleaned = excerpt.strip()
    if _has_ellipsis(cleaned):
        return []

    candidates: list[str] = []

    if ":" in cleaned:
        _, _, value = cleaned.rpartition(":")
        if value.strip():
            candidates.append(value.strip())

    known_labels = [
        "No. Pendaftaran",
        "Registration No.",
        "Warna / Colour",
        "Warna",
        "Colour",
        "No. Enjin",
        "Engine No.",
        "No. Casis/No. Sin",
        "No. Casis",
        "Chassis No.",
        "No. Sin",
        "Policy No.",
        "No. Sijil / Cert No.",
        "Cover Note No.",
        "No. Nota Perlindungan",
    ]
    lower_cleaned = cleaned.lower()
    for label in known_labels:
        if lower_cleaned.startswith(label.lower()):
            value = cleaned[len(label):].strip(" \t\r\n:-")
            if value:
                candidates.append(value)

    value_patterns = [
        r"\b[A-Z]{1,4}\s?\d{1,4}[A-Z]?\b",
        r"\b[A-Z0-9]{2,}[-/][A-Z0-9][A-Z0-9/-]*\b",
        r"\b[A-Z][A-Z0-9-]{5,}\b",
        r"\b[A-Z]+(?:\s*/\s*[A-Z]+)+\b",
        r"\bRM\s?\d[\d,]*(?:\.\d+)?\b",
        r"\b\d{2}/\d{2}/\d{4}\b",
    ]
    for pattern in value_patterns:
        candidates.extend(match.group(0).strip() for match in re.finditer(pattern, cleaned))

    deduped: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        key = candidate.lower()
        if key not in seen and len(candidate) >= 4:
            seen.add(key)
            deduped.append(candidate)
    return deduped


def _build_retry_feedback(errors: list[str], available_filenames: list[str]) -> str:
    bullets = "\n".join(f"  - {e}" for e in errors)
    files_list = "\n".join(f"  - {f}" for f in available_filenames) or "  (no documents)"
    return (
        "CITATION VALIDATION FAILED. Your previous response had these errors:\n"
        f"{bullets}\n\n"
        "Please re-emit the JSON with corrected citations. Rules:\n"
        "  1. 'filename' must exactly match one of the Available Files below.\n"
        "  2. For text citations, 'excerpt' must be a short verbatim quote from the document content.\n"
        "     Prefer stable values/phrases like policy numbers, names, registration numbers, amounts, or dates.\n"
        "     Do not use ellipses (...), summaries, reconstructed label/value lines, or long addresses.\n"
        "  3. For image citations, set 'excerpt' to null and describe visible evidence in 'comment'.\n"
        "  4. Every output field must be backed by at least one citation.\n\n"
        f"Available Files:\n{files_list}\n"
    )
