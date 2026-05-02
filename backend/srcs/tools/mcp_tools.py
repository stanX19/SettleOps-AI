"""MCP-style tool layer for SettleOps-AI.

Each function reads a curated reference document from the local
``policy_documents/`` or ``pricing_references/`` directories and returns
its content as a string.  Agents call these before building their prompts
so that every decision is grounded in authoritative reference material
rather than the model's training priors alone.
"""
from __future__ import annotations

import os
from pathlib import Path

_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent  # backend/


def _read_ref(relative_path: str) -> str:
    """Read a reference file, returning its text or a descriptive error."""
    full = _BACKEND_ROOT / relative_path
    try:
        return full.read_text(encoding="utf-8")
    except FileNotFoundError:
        return f"[Reference file not found: {relative_path}]"
    except Exception as exc:  # noqa: BLE001
        return f"[Error reading {relative_path}: {exc}]"


# -- Policy reference ---------------------------------------------------------

def fetch_motor_policy_guidelines() -> str:
    """MCP tool: load standard motor insurance policy guidelines."""
    return _read_ref("policy_documents/motor_policy_guidelines.md")


# -- Pricing reference --------------------------------------------------------

def fetch_parts_pricing_guide() -> str:
    """MCP tool: load authoritative parts & labour pricing reference."""
    return _read_ref("pricing_references/parts_pricing_guide.md")


# -- Quotation workflow reference ---------------------------------------------

def fetch_quotation_workflow_guide() -> str:
    """MCP tool: load quotation & document submission workflow guide."""
    return _read_ref("pricing_references/quotation_workflow_guide.md")
