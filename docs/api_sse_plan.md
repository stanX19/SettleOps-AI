# API and SSE Plan v5

Project: SettleOps-AI Claims Engine
Date: 2026-04-21
Status: Clean implementation contract
Source reviewed: docs/api_sse_plan_v4.md

This document replaces the long v4 draft as the working API and SSE contract. It keeps the required behavior, removes redundant events and hidden endpoints from the public plan, and separates contract decisions from implementation details.

---

## 1. Goals

The backend must support a claims workflow where:

- A case is created with required claim documents and photos.
- The agent pipeline starts immediately after case creation.
- The frontend receives live progress through one SSE stream per case.
- The officer can approve, decline, or challenge the draft decision through a chatbox.
- Officer challenges trigger a partial re-run, not a full pipeline restart.
- The frontend can recover after an SSE disconnect by fetching a full case snapshot.

Non-goals for this plan:

- Authentication and authorization.
- Persistent database storage.
- Full event replay using `Last-Event-ID`.
- A public manual override API.

---

## 2. Redundancy Review

| Item in v4 | Decision | Reason |
|---|---|---|
| Historical "Changes from v2/v3" sections | Remove from implementation plan | Useful history, but it makes the contract noisy. Keep history in a changelog if needed. |
| Full route implementation code blocks | Replace with concise endpoint contracts | The plan should define behavior, request and response shape, status rules, and emitted events. Full code belongs in source files. |
| `POST /api/v1/cases/{case_id}/override` | Remove from public API | It duplicates the officer chatbox correction flow. If needed for demos, keep it as a local/debug-only route outside the public contract. |
| `officer.message_received` SSE event | Remove | The client already sent the message and receives `POST /message` response with `message_id`. The case snapshot also contains `officer_messages`. |
| `officer.clarification_needed` SSE event | Remove | Clarification is the direct result of `POST /message`, so return the options in that HTTP response. No separate stream event is required. |
| `auditor.challenged` SSE event | Remove | Replace it with `agent.message_to_agent` so all backend agent conversation and handoff logic uses one visual event type. |
| Putting challenge data inside `agent.status_changed` | Do not do this | `agent.status_changed` should stay small and predictable: node, status, timestamp. Challenge and coordination details belong in `agent.message_to_agent` and `agent.output`. |
| `audit_trail_json` artifact type | Keep | PRD requires downloadable machine-readable audit trail for compliance. Treat it as a first-class artifact. |
| `artifact.created` and `workflow.completed.pdf_ready` | Keep both | `artifact.created` gives the exact artifact URL/version when ready. `workflow.completed` closes the workflow state. |
| `GET /cases` and `GET /cases/{case_id}` | Keep both | The list endpoint supports dashboard landing. The detail endpoint supports case view and SSE recovery. |
| `GET /documents/photo/{index}` | Keep as part of document API | Photos are multi-file while other document types are single-file. Keeping a separate photo index route is simple and explicit. |
| Long LangGraph internals in API plan | Shorten | API/SSE consumers need the lifecycle and event contract, not all graph implementation code. |
| Repeated vague-message explanation | Consolidate into `/message` endpoint | One endpoint behavior section is enough. |

---

## 3. Public Endpoint Summary

All endpoints use:

