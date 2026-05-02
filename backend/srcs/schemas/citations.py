"""Citation models for agent output traceability.

Every agent output must include citations linking conclusions back to source
documents, images, or upstream agent outputs. Citations are validated by
``citation_validator`` before agent results are accepted.
"""
from __future__ import annotations

import hashlib
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class CitationSourceType(str, Enum):
    TEXT = "text"
    IMAGE = "image"
    AGENT_OUTPUT = "agent_output"
    REFERENCE = "reference"


class Citation(BaseModel):
    """A single citation backing a specific field in an agent's output."""

    filename: str = Field(
        ...,
        description="Exact filename as stored in workflow state (may include "
                    "prefixes like 'uploaded_0_'). For agent_output/reference "
                    "types, this is a logical name like "
                    "'liability_analysis_output' or 'parts_pricing_guide'.",
    )
    source_type: CitationSourceType
    excerpt: Optional[str] = Field(
        None,
        min_length=1,
        max_length=500,
        description="Verbatim quote from text documents or reference docs. MUST be null for image citations.",
    )
    comment: str = Field(
        ...,
        min_length=1,
        description="What this evidence shows (e.g. visible damage in an image).",
    )
    conclusion: str = Field(
        ...,
        min_length=1,
        description="Which agent decision/output field this evidence supports.",
    )
    node_id: str = Field(
        ...,
        min_length=1,
        description="Identifier of the agent task that produced this citation.",
    )
    field_path: str = Field(
        ...,
        min_length=1,
        description="Name of the output field this citation backs.",
    )

    # Populated by the validator on successful exact-match validation
    char_start: Optional[int] = None
    char_end: Optional[int] = None
    page: Optional[int] = None
    # Deterministic 12-char hex key: stable across reruns unless content changes
    id: str = ""

    @staticmethod
    def make_id(field_path: str, filename: str, excerpt: Optional[str]) -> str:
        key = f"{field_path}:{filename}:{(excerpt or '')[:60]}"
        return hashlib.sha256(key.encode()).hexdigest()[:12]


def stamp_citation_ids(citations: list[dict]) -> list[dict]:
    """Return citation dict copies with deterministic IDs populated."""
    stamped: list[dict] = []
    for citation in citations:
        if not isinstance(citation, dict):
            continue
        next_citation = dict(citation)
        if not next_citation.get("id"):
            next_citation["id"] = Citation.make_id(
                str(next_citation.get("field_path") or ""),
                str(next_citation.get("filename") or ""),
                next_citation.get("excerpt"),
            )
        stamped.append(next_citation)
    return stamped


class CitationTopicGroup(BaseModel):
    """A named group of supporting citations sharing a common business topic."""
    topic: str
    citations: list[Citation]


class CitationSummary(BaseModel):
    """Structured citation output emitted per blackboard section.

    The backend classifies every citation into one of three roles before
    emission so the frontend can render tiers without re-deriving semantics:
    - key_evidence: one citation per decision-critical field (deduped, capped at 1)
    - supporting_groups: remaining non-auditor citations bucketed by topic
    - audit_cross_check: auditor confirmation citations (low visual weight)
    """
    key_evidence: list[Citation] = Field(default_factory=list)
    supporting_groups: list[CitationTopicGroup] = Field(default_factory=list)
    audit_cross_check: list[Citation] = Field(default_factory=list)
    hidden_duplicates_count: int = 0

    @classmethod
    def empty(cls) -> "CitationSummary":
        return cls()


class CitationValidationError(Exception):
    """Raised when an agent's citations cannot be validated after retries.

    ``last_result`` carries the agent's final output dict so callers can
    preserve extracted data even when citation evidence is incomplete.
    """

    def __init__(
        self,
        errors: list[str],
        node_id: str,
        last_result: dict | None = None,
    ) -> None:
        self.errors = errors
        self.node_id = node_id
        self.last_result: dict = last_result or {}
        joined = "; ".join(errors)
        super().__init__(f"Citation validation failed for {node_id}: {joined}")
