/**
 * Case (claims workflow) Types, Enums, and SSE Event Payloads.
 * Aligned with backend contract: docs/api_sse_plan.md and case_dto.py
 */

export enum CaseStatus {
  DRAFT = "draft",
  SUBMITTED = "submitted",
  RUNNING = "running",
  AWAITING_APPROVAL = "awaiting_approval",
  ESCALATED = "escalated",
  APPROVED = "approved",
  DECLINED = "declined",
  AWAITING_DOCS = "awaiting_docs",
  FAILED = "failed",
}

export enum AgentId {
  INTAKE = "intake",
  POLICY = "policy",
  LIABILITY = "liability",
  DAMAGE = "damage",
  FRAUD = "fraud",
  PAYOUT = "payout",
  AUDITOR = "auditor",
}

export enum AgentStatus {
  IDLE = "idle",
  WORKING = "working",
  WAITING = "waiting",
  COMPLETED = "completed",
  ERROR = "error",
}

export enum BlackboardSection {
  CASE_FACTS = "CaseFacts",
  POLICY_VERDICT = "PolicyVerdict",
  LIABILITY_VERDICT = "LiabilityVerdict",
  DAMAGE_RESULT = "DamageResult",
  FRAUD_ASSESSMENT = "FraudAssessment",
  PAYOUT_RECOMMENDATION = "PayoutRecommendation",
  AUDIT_RESULT = "AuditResult",
}

export enum ArtifactType {
  DECISION_PDF = "decision_pdf",
  AUDIT_TRAIL_JSON = "audit_trail_json",
}

export enum OfficerMessageType {
  FREEFORM = "freeform",
  CATEGORY_SELECTION = "category_selection",
}

export enum AuditorTrigger {
  AUTONOMOUS = "autonomous",
  OFFICER_MESSAGE = "officer_message",
}

export interface DocumentInfo {
  doc_type: string;
  filename: string;
  url: string;
  text_url?: string;
  index?: number; // populated for photos
  tags?: string[];
}

export interface ArtifactInfo {
  artifact_type: ArtifactType;
  filename: string;
  url: string;
  ready: boolean;
  version: number;
  superseded: boolean;
}

export interface AgentStateInfo {
  status: AgentStatus;
  started_at?: string;
  completed_at?: string;
  sub_tasks?: Record<string, AgentStateInfo>;
  purpose?: string;
  system_prompt?: string;
  logs?: string[];
}

// -- Citation types ----------------------------------------------------------

export type CitationSourceType = "text" | "image" | "agent_output";

export interface Citation {
  filename: string;
  source_type: CitationSourceType;
  /** Verbatim quote for text/agent_output citations; null for images. */
  excerpt: string | null;
  /** What this evidence shows. */
  comment: string;
  /** Which agent decision/output field this evidence supports. */
  conclusion: string;
  /** Identifier of the agent task that produced this citation. */
  node_id: string;
  /** Output field path this citation backs (e.g. "poi_location"). */
  field_path: string;
  char_start?: number;
  char_end?: number;
  page?: number;
}

export interface OfficerMessageInfo {
  message_id: string;
  role: "officer" | "system" | "assistant";
  message: string;
  type?: string;
  target_agent?: AgentId;
  timestamp: string;
}

export interface CaseListItem {
  case_id: string;
  status: CaseStatus;
  submitted_at: string;
  current_agent: AgentId | null;
}

export interface CaseSnapshot {
  case_id: string;
  status: CaseStatus;
  submitted_at: string;
  documents: DocumentInfo[];
  agents: Record<string, AgentStateInfo>;
  blackboard: Record<string, any>;
  /** Citations keyed by BlackboardSection.value (e.g. "PolicyVerdict"). */
  citations: Partial<Record<BlackboardSection, Citation[]>>;
  artifacts: ArtifactInfo[];
  officer_messages: OfficerMessageInfo[];
  auditor_loop_count: number;
  officer_challenge_count: number;
  awaiting_clarification: boolean;
  chatbox_enabled: boolean;
  current_agent: AgentId | null;
  topology?: Record<string, string[]>;
}

// -- SSE Event Payloads -------------------------------------------------------

export type CaseSseEventName = 
  | "workflow.started"
  | "agent.status_changed"
  | "agent.output"
  | "agent.message_to_agent"
  | "artifact.created"
  | "workflow.completed";

export interface SseBasePayload {
  case_id: string;
  timestamp: string;
}

export interface SseWorkflowStarted extends SseBasePayload {
  trigger: "submit" | "officer_rerun";
  documents?: string[];
  target_agent?: AgentId;
  message_id?: string;
}

export interface SseAgentStatusChanged extends SseBasePayload {
  agent: AgentId;
  status: AgentStatus;
  sub_task?: string;
  parent_agent?: AgentId;
}

export interface SseAgentOutput extends SseBasePayload {
  agent: AgentId;
  section: BlackboardSection;
  data: any;
  logs?: string[];
  /** Top-level citations array — read from event.citations, not event.data.citations. */
  citations?: Citation[];
}

export interface SseAgentMessageToAgent extends SseBasePayload {
  from_agent: AgentId;
  to_agent: AgentId;
  message_type: "challenge" | "handoff";
  message: string;
  reason: string;
  loop_count: number;
  trigger: AuditorTrigger;
  message_id?: string;
}

export interface SseArtifactCreated extends SseBasePayload {
  artifact_type: ArtifactType;
  filename: string;
  url: string;
  version: number;
}

export interface SseWorkflowCompleted extends SseBasePayload {
  status: CaseStatus;
  pdf_ready: boolean;
  auditor_loop_count: number;
  officer_challenge_count: number;
  chatbox_enabled: boolean;
  topology?: Record<string, string[]>;
}