```text
/api/v1/cases
```

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/cases` | Create a case and trigger the initial pipeline. |
| `GET` | `/api/v1/cases` | List cases for the dashboard. |
| `GET` | `/api/v1/cases/{case_id}` | Return the full case snapshot. |
| `GET` | `/api/v1/cases/{case_id}/stream` | Open the SSE stream for live progress. |
| `GET` | `/api/v1/cases/{case_id}/documents/{doc_type}` | Download a single uploaded document. |
| `GET` | `/api/v1/cases/{case_id}/documents/photo/{index}` | Download an uploaded photo by index. |
| `GET` | `/api/v1/cases/{case_id}/artifacts/{artifact_type}` | Download a generated artifact such as the decision PDF or JSON audit trail. |
| `POST` | `/api/v1/cases/{case_id}/approve` | Officer approves the decision. |
| `POST` | `/api/v1/cases/{case_id}/decline` | Officer declines the claim. |
| `POST` | `/api/v1/cases/{case_id}/message` | Officer sends a challenge or clarification message. |

No public `/override` endpoint is required.

---

## 4. Shared API Rules

### 4.1 Case ID Format

Case IDs use:

```text
CLM-YYYY-NNNNN
```

Example:

```text
CLM-2026-00001
```

All routes with `{case_id}` must reject invalid IDs with:

```json
{
  "detail": "Invalid case ID format",
  "code": "INVALID_CASE_ID"
}
```

### 4.2 Error Response

All application errors use:

```json
{
  "detail": "Human-readable error",
  "code": "MACHINE_READABLE_CODE"
}
```

Required error codes:

| Code | Meaning |
|---|---|
| `MISSING_REQUIRED_FILES` | Required upload is missing. |
| `INVALID_FILE_TYPE` | Uploaded file has an unsupported MIME type. |
| `CASE_NOT_FOUND` | Case ID does not exist. |
| `INVALID_CASE_ID` | Case ID format is invalid. |
| `INVALID_STATUS` | Action is not allowed from the current status. |
| `PIPELINE_RUNNING` | Officer action attempted while a run is active. |
| `CHALLENGES_EXHAUSTED` | Officer has used both challenge attempts. |
| `CASE_TERMINAL` | Case is already approved, declined, or failed. |
| `ARTIFACT_NOT_READY` | Requested artifact is not generated yet. |
| `UNKNOWN_CATEGORY` | Category selection is not recognized. |

### 4.3 Workflow Statuses

```text
submitted
running
awaiting_approval
escalated
approved
declined
failed
```

Valid transitions:

| From | To |
|---|---|
| `submitted` | `running`, `failed` |
| `running` | `awaiting_approval`, `escalated`, `failed` |
| `awaiting_approval` | `running`, `approved`, `declined` |
| `escalated` | `running`, `approved`, `declined` |
| `approved` | none |
| `declined` | none |
| `failed` | none |

All status changes must go through a single `transition_status` helper. Do not keep a separate store-level `update_status` bypass.

### 4.4 Fixed String Values

Agent IDs:

```text
intake, policy, liability, fraud, payout, auditor
```

Agent statuses:

```text
idle, working, waiting, completed, error
```

Blackboard sections:

```text
CaseFacts
PolicyVerdict
LiabilityVerdict
FraudAssessment
PayoutRecommendation
AuditResult
```

Artifact types:

```text
decision_pdf
audit_trail_json
```

Officer message types:

```text
freeform
category_selection
```

Auditor challenge triggers:

```text
autonomous
officer_message
```

---

## 5. Case State Contract

The internal `CaseState` may contain filesystem paths, but public API responses must not expose those paths.

Required internal fields:

| Field | Purpose |
|---|---|
| `case_id` | Stable case identifier. |
| `submitted_at` | Case creation timestamp. |
| `status` | Current workflow status. |
| `police_report_path` | Internal path to required police report. |
| `policy_pdf_path` | Internal path to required policy PDF. |
| `repair_quotation_path` | Internal path to required quotation PDF. |
| `photo_paths` | Internal paths to at least one crash photo. |
| `adjuster_report_path` | Optional internal path. |
| `chat_transcript` | Optional uploaded text. |
| `case_facts` | Intake output. |
| `policy_verdict` | Policy output. |
| `liability_verdict` | Liability output. |
| `fraud_assessment` | Fraud output. |
| `payout_recommendation` | Payout output. |
| `audit_result` | Auditor output. |
| `agent_states` | Runtime state per agent. |
| `auditor_loop_count` | Autonomous challenge count for the current run. |
| `officer_challenge_count` | Officer-triggered rerun count for the case. |
| `officer_messages` | Conversation history shown in the UI. |
| `current_agent` | Active agent, or `null`. |
| `awaiting_clarification` | Whether the last message needs category clarification. |
| `artifacts` | Generated artifact metadata. |
| `decision_pdf_path` | Internal path to current decision PDF. |
| `audit_trail_path` | Internal path to generated audit trail JSON. |
| `operator_decision` | Final officer decision, if any. |
| `operator_decision_reason` | Decline reason, if any. |
| `approved_at` | Approval timestamp, if any. |

Public case snapshot fields:

```json
{
  "case_id": "CLM-2026-00001",
  "status": "awaiting_approval",
  "submitted_at": "2026-04-21T10:30:00+08:00",
  "documents": [],
  "agents": {},
  "blackboard": {},
  "artifacts": [
    {
      "artifact_type": "decision_pdf",
      "filename": "claim_decision_CLM-2026-00001.pdf",
      "url": "/api/v1/cases/CLM-2026-00001/artifacts/decision_pdf",
      "ready": true
    },
    {
      "artifact_type": "audit_trail_json",
      "filename": "audit_trail_CLM-2026-00001.json",
      "url": "/api/v1/cases/CLM-2026-00001/artifacts/audit_trail_json",
      "ready": true
    }
  ],
  "officer_messages": [],
  "auditor_loop_count": 0,
  "officer_challenge_count": 0,
  "awaiting_clarification": false,
  "chatbox_enabled": true,
  "current_agent": null
}
```

`chatbox_enabled` is computed as:

```text
status in ["awaiting_approval", "escalated"] and officer_challenge_count < 2
```

---

## 6. Endpoint Details

### 6.1 Create Case

```text
POST /api/v1/cases
```

Request:

```text
multipart/form-data
```

| Field | Type | Required | Limit |
|---|---|---:|---|
| `police_report` | PDF file | yes | 10 MB |
| `policy_pdf` | PDF file | yes | 10 MB |
| `repair_quotation` | PDF file | yes | 10 MB |
| `photos` | JPEG/PNG files | yes, min 1 | 5 MB each |
| `adjuster_report` | PDF file | no | 10 MB |
| `chat_transcript` | text | no | reasonable form limit |

Response `201 Created`:

```json
{
  "case_id": "CLM-2026-00001",
  "status": "submitted"
}
```

Behavior:

1. Validate required uploads and MIME types.
2. Save files under the case directory.
3. Create `CaseState` with status `submitted`.
4. Start `run_pipeline(case_id)` as a background task.

The pipeline then transitions `submitted -> running` and emits `workflow.started`.

### 6.2 List Cases

```text
GET /api/v1/cases
```

Response `200 OK`:

```json
[
  {
    "case_id": "CLM-2026-00001",
    "status": "running",
    "submitted_at": "2026-04-21T10:30:00+08:00",
    "current_agent": "liability"
  }
]
```

Use this for dashboard landing only. Full details come from `GET /cases/{case_id}`.

### 6.3 Get Case Snapshot

```text
GET /api/v1/cases/{case_id}
```

Response `200 OK`: the public case snapshot defined in Section 5.

Use cases:

- Initial case view load.
- Refresh after SSE disconnect.
- Debugging current in-memory state.

### 6.4 Open SSE Stream

```text
GET /api/v1/cases/{case_id}/stream
```

Response:

```text
text/event-stream
```

Required headers:

```text
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
```

The stream sends a keepalive comment every 15 seconds:

```text
: keepalive
```

Disconnect recovery:

1. Client detects stream failure.
2. Client calls `GET /cases/{case_id}`.
3. Client rebuilds UI from the snapshot.
4. Client opens a new SSE stream.

No event replay is required for this version.

### 6.5 Download Uploaded Document

```text
GET /api/v1/cases/{case_id}/documents/{doc_type}
```

Allowed `doc_type` values:

```text
police_report
policy_pdf
repair_quotation
adjuster_report
chat_transcript
```

Response:

- `200 OK` with original content type.
- `404 CASE_NOT_FOUND` if the case does not exist.
- `404` if the requested document was not uploaded.

### 6.6 Download Uploaded Photo

```text
GET /api/v1/cases/{case_id}/documents/photo/{index}
```

`index` is zero-based.

Response:

- `200 OK` with `image/jpeg` or `image/png`.
- `404` if the index is out of range.

### 6.7 Download Generated Artifact

```text
GET /api/v1/cases/{case_id}/artifacts/{artifact_type}
```

Allowed `artifact_type` values:

```text
decision_pdf
audit_trail_json
```

Response:

- `200 OK` with the correct artifact content type.
- `404 ARTIFACT_NOT_READY` if the requested artifact does not yet exist.

### 6.8 Approve Case

```text
POST /api/v1/cases/{case_id}/approve
```

Request body:

```json
{}
```

Valid from:

```text
awaiting_approval
escalated
```

Response `200 OK`:

```json
{
  "status": "approved",
  "pdf_ready": true
}
```

Behavior:

- If the case is escalated and no required approval artifacts exist, generate the decision PDF and audit trail before approval.
- Set `operator_decision = "approved"`.
- Transition to `approved`.
- Save the case.

No SSE event is required for the same browser that made the HTTP request. Other clients can refresh the case snapshot.

### 6.9 Decline Case

```text
POST /api/v1/cases/{case_id}/decline
```

Request:

```json
{
  "reason": "Policy exclusion applies."
}
```

Valid from:

```text
awaiting_approval
escalated
```

Response `200 OK`:

```json
{
  "status": "declined"
}
```

Behavior:

- Require a non-empty reason.
- Set `operator_decision = "declined"`.
- Save `operator_decision_reason`.
- Transition to `declined`.

### 6.10 Officer Message

```text
POST /api/v1/cases/{case_id}/message
```

Request:

```json
{
  "message": "The fault percentage looks wrong.",
  "type": "freeform"
}
```

`type` values:

- `freeform`: Auditor classifier determines the target agent.
- `category_selection`: `message` must be one of the supported categories.

Valid from:

```text
awaiting_approval
escalated
```

Preconditions:

- Reject terminal cases with `CASE_TERMINAL`.
- Reject `running` cases with `PIPELINE_RUNNING`.
- Reject when `officer_challenge_count >= 2` with `CHALLENGES_EXHAUSTED`.

Category mapping:

| Category | Target agent |
|---|---|
| `Fault determination` | `liability` |
| `Policy coverage` | `policy` |
| `Fraud assessment` | `fraud` |
| `Payout amount` | `payout` |

Actionable response `200 OK`:

```json
{
  "message_id": "msg_001",
  "status": "rerun_started",
  "target_agent": "liability",
  "officer_challenge_count": 1
}
```

Clarification response `200 OK`:

```json
{
  "message_id": "msg_001",
  "status": "clarification_needed",
  "clarification": {
    "message": "Could you be more specific about which part of the decision seems wrong?",
    "options": [
      "Fault determination",
      "Policy coverage",
      "Fraud assessment",
      "Payout amount"
    ]
  }
}
```

Behavior:

1. Append the officer message to `officer_messages`.
2. If `type = category_selection`, map the category directly.
3. If `type = freeform`, classify the message with a short Auditor classifier timeout.
4. If no target is found, set `awaiting_clarification = true`, append a system clarification message, and return the clarification response.
5. If a target is found, increment `officer_challenge_count`, reset `auditor_loop_count`, set `awaiting_clarification = false`, supersede the current PDF if any, transition to `running`, and start `run_partial_pipeline`.

No `officer.message_received` SSE event is emitted. The HTTP response is the acknowledgement.

---

## 7. SSE Contract

All events use the standard SSE format:

```text
event: event.name
data: {"case_id":"CLM-2026-00001"}
```

Every event payload must include:

- `case_id`
- `timestamp`

The timestamp format is ISO 8601.

### 7.1 Event Types

```text
workflow.started
agent.status_changed
agent.output
agent.message_to_agent
artifact.created
workflow.completed
```

Removed from v4:

```text
officer.message_received
officer.clarification_needed
auditor.challenged
workflow.failed
```

### 7.2 `workflow.started`

Emitted when a pipeline run starts.

Initial run payload:

```json
{
  "case_id": "CLM-2026-00001",
  "timestamp": "2026-04-21T10:30:00+08:00",
  "trigger": "submit",
  "documents": [
    "police_report.pdf",
    "policy_pdf.pdf",
    "repair_quotation.pdf",
    "photo_0.jpg"
  ]
}
```

Officer rerun payload:

```json
{
  "case_id": "CLM-2026-00001",
  "timestamp": "2026-04-21T10:35:00+08:00",
  "trigger": "officer_rerun",
  "target_agent": "liability",
  "message_id": "msg_001"
}
```

Frontend behavior:

- `submit`: reset the graph to a new run.
- `officer_rerun`: reset only the target agent and downstream agents.

### 7.3 `agent.status_changed`

Emitted when an agent starts, completes, or errors.

```json
{
  "case_id": "CLM-2026-00001",
  "timestamp": "2026-04-21T10:30:05+08:00",
  "agent": "liability",
  "status": "working"
}
```

Allowed `agent` values:

```text
intake, policy, liability, fraud, payout, auditor
```

Allowed emitted `status` values:

```text
working, waiting, completed, error
```

`idle` is a UI initialization state and does not need to be emitted.

### 7.4 `agent.output`

Emitted when an agent finishes structured output for the blackboard.

```json
{
  "case_id": "CLM-2026-00001",
  "timestamp": "2026-04-21T10:30:12+08:00",
  "agent": "payout",
  "section": "PayoutRecommendation",
  "data": {}
}
```

On reruns, the new output replaces the old blackboard section.

### 7.5 `agent.message_to_agent`

Emitted when one agent sends a meaningful handoff, challenge, or coordination message to another agent.

Autonomous challenge payload:

```json
{
  "case_id": "CLM-2026-00001",
  "timestamp": "2026-04-21T10:31:00+08:00",
  "from_agent": "auditor",
  "to_agent": "liability",
  "message_type": "challenge",
  "message": "Re-check the fault split against the uploaded photos.",
  "reason": "Liability verdict cites rear impact, but the uploaded photo shows front-right damage.",
  "loop_count": 1,
  "trigger": "autonomous"
}
```

Officer-triggered challenge payload:

```json
{
  "case_id": "CLM-2026-00001",
  "timestamp": "2026-04-21T10:35:00+08:00",
  "from_agent": "auditor",
  "to_agent": "liability",
  "message_type": "challenge",
  "message": "Officer challenged the fault determination. Re-evaluate liability and downstream payout.",
  "reason": "Officer challenged the fault determination.",
  "loop_count": 0,
  "trigger": "officer_message",
  "message_id": "msg_001"
}
```

Rules:

- Emit this event before the receiving agent reruns or wakes up.
- Use it for Auditor-driven challenges and any other backend agent-to-agent coordination the UI should visualize.
- Do not overload `agent.status_changed` with reasoning or handoff context.

### 7.6 `artifact.created`

Emitted when a new downloadable artifact is ready.

```json
{
  "case_id": "CLM-2026-00001",
  "timestamp": "2026-04-21T10:31:20+08:00",
  "artifact_type": "decision_pdf",
  "filename": "claim_decision_CLM-2026-00001_v1.pdf",
  "url": "/api/v1/cases/CLM-2026-00001/artifacts/decision_pdf",
  "version": 1
}
```

Audit trail example:

```json
{
  "case_id": "CLM-2026-00001",
  "timestamp": "2026-04-21T10:31:21+08:00",
  "artifact_type": "audit_trail_json",
  "filename": "audit_trail_CLM-2026-00001_v1.json",
  "url": "/api/v1/cases/CLM-2026-00001/artifacts/audit_trail_json",
  "version": 1
}
```

If a rerun produces a new artifact version, increment `version` and mark older artifacts as superseded in the case snapshot.

### 7.7 `workflow.completed`

Emitted when a pipeline run finishes.

```json
{
  "case_id": "CLM-2026-00001",
  "timestamp": "2026-04-21T10:31:22+08:00",
  "status": "awaiting_approval",
  "pdf_ready": true,
  "auditor_loop_count": 0,
  "officer_challenge_count": 0,
  "chatbox_enabled": true
}
```

Allowed `status` values:

```text
awaiting_approval
escalated
```

There is no `workflow.failed` SSE event in this lean contract. Failure is still represented in `CaseState.status = "failed"` and is observed through `GET /api/v1/cases/{case_id}` during reconnect or timeout recovery.

---

## 8. Required Event Flows

### 8.1 Happy Path

```text
POST /api/v1/cases -> 201
GET /api/v1/cases/{id}/stream

