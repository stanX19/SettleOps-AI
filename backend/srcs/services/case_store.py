"""In-memory case store + status transition helper.

v5 plan explicitly defers database persistence, so `CaseState` lives in a
process-local dict guarded by an asyncio lock.
"""
from __future__ import annotations

import asyncio
import re
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from srcs.schemas.case_dto import (
    AgentId,
    AgentStatus,
    ArtifactType,
    BlackboardSection,
    CaseStatus,
    ErrorCode,
)


CASE_ID_REGEX = re.compile(r"^CLM-\d{4}-\d{5}$")


def is_valid_case_id(case_id: str) -> bool:
    return bool(CASE_ID_REGEX.match(case_id))


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


# -- Status transitions -------------------------------------------------------

_VALID_TRANSITIONS: dict[CaseStatus, set[CaseStatus]] = {
    CaseStatus.SUBMITTED: {CaseStatus.RUNNING, CaseStatus.FAILED},
    CaseStatus.RUNNING: {
        CaseStatus.AWAITING_APPROVAL,
        CaseStatus.ESCALATED,
        CaseStatus.FAILED,
    },
    CaseStatus.AWAITING_APPROVAL: {
        CaseStatus.RUNNING,
        CaseStatus.APPROVED,
        CaseStatus.DECLINED,
    },
    CaseStatus.ESCALATED: {
        CaseStatus.RUNNING,
        CaseStatus.APPROVED,
        CaseStatus.DECLINED,
    },
    CaseStatus.APPROVED: set(),
    CaseStatus.DECLINED: set(),
    CaseStatus.FAILED: set(),
}

_TERMINAL: set[CaseStatus] = {
    CaseStatus.APPROVED,
    CaseStatus.DECLINED,
    CaseStatus.FAILED,
}


class InvalidStatusTransition(Exception):
    """Raised when a status transition is not allowed."""


def transition_status(state: "CaseState", target: CaseStatus) -> None:
    """Single entry point for all status changes.

    Raises `InvalidStatusTransition` if the move is not allowed.
    """
    if target not in _VALID_TRANSITIONS.get(state.status, set()):
        raise InvalidStatusTransition(
            f"Cannot transition {state.status.value} -> {target.value}"
        )
    state.status = target


def is_terminal(status: CaseStatus) -> bool:
    return status in _TERMINAL


# -- Case state ---------------------------------------------------------------

@dataclass
class ArtifactRecord:
    artifact_type: ArtifactType
    filename: str
    version: int
    path: str
    superseded: bool = False


@dataclass
class OfficerMessageRecord:
    message_id: str
    role: str  # "officer" | "system"
    message: str
    type: Optional[str] = None
    target_agent: Optional[AgentId] = None
    timestamp: str = field(default_factory=now_iso)


@dataclass
class AgentRuntimeState:
    status: AgentStatus = AgentStatus.IDLE
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


@dataclass
class CaseState:
    case_id: str
    submitted_at: str
    status: CaseStatus = CaseStatus.SUBMITTED

    # Uploaded documents (internal paths)
    police_report_path: Optional[str] = None
    policy_pdf_path: Optional[str] = None
    repair_quotation_path: Optional[str] = None
    adjuster_report_path: Optional[str] = None
    photo_paths: list[str] = field(default_factory=list)
    chat_transcript: Optional[str] = None  # may be text or path

    # Agent outputs (blackboard sections)
    case_facts: Optional[dict[str, Any]] = None
    policy_verdict: Optional[dict[str, Any]] = None
    liability_verdict: Optional[dict[str, Any]] = None
    fraud_assessment: Optional[dict[str, Any]] = None
    payout_recommendation: Optional[dict[str, Any]] = None
    audit_result: Optional[dict[str, Any]] = None

    # Runtime state
    agent_states: dict[AgentId, AgentRuntimeState] = field(
        default_factory=lambda: {a: AgentRuntimeState() for a in AgentId}
    )
    auditor_loop_count: int = 0
    officer_challenge_count: int = 0
    officer_messages: list[OfficerMessageRecord] = field(default_factory=list)
    current_agent: Optional[AgentId] = None
    awaiting_clarification: bool = False

    # Artifacts
    artifacts: list[ArtifactRecord] = field(default_factory=list)
    decision_pdf_path: Optional[str] = None
    audit_trail_path: Optional[str] = None

    # Final officer action
    operator_decision: Optional[str] = None  # "approved" | "declined"
    operator_decision_reason: Optional[str] = None
    approved_at: Optional[str] = None

    def chatbox_enabled(self) -> bool:
        return (
            self.status in (CaseStatus.AWAITING_APPROVAL, CaseStatus.ESCALATED)
            and self.officer_challenge_count < 2
        )

    def section_data(self, section: BlackboardSection) -> Optional[dict[str, Any]]:
        return {
            BlackboardSection.CASE_FACTS: self.case_facts,
            BlackboardSection.POLICY_VERDICT: self.policy_verdict,
            BlackboardSection.LIABILITY_VERDICT: self.liability_verdict,
            BlackboardSection.FRAUD_ASSESSMENT: self.fraud_assessment,
            BlackboardSection.PAYOUT_RECOMMENDATION: self.payout_recommendation,
            BlackboardSection.AUDIT_RESULT: self.audit_result,
        }.get(section)

    def set_section_data(
        self, section: BlackboardSection, data: dict[str, Any]
    ) -> None:
        if section is BlackboardSection.CASE_FACTS:
            self.case_facts = data
        elif section is BlackboardSection.POLICY_VERDICT:
            self.policy_verdict = data
        elif section is BlackboardSection.LIABILITY_VERDICT:
            self.liability_verdict = data
        elif section is BlackboardSection.FRAUD_ASSESSMENT:
            self.fraud_assessment = data
        elif section is BlackboardSection.PAYOUT_RECOMMENDATION:
            self.payout_recommendation = data
        elif section is BlackboardSection.AUDIT_RESULT:
            self.audit_result = data


# -- Store --------------------------------------------------------------------

class CaseStore:
    """Process-local in-memory case store.

    Thread-safe for case ID generation; async-safe for mutations via a single
    lock. All mutating operations should acquire `lock()` via async context.
    """

    _cases: dict[str, CaseState] = {}
    _counter: int = 0
    _counter_lock = threading.Lock()
    _async_lock = asyncio.Lock()

    @classmethod
    def lock(cls) -> asyncio.Lock:
        return cls._async_lock

    @classmethod
    def new_case_id(cls) -> str:
        with cls._counter_lock:
            cls._counter += 1
            n = cls._counter
        year = datetime.now(timezone.utc).year
        return f"CLM-{year:04d}-{n:05d}"

    @classmethod
    def add(cls, state: CaseState) -> None:
        cls._cases[state.case_id] = state

    @classmethod
    def get(cls, case_id: str) -> Optional[CaseState]:
        return cls._cases.get(case_id)

    @classmethod
    def all(cls) -> list[CaseState]:
        return list(cls._cases.values())

    # Test / dev only — never expose via API
    @classmethod
    def _reset(cls) -> None:
        cls._cases.clear()
        cls._counter = 0
