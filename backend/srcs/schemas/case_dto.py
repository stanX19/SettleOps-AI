"""Case (claims workflow) DTOs, enums, and SSE event payloads.

Contract source: docs/api_sse_plan.md.
"""
from __future__ import annotations

from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


# -- Fixed string values ------------------------------------------------------

class CaseStatus(str, Enum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    RUNNING = "running"
    AWAITING_APPROVAL = "awaiting_approval"
    ESCALATED = "escalated"
    APPROVED = "approved"
    DECLINED = "declined"
    FAILED = "failed"


class AgentId(str, Enum):
    INTAKE = "intake"
    POLICY = "policy"
    LIABILITY = "liability"
    DAMAGE = "damage"
    FRAUD = "fraud"
    PAYOUT = "payout"
    AUDITOR = "auditor"


class AgentStatus(str, Enum):
    IDLE = "idle"
    WORKING = "working"
    WAITING = "waiting"
    COMPLETED = "completed"
    ERROR = "error"


class BlackboardSection(str, Enum):
    CASE_FACTS = "CaseFacts"
    POLICY_VERDICT = "PolicyVerdict"
    LIABILITY_VERDICT = "LiabilityVerdict"
    DAMAGE_RESULT = "DamageResult"
    FRAUD_ASSESSMENT = "FraudAssessment"
    PAYOUT_RECOMMENDATION = "PayoutRecommendation"
    AUDIT_RESULT = "AuditResult"


class ArtifactType(str, Enum):
    DECISION_PDF = "decision_pdf"
    AUDIT_TRAIL_JSON = "audit_trail_json"


class OfficerMessageType(str, Enum):
    FREEFORM = "freeform"
    CATEGORY_SELECTION = "category_selection"


class AuditorTrigger(str, Enum):
    AUTONOMOUS = "autonomous"
    OFFICER_MESSAGE = "officer_message"


# -- Error codes --------------------------------------------------------------

class ErrorCode(str, Enum):
    MISSING_REQUIRED_FILES = "MISSING_REQUIRED_FILES"
    INVALID_FILE_TYPE = "INVALID_FILE_TYPE"
    FILE_TOO_LARGE = "FILE_TOO_LARGE"
    CASE_NOT_FOUND = "CASE_NOT_FOUND"
    INVALID_CASE_ID = "INVALID_CASE_ID"
    INVALID_DOC_TYPE = "INVALID_DOC_TYPE"
    DOCUMENT_NOT_FOUND = "DOCUMENT_NOT_FOUND"
    INVALID_STATUS = "INVALID_STATUS"
    PIPELINE_RUNNING = "PIPELINE_RUNNING"
    CHALLENGES_EXHAUSTED = "CHALLENGES_EXHAUSTED"
    CASE_TERMINAL = "CASE_TERMINAL"
    ARTIFACT_NOT_READY = "ARTIFACT_NOT_READY"
    UNKNOWN_CATEGORY = "UNKNOWN_CATEGORY"


# -- Document / artifact info (public) ----------------------------------------

class DocumentInfo(BaseModel):
    doc_type: str
    filename: str
    url: str
    index: Optional[int] = None  # populated for photos


class ArtifactInfo(BaseModel):
    artifact_type: ArtifactType
    filename: str
    url: str
    ready: bool
    version: int = 1
    superseded: bool = False


class AgentStateInfo(BaseModel):
    status: AgentStatus = AgentStatus.IDLE
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class OfficerMessageInfo(BaseModel):
    message_id: str
    role: Literal["officer", "system"]
    message: str
    type: Optional[str] = None
    target_agent: Optional[AgentId] = None
    timestamp: str


# -- Public request / response models ----------------------------------------

class CaseCreateResponse(BaseModel):
    case_id: str
    status: CaseStatus


class CaseListItem(BaseModel):
    case_id: str
    status: CaseStatus
    submitted_at: str
    current_agent: Optional[AgentId] = None


class CaseSnapshot(BaseModel):
    case_id: str
    status: CaseStatus
    submitted_at: str
    documents: list[DocumentInfo] = Field(default_factory=list)
    agents: dict[str, AgentStateInfo] = Field(default_factory=dict)
    blackboard: dict[str, Any] = Field(default_factory=dict)
    artifacts: list[ArtifactInfo] = Field(default_factory=list)
    officer_messages: list[OfficerMessageInfo] = Field(default_factory=list)
    auditor_loop_count: int = 0
    officer_challenge_count: int = 0
    awaiting_clarification: bool = False
    chatbox_enabled: bool = False
    current_agent: Optional[AgentId] = None


class ApproveResponse(BaseModel):
    status: CaseStatus
    pdf_ready: bool


class DeclineRequest(BaseModel):
    reason: str = Field(min_length=1)


class DeclineResponse(BaseModel):
    status: CaseStatus


class MessageRequest(BaseModel):
    message: str = Field(min_length=1)
    type: OfficerMessageType = OfficerMessageType.FREEFORM


class MessageRerunResponse(BaseModel):
    message_id: str
    status: Literal["rerun_started"] = "rerun_started"
    target_agent: AgentId
    officer_challenge_count: int


class ClarificationPayload(BaseModel):
    message: str
    options: list[str]


class MessageClarificationResponse(BaseModel):
    message_id: str
    status: Literal["clarification_needed"] = "clarification_needed"
    clarification: ClarificationPayload


# -- SSE event payloads -------------------------------------------------------

class CaseSseEvent(str, Enum):
    """Case SSE event names (dot-notation per v5 contract)."""
    WORKFLOW_STARTED = "workflow.started"
    AGENT_STATUS_CHANGED = "agent.status_changed"
    AGENT_OUTPUT = "agent.output"
    AGENT_MESSAGE_TO_AGENT = "agent.message_to_agent"
    ARTIFACT_CREATED = "artifact.created"
    WORKFLOW_COMPLETED = "workflow.completed"


class _CaseSseBase(BaseModel):
    case_id: str
    timestamp: str


class SseWorkflowStartedData(_CaseSseBase):
    trigger: Literal["submit", "officer_rerun"]
    documents: Optional[list[str]] = None
    target_agent: Optional[AgentId] = None
    message_id: Optional[str] = None


class SseAgentStatusChangedData(_CaseSseBase):
    agent: AgentId
    status: AgentStatus  # emitted values: working, waiting, completed, error


class SseAgentOutputData(_CaseSseBase):
    agent: AgentId
    section: BlackboardSection
    data: dict[str, Any]


class SseAgentMessageToAgentData(_CaseSseBase):
    from_agent: AgentId
    to_agent: AgentId
    message_type: Literal["challenge", "handoff"]
    message: str
    reason: str
    loop_count: int
    trigger: AuditorTrigger
    message_id: Optional[str] = None


class SseArtifactCreatedData(_CaseSseBase):
    artifact_type: ArtifactType
    filename: str
    url: str
    version: int


class SseWorkflowCompletedData(_CaseSseBase):
    status: Literal[CaseStatus.AWAITING_APPROVAL, CaseStatus.ESCALATED]
    pdf_ready: bool
    auditor_loop_count: int
    officer_challenge_count: int
    chatbox_enabled: bool