workflow.started {trigger: "submit"}
agent.status_changed {intake, working}
agent.status_changed {intake, completed}
agent.output {CaseFacts}
agent.status_changed {policy, working}
agent.status_changed {liability, working}
agent.status_changed {fraud, working}
agent.status_changed {policy, completed}
agent.output {PolicyVerdict}
agent.status_changed {liability, completed}
agent.output {LiabilityVerdict}
agent.status_changed {fraud, completed}
agent.output {FraudAssessment}
agent.status_changed {payout, working}
agent.status_changed {payout, completed}
agent.output {PayoutRecommendation}
agent.status_changed {auditor, working}
agent.status_changed {auditor, completed}
agent.output {AuditResult}
artifact.created {decision_pdf}
artifact.created {audit_trail_json}
workflow.completed {status: "awaiting_approval"}
```

### 8.2 Autonomous Auditor Challenge

```text
agent.status_changed {auditor, completed}
agent.output {AuditResult with verdict: "challenge"}
agent.message_to_agent {from: "auditor", to: "liability", message_type: "challenge", trigger: "autonomous", loop_count: 1}
agent.status_changed {liability, working}
agent.status_changed {liability, completed}
agent.output {LiabilityVerdict}
agent.status_changed {payout, working}
agent.status_changed {payout, completed}
agent.output {PayoutRecommendation}
agent.status_changed {auditor, working}
...
```

If the Auditor still challenges after two autonomous loops, finish with:

```text
workflow.completed {status: "escalated", pdf_ready: false}
```

### 8.3 Officer Message Rerun

```text
POST /api/v1/cases/{id}/message -> 200 {status: "rerun_started", target_agent: "liability"}

