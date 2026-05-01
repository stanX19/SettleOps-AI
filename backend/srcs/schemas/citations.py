"""Citation models for agent output traceability.

Every agent output must include citations linking conclusions back to source
documents, images, or upstream agent outputs. Citations are validated by
``citation_validator`` before agent results are accepted.
"""
from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class CitationSourceType(str, Enum):
    TEXT = "text"
    IMAGE = "image"
    AGENT_OUTPUT = "agent_output"


class Citation(BaseModel):
    """A single citation backing a specific field in an agent's output."""

    filename: str = Field(
        ...,
        description="Exact filename as stored in workflow state (may include "
                    "prefixes like 'uploaded_0_'). For agent_output type, "
                    "this is a logical name like 'liability_analysis_output'.",
    )
    source_type: CitationSourceType
    excerpt: Optional[str] = Field(
        None,
        min_length=1,
        max_length=500,
        description="Verbatim quote from text documents. MUST be null for image citations.",
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


class CitationValidationError(Exception):
    """Raised when an agent's citations cannot be validated after retries."""

    def __init__(self, errors: list[str], node_id: str) -> None:
        self.errors = errors
        self.node_id = node_id
        joined = "; ".join(errors)
        super().__init__(f"Citation validation failed for {node_id}: {joined}")