workflow.started {trigger: "officer_rerun", target_agent: "liability"}
agent.message_to_agent {from: "auditor", to: "liability", message_type: "challenge", trigger: "officer_message", loop_count: 0}
agent.status_changed {liability, working}
agent.status_changed {liability, completed}
agent.output {LiabilityVerdict}
agent.status_changed {payout, working}
agent.status_changed {payout, completed}
agent.output {PayoutRecommendation}
agent.status_changed {auditor, working}
agent.status_changed {auditor, completed}
agent.output {AuditResult}
artifact.created {decision_pdf, version: 2}
artifact.created {audit_trail_json, version: 2}
workflow.completed {status: "awaiting_approval", officer_challenge_count: 1}
```

### 8.4 Vague Officer Message

```text
POST /api/v1/cases/{id}/message -> 200 {status: "clarification_needed", options: [...]}
```

No SSE event is required. The frontend displays the clarification options from the HTTP response.

When the officer selects a category:

```text
POST /api/v1/cases/{id}/message {"message": "Fault determination", "type": "category_selection"}
```

Then the normal officer rerun flow starts.

---

## 9. Pipeline Rules

### 9.1 Initial Pipeline

Initial order:

```text
intake -> parallel(policy, liability, fraud) -> payout -> auditor -> artifact generation or escalation
```

Rules:

- `POST /cases` creates the case and schedules the run.
- `run_pipeline` transitions `submitted -> running`.
- Policy, Liability, and Fraud may run in parallel.
- Payout runs after all required upstream outputs are available.
- Auditor may approve, challenge, or escalate.
- Artifact generation happens only when Auditor approves.
- On approval path, generate both the decision PDF and JSON audit trail.
- Escalated cases may have no decision PDF until officer approval.

### 9.2 Autonomous Auditor Challenge Limit

`auditor_loop_count` applies per pipeline run.

Rules:

- Maximum autonomous challenge loops per run: 2.
- Increment before rerunning the challenged agent.
- Reset to 0 when an officer-triggered rerun starts.
- If Auditor challenges with no challenge item, escalate.

### 9.3 Officer Rerun Limit

`officer_challenge_count` applies per case.

Rules:

- Maximum officer-triggered reruns per case: 2.
- Vague messages that return `clarification_needed` do not increment the count.
- Category selection after clarification increments the count.
- Once count reaches 2, the officer can only approve or decline.

### 9.4 Partial Rerun Chains

Officer or Auditor challenges rerun only the affected path:

| Target agent | Rerun chain |
|---|---|
| `policy` | `policy -> payout -> auditor` |
| `liability` | `liability -> payout -> auditor` |
| `fraud` | `fraud -> payout -> auditor` |
| `payout` | `payout -> auditor` |

The partial rerun must not start again at `intake`.

### 9.5 Agent Function Contract

All agent functions should support optional officer context:

```python
async def agent_fn(state: CaseState, officer_context: str | None = None) -> dict:
    ...
```

Initial pipeline calls agents with `officer_context = None`.

Officer reruns pass the officer message as `officer_context`.

### 9.6 LangGraph State Rule

Inside LangGraph nodes:

- Treat `state` as read-only.
- Return a dict of state updates.
- Emit SSE events as side effects, but do not rely on SSE to mutate state.

In the direct partial rerun runner:

- Direct state mutation is acceptable because it runs outside the compiled LangGraph graph.
- Save state after each completed agent output.

---

## 10. Blackboard Output Contract

The frontend blackboard is updated from `agent.output`.

Required sections:

| Section | Produced by | Required purpose |
|---|---|---|
| `CaseFacts` | `intake` | Extracted incident facts, vehicles, quote amount, evidence summary. |
| `PolicyVerdict` | `policy` | Coverage decision, claim type, max payout, excess, exclusions. |
| `LiabilityVerdict` | `liability` | Fault split, reasoning, citations, vision corroboration. |
| `FraudAssessment` | `fraud` | Suspicion score, detected signals, escalation recommendation. |
| `PayoutRecommendation` | `payout` | Recommended action, payout breakdown, rationale. |
| `AuditResult` | `auditor` | Final audit verdict, challenges, reasoning. |

The detailed Pydantic fields can live in `schemas/case_models.py`. The API/SSE contract only requires stable section names and JSON-serializable data.

---

## 11. Payout Calculation Rule

The final payout amount must be deterministic Python logic, not an LLM calculation.

Required rules:

- If `policy_verdict.is_covered == false`, final payout is 0.
- Use adjuster estimate if available; otherwise use workshop repair quotation.
- Apply liability percentage.
- Deduct policy excess.
- Apply depreciation.
- Cap final payout at `policy_verdict.max_payout_myr`.
- Never return a negative final payout.

The LLM may write rationale text, but it must not invent arithmetic.

---

## 12. Failure Handling

| Failure | Required behavior |
|---|---|
| Pipeline cannot start | Transition to `failed`. Client discovers this via `GET /cases/{case_id}` on recovery or timeout. |
| Agent timeout | Retry once if practical, then transition to `failed`. |
| Agent returns invalid JSON | Retry once with stricter prompt, then fail. |
| Policy or Liability fails | Treat as fatal and transition to `failed`. |
| Fraud fails | Use conservative fraud fallback with escalation recommended. |
| Vision tool fails | Continue with `vision_tool_used = false` and lower confidence. |
| Artifact generation fails | Transition to `failed`. Surface the failure through case snapshot recovery. |
| Officer sends message while running | Return `409 PIPELINE_RUNNING`. |
| Officer challenge count exhausted | Return `409 CHALLENGES_EXHAUSTED`. |
| SSE disconnects | Client fetches snapshot and reconnects. |
| Old artifact after rerun | Mark old artifact superseded; keep file for audit. |
| Invalid status transition | Raise developer error; do not silently mutate status. |

---

## 13. Infrastructure Requirements

Storage:

- Use an in-memory case store for the hackathon.
- Use a thread-safe counter for case ID generation.
- Store uploaded files under a per-case directory.

SSE service:

- Keep subscriber queues by `case_id`.
- Broadcast events to all subscribers for the same case.
- Drop events silently if no subscribers are connected.
- Always unsubscribe queues on client disconnect.

CPU-bound work:

- Run PDF extraction, OCR, image processing, and ReportLab generation in an executor.
- Do not block the event loop.

CORS:

- For hackathon use, allow frontend dev ports or `allow_origins = ["*"]`.
- Restrict origins before production.

---

## 14. Implementation Order

1. Define schemas and fixed string values.
2. Build case store, status transition helper, SSE service, and case ID validation.
3. Implement core endpoints: create, list, detail, stream, documents, artifacts.
4. Implement a stub pipeline that emits the final SSE contract.
5. Build the frontend against the stub SSE stream.
6. Implement approve, decline, and message endpoints.
7. Implement real agents and pipeline runner.
8. Implement partial rerun chains.
9. Implement PDF generation, audit trail generation, and artifact superseding.
10. Add failure handling and demo recovery checks.

---

## 15. Final Public Contract Checklist

Required public APIs:

- `POST /api/v1/cases`
- `GET /api/v1/cases`
- `GET /api/v1/cases/{case_id}`
- `GET /api/v1/cases/{case_id}/stream`
- `GET /api/v1/cases/{case_id}/documents/{doc_type}`
- `GET /api/v1/cases/{case_id}/documents/photo/{index}`
- `GET /api/v1/cases/{case_id}/artifacts/{artifact_type}`
- `POST /api/v1/cases/{case_id}/approve`
- `POST /api/v1/cases/{case_id}/decline`
- `POST /api/v1/cases/{case_id}/message`

Required SSE events:

- `workflow.started`
- `agent.status_changed`
- `agent.output`
- `agent.message_to_agent`
- `artifact.created`
- `workflow.completed`

Explicitly not included:

- Public `/override` endpoint.
- `officer.message_received` SSE event.
- `officer.clarification_needed` SSE event.
- `auditor.challenged` SSE event.
- `workflow.failed` SSE event.
- Event replay with `Last-Event-ID`.
- Authentication.
- Database persistence.
