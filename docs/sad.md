# System Analysis Document (SAD)

**Project:** Claims Engine — Agentic Insurance Claim Processing for Fleet Operations
**Companion document:** Product Requirements Document (PRD)
**Document purpose:** Technical specification for implementation. Backend and AI engineers should treat this document as the source of truth for interfaces, contracts, and system behavior. If the PRD and this document disagree, this document wins for implementation concerns and the PRD wins for product concerns.

---

## 1. System overview

### 1.1 System purpose

Claims Engine is a stateful, multi-agent workflow system that processes Malaysian motor insurance claims. Given a filed accident report, the driver's insurance policy, crash photos, and optional WhatsApp chat transcript, it produces a signed Claim Decision PDF and JSON audit trail.

### 1.2 High-level architecture

The system is a single-process monolith for the hackathon build. It consists of:

1. A **Next.js web frontend** serving two routes: `/file-claim` (mobile-responsive claimant view) and `/dashboard` (operator 3-pane view)
2. A **FastAPI Python backend** exposing HTTP endpoints and a Server-Sent Events (SSE) stream
3. A **LangGraph-orchestrated agent runtime** executing the 6-agent DAG
4. An **in-memory case store** keyed by case ID
5. An external **GLM API** for all LLM and vision inference
6. A **PDF renderer** producing the final Claim Decision document

All components run in one Docker container during the hackathon. No external databases, no message queues, no distributed services.

### 1.3 Why this architecture and not alternatives

**Why LangGraph, not raw Python orchestration?** LangGraph gives us free state management, built-in conditional routing, and visual graph export. Hand-rolling a state machine wastes 1–2 engineering days.

**Why LangGraph, not CrewAI or AutoGen?** CrewAI and AutoGen emphasize conversational agent-to-agent messaging, which is what we *don't* want — it creates hallucination cascades. LangGraph's DAG-with-conditional-edges model matches our deterministic-bridges-between-probabilistic-agents design.

**Why synchronous execution, not async message bus?** A real pub/sub architecture with Redis or an actor model adds 2+ days of infrastructure work, introduces race conditions, and makes debugging brutal on day 5. The insurance claim workflow has inherent dependencies (Policy can't run until Intake finishes) that are sequential by nature. We can still run Policy/Liability/Fraud in parallel using `asyncio.gather` inside a single LangGraph node, which gives us visible concurrency on the UI without distributed-system complexity.

**Why in-memory state, not Postgres?** 7-day hackathon. One case at a time during the demo. Swap for Postgres post-hackathon in 2 hours.

**Why SSE, not WebSockets?** SSE is simpler, unidirectional (server → client), auto-reconnects, and easier to debug. We only need server-to-client streaming for the dashboard to show live agent progress.

---

## 2. Technology stack

### 2.1 Confirmed stack

| Layer | Technology | Version | Rationale |
|---|---|---|---|
| Frontend framework | Next.js | 14+ | SSR, file-based routing, built-in dev tooling |
| UI styling | Tailwind CSS | 3+ | Rapid styling, matches typical hackathon velocity |
| Workflow graph visualization | React Flow | 11+ | Purpose-built for node-graph UIs, saves 2+ days vs hand-rolled |
| State management | React built-ins + SSE | — | No Redux needed for 1 case at a time |
| Backend framework | FastAPI | 0.110+ | Async-first, auto OpenAPI docs, SSE support |
| Agent orchestration | LangGraph | 0.2+ | State management, conditional edges, max-iteration guards |
| Data validation | Pydantic | v2 | Strict JSON contracts between agents |
| LLM provider | GLM (Zhipu AI) | GLM-4.6 or whichever hackathon provides | Hackathon requirement |
| Vision model | GLM-4V or equivalent | — | Called by Liability agent as a tool |
| PDF extraction | pdfplumber, pypdf | latest | Text extraction with table support; fallback on pypdf |
| OCR fallback | pytesseract | latest | Only if PDF is scanned and pdfplumber returns empty |
| PDF generation | ReportLab or WeasyPrint | — | ReportLab for programmatic; WeasyPrint if HTML-to-PDF is faster |
| Containerization | Docker | — | Single Dockerfile for demo portability |

### 2.2 Python dependencies (pinned)

```
fastapi>=0.110
uvicorn[standard]>=0.27
langgraph>=0.2
pydantic>=2.5
httpx>=0.27
python-multipart>=0.0.9
pdfplumber>=0.10
pypdf>=4.0
pytesseract>=0.3
Pillow>=10.0
reportlab>=4.0
sse-starlette>=2.0
```

### 2.3 Frontend dependencies

```
next@^14
react@^18
reactflow@^11
tailwindcss@^3
zustand@^4 (lightweight state management for dashboard)
```

### 2.4 What we explicitly do not use

- No Redis, no RabbitMQ, no Kafka
- No PostgreSQL, no SQLite for the hackathon build
- No WebSockets (SSE instead)
- No authentication libraries (NextAuth, Clerk, etc.)
- No Expo, no React Native
- No LangChain beyond what LangGraph pulls in transitively
- No CrewAI, no AutoGen

---

## 3. System components

### 3.1 Component map

```
┌─────────────────────────────────────────────────────────────────┐
│                      Browser (Next.js)                          │
│  ┌──────────────────────┐       ┌─────────────────────────┐     │
│  │   /file-claim        │       │   /dashboard            │     │
│  │   (claimant mobile)  │       │   (operator 3-pane)     │     │
│  └─────────┬────────────┘       └──────────┬──────────────┘     │
└────────────┼──────────────────────────────┼────────────────────┘
             │ HTTP multipart upload        │ SSE stream
             ▼                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                   FastAPI Backend (Python)                      │
│  ┌───────────────────┐   ┌─────────────────────────────────┐    │
│  │  HTTP Endpoints   │   │  SSE Streamer                   │    │
│  │  /submit-claim    │   │  /case/{id}/stream              │    │
│  │  /case/{id}       │   │                                 │    │
│  │  /case/{id}/pdf   │   │                                 │    │
│  └─────────┬─────────┘   └────────┬────────────────────────┘    │
│            │                      │                             │
│  ┌─────────▼──────────────────────▼──────────────────────────┐  │
│  │            In-Memory Case Store                          │  │
│  │  Dict[case_id, CaseState]                                │  │
│  └─────────┬──────────────────────────────────────────────────┘  │
│            │                                                    │
│  ┌─────────▼────────────────────────────────────────────────┐   │
│  │              LangGraph Agent Runtime                     │   │
│  │   Intake → [Policy ∥ Liability ∥ Fraud] → Payout →       │   │
│  │   Auditor → (loop back if challenged) → Generate PDF     │   │
│  └─────────┬────────────────────────────────────────────────┘   │
│            │                                                    │
│  ┌─────────▼─────────┐    ┌─────────────────┐                   │
│  │  GLM API Client   │    │  PDF Renderer   │                   │
│  │  (text + vision)  │    │  (ReportLab)    │                   │
│  └───────────────────┘    └─────────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Component responsibilities

**Frontend — claimant view (`/file-claim`)**
- Renders at both phone and desktop widths
- Accepts multipart file uploads (police report PDF, policy PDF, photos)
- Accepts pasted chat transcript as text
- POSTs to `/submit-claim`, receives case ID, displays submission confirmation
- Does not render agent progress — that's the dashboard's job

**Frontend — operator dashboard (`/dashboard`)**
- Renders at desktop widths only (1280px+)
- Opens SSE connection to `/case/{id}/stream` once a case is active
- Left pane: displays raw inputs, chat transcript, photo thumbnails
- Middle pane: React Flow graph with 6 nodes and edges, nodes animate based on SSE events
- Right pane: live JSON view of Blackboard state, updates on each SSE event
- Bottom action bar: "Approve" and "Override" buttons, PDF preview, download link

**Backend — HTTP endpoints**
- `POST /submit-claim`: accepts multipart upload, persists files to `/tmp/cases/{case_id}/`, creates a new CaseState, triggers the LangGraph run asynchronously, returns the case ID
- `GET /case/{id}`: returns the current CaseState as JSON (for debugging and fallback)
- `GET /case/{id}/pdf`: returns the generated Claim Decision PDF if ready
- `POST /case/{id}/approve`: marks case as approved, finalizes PDF
- `POST /case/{id}/override`: records operator override with rationale

**Backend — SSE streamer**
- `GET /case/{id}/stream`: opens a server-sent-events connection
- Emits events whenever CaseState changes: agent started, agent completed, blackboard updated, workflow finished, workflow failed
- Each event contains the event type, the affected agent or field, and a timestamp

**Backend — in-memory case store**
- Python dict: `{case_id: CaseState}`
- Each CaseState contains: inputs, current step, each agent's output, the Blackboard, loop count, final decision
- Written to by the LangGraph runtime, read by HTTP endpoints and SSE streamer

**Backend — LangGraph runtime**
- The 6-agent DAG, defined declaratively
- Uses a shared Pydantic `CaseState` model as its state type
- Executes agents when their preconditions are met
- Emits state-change callbacks that feed the SSE streamer

**Backend — GLM API client**
- Thin wrapper around GLM's HTTP API
- Handles authentication, retries (1 retry with 2s backoff), 15-second timeout
- Supports both text-only calls and vision calls (image + text)
- Logs every request and response for debugging

**Backend — PDF renderer**
- Takes a completed CaseState, produces a PDF
- Uses ReportLab for programmatic layout
- Output saved to `/tmp/cases/{case_id}/decision.pdf`

---

## 4. Data contracts (Pydantic models)

This section is the single most important technical reference in this document. Every agent reads and writes these contracts. If these change, the system breaks.

### 4.1 The shared CaseState

This is LangGraph's state type. It flows through every node.

```python
from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime

class CaseState(BaseModel):
    case_id: str
    submitted_at: datetime
    
    # Raw inputs
    police_report_path: str
    policy_pdf_path: str
    photo_paths: list[str]
    chat_transcript: Optional[str] = None
    
    # Agent outputs (populated as agents complete)
    case_facts: Optional[CaseFacts] = None
    policy_verdict: Optional[PolicyVerdict] = None
    liability_verdict: Optional[LiabilityVerdict] = None
    fraud_assessment: Optional[FraudAssessment] = None
    payout_recommendation: Optional[PayoutRecommendation] = None
    audit_result: Optional[AuditResult] = None
    
    # Workflow control
    auditor_loop_count: int = 0
    current_step: str = "pending"
    status: Literal["running", "awaiting_approval", "approved", "escalated", "failed"] = "running"
    
    # Output
    decision_pdf_path: Optional[str] = None
    operator_decision: Optional[str] = None  # "approved" or "overridden"
    operator_rationale: Optional[str] = None
```

### 4.2 CaseFacts — Intake agent output

```python
class Vehicle(BaseModel):
    role: Literal["claimant", "third_party"]
    plate: str
    driver_id_masked: str  # e.g., "A**********"
    damage_location: list[str]  # e.g., ["front_right_bumper"]

class Incident(BaseModel):
    datetime: datetime
    location_address: str
    coordinates: Optional[tuple[float, float]] = None
    weather: str
    road_condition: str

class CaseFacts(BaseModel):
    incident: Incident
    vehicles: list[Vehicle]
    narrative: str  # ≤500 words, objective
    police_verdict_summary: str  # What the police determined
    chat_summary: Optional[str] = None
    photo_count: int
    extraction_confidence: float = Field(ge=0, le=1)
```

### 4.3 PolicyVerdict — Policy agent output

```python
class PolicyExclusion(BaseModel):
    clause_ref: str
    description: str
    applies_to_this_case: bool

class PolicyVerdict(BaseModel):
    is_covered: bool
    covering_clause_ref: str  # e.g., "Clause 4.2(a)"
    covering_clause_text: str  # verbatim from policy
    max_payout_myr: float
    excess_myr: float
    ncd_percentage: float  # No Claim Discount percentage
    depreciation_schedule: dict[str, float]  # e.g., {"vehicle_age_years_1_3": 0.10}
    exclusions: list[PolicyExclusion]
    confidence: float = Field(ge=0, le=1)
```

### 4.4 LiabilityVerdict — Liability agent output

```python
class EvidenceCitation(BaseModel):
    source: Literal["police_report", "chat_transcript", "photo", "narrative"]
    reference: str  # page number, photo index, line number
    supports: str  # what this evidence supports

class LiabilityVerdict(BaseModel):
    claimant_fault_percentage: float = Field(ge=0, le=100)
    third_party_fault_percentage: float = Field(ge=0, le=100)
    reasoning: str  # ≤300 words
    evidence_citations: list[EvidenceCitation]
    vision_tool_used: bool
    vision_corroborates_narrative: Optional[bool] = None
    confidence: float = Field(ge=0, le=1)
    
    def is_valid(self) -> bool:
        return abs(self.claimant_fault_percentage + self.third_party_fault_percentage - 100) < 0.01
```

### 4.5 FraudAssessment — Fraud agent output

```python
class FraudSignal(BaseModel):
    signal_name: str  # e.g., "policy_age_under_30_days"
    description: str
    severity: Literal["low", "medium", "high"]

class FraudAssessment(BaseModel):
    suspicion_score: float = Field(ge=0, le=1)
    signals_detected: list[FraudSignal]
    recommend_escalation: bool
    reasoning: str
```

### 4.6 PayoutRecommendation — Payout agent output

```python
class PayoutBreakdown(BaseModel):
    repair_estimate_myr: float
    liability_adjusted_myr: float  # after applying fault percentage
    excess_deducted_myr: float
    ncd_adjusted_myr: float
    depreciation_deducted_myr: float
    final_payout_myr: float

class PayoutRecommendation(BaseModel):
    recommended_action: Literal["approve", "partial_approve", "decline", "escalate"]
    payout_breakdown: PayoutBreakdown
    rationale: str
    confidence: float = Field(ge=0, le=1)
```

### 4.7 AuditResult — Auditor agent output

```python
class AuditorChallenge(BaseModel):
    challenged_agent: Literal["policy", "liability", "fraud", "payout"]
    issue: str  # description of the flaw
    suggested_fix: str  # prompt-engineering hint for re-run

class AuditResult(BaseModel):
    verdict: Literal["approve", "challenge", "escalate"]
    challenges: list[AuditorChallenge]  # empty if approved
    reasoning: str
```

### 4.8 Contract enforcement

Every agent's output is parsed through its Pydantic model at the boundary. If parsing fails:

1. Log the raw output and the parse error
2. Retry once with a stricter prompt (system message: "Your previous output failed schema validation with error {err}. Output valid JSON matching {schema}.")
3. If retry also fails, emit a `workflow_failed` SSE event, set CaseState.status to "failed", and escalate

This is the "deterministic failure" guarantee. A malformed output never propagates.

---

## 5. Agent specifications

Each agent gets its own subsection with: system prompt skeleton, inputs, output contract, tools used, retry policy, and failure modes.

### 5.1 Intake agent

**Purpose:** Parse all raw inputs into a structured CaseFacts object.

**Inputs:** `police_report_path`, `policy_pdf_path` (for cross-reference only, not deep parse), `photo_paths`, `chat_transcript`

**Output contract:** `CaseFacts`

**Tools used:**
- `pdfplumber` to extract text from police report PDF
- `pypdf` fallback if pdfplumber returns empty
- `pytesseract` OCR fallback if both PDF libraries return empty (report is scanned)
- GLM (text-only) to synthesize extracted text + chat into CaseFacts

**System prompt skeleton:**

```
You are the Intake Agent for an insurance claims workflow. Your job is to extract structured facts from raw accident inputs.

You receive:
- Text extracted from a Malaysian police report
- An optional WhatsApp chat transcript between drivers
- A list of photo filenames (metadata only, you will not see the photos)

You produce a single JSON object matching the CaseFacts schema.

Rules:
- Report the narrative objectively. Do not include opinions or judgments.
- Malay text in the report should be understood and rendered in English in the narrative field.
- If a field cannot be determined from the inputs, set it to null or an empty list. Do not hallucinate values.
- Driver IDs (IC numbers) must be masked: show the first character followed by asterisks. Never output a full IC.
- Coordinates should only be included if the report explicitly states them.

Output only the JSON object, no prose.
```

**Retry policy:** 1 retry with stricter schema hint.

**Failure modes:**
- PDF text extraction returns empty on all 3 methods → fail workflow, escalate
- GLM returns malformed JSON → retry once, then fail
- Narrative exceeds 500 words → truncate, warn in logs

### 5.2 Policy agent

**Purpose:** Read the policy PDF, determine coverage for this incident, extract financial parameters.

**Inputs:** `policy_pdf_path`, `case_facts`

**Output contract:** `PolicyVerdict`

**Tools used:**
- `pdfplumber` to extract policy text
- GLM (text-only) with the extracted policy and case facts in context

**System prompt skeleton:**

```
You are the Policy Agent. You read Malaysian motor insurance policies and determine whether a specific incident is covered.

You receive:
- The full text of a motor insurance policy
- A CaseFacts object describing the incident

You produce a PolicyVerdict JSON object.

Rules:
- Cite the exact clause number and verbatim clause text when declaring coverage.
- If coverage is ambiguous, set is_covered to false and explain which clause creates the ambiguity.
- Do not invent clauses. If you cannot find a covering clause, is_covered is false.
- Depreciation schedules in Malaysian motor policies typically follow age brackets. Extract them faithfully.
- Confidence below 0.7 means the Auditor will likely challenge — be honest about uncertainty.

Output only the JSON object.
```

**Retry policy:** 1 retry.

**Failure modes:**
- Policy PDF is malformed or empty → fail workflow, escalate
- LLM hallucinates a clause number not in the document → Auditor catches it on review

### 5.3 Liability agent

**Purpose:** Determine fault percentage between claimant and third party.

**Inputs:** `case_facts`, `photo_paths`

**Output contract:** `LiabilityVerdict`

**Tools used:**
- GLM vision model (called as a tool) on crash photos
- GLM text model for narrative reasoning

**Tool call contract for vision:**

```python
async def vision_tool(photo_path: str, question: str) -> dict:
    """
    Calls GLM-4V with the photo and a specific question.
    Returns: {"answer": str, "confidence": float}
    """
```

The Liability agent typically asks: "Looking at the damage location on this vehicle, which direction did the impact come from?" and compares the answer against the police narrative.

**System prompt skeleton:**

```
You are the Liability Agent. You determine fault percentage in a Malaysian motor accident based on evidence.

You receive:
- CaseFacts including the police verdict summary
- Optionally, photo analysis results from the vision tool

You produce a LiabilityVerdict JSON object.

Rules:
- The sum of claimant_fault_percentage and third_party_fault_percentage MUST equal 100.
- Cite specific evidence for every fault attribution. Each citation must reference a real source (police report page, chat transcript line, photo index, or narrative quote).
- Malaysian Highway Code priorities: right-of-way at junctions, reversing vehicles have higher liability, stationary vehicles are rarely at fault.
- If the police report explicitly names a fault, weight it heavily (0.8 confidence baseline) but do not accept blindly if evidence contradicts.
- If vision analysis contradicts the narrative, flag it: set vision_corroborates_narrative to false and explain.

Output only the JSON object.
```

**Retry policy:** 1 retry.

**Failure modes:**
- Fault percentages don't sum to 100 → Pydantic validator catches, retry
- Vision tool fails on all photos → proceed with vision_tool_used=true, vision_corroborates_narrative=null, lower confidence

### 5.4 Fraud agent

**Purpose:** Score fraud risk using heuristics plus narrative reasoning.

**Inputs:** `case_facts`, `policy_verdict`, `liability_verdict`

**Output contract:** `FraudAssessment`

**Tools used:**
- GLM text model
- Internal heuristic checks (pure Python, no LLM):
  - Policy inception date vs incident date (red flag if < 30 days)
  - Photo EXIF timestamp vs incident datetime (if available)
  - Damage description vs fault direction consistency
  - Narrative internal consistency

**System prompt skeleton:**

```
You are the Fraud Detection Agent. Your stance is adversarial — you assume a claim might be fraudulent until evidence clears it.

You receive:
- CaseFacts
- PolicyVerdict (so you know when the policy was purchased)
- LiabilityVerdict (so you can check for inconsistencies)
- A list of heuristic signals already computed by the system

You produce a FraudAssessment JSON object.

Rules:
- Your suspicion_score should start at 0.15 (baseline noise) and rise for each concerning signal.
- Suspicion above 0.6 triggers escalation recommendation.
- Be specific about why a signal concerns you. "The narrative describes a rear-end collision but the damage is on the front bumper" is actionable. "Something feels off" is not.
- Do not falsely accuse. If you find no red flags, return a low score honestly.

Output only the JSON object.
```

**Retry policy:** 1 retry.

**Failure modes:** None critical — if Fraud agent fails, proceed with a default low-suspicion FraudAssessment and log the failure.

### 5.5 Payout agent

**Purpose:** Reconcile the three upstream verdicts and compute the final payout number.

**Inputs:** `policy_verdict`, `liability_verdict`, `fraud_assessment`, `case_facts`

**Output contract:** `PayoutRecommendation`

**Tools used:**
- GLM text model for rationale generation
- Pure Python arithmetic for the breakdown (do not ask the LLM to do math)

**Arithmetic procedure (executed in Python, not by the LLM):**

```python
repair_estimate = estimate_from_damage_list(case_facts.vehicles[0].damage_location)
liability_adjusted = repair_estimate * (liability_verdict.third_party_fault_percentage / 100)
excess_deducted = liability_adjusted - policy_verdict.excess_myr
ncd_adjusted = excess_deducted * (1 - policy_verdict.ncd_percentage / 100)
depreciation = apply_depreciation(ncd_adjusted, vehicle_age_from_case_facts, policy_verdict.depreciation_schedule)
final_payout = max(0, ncd_adjusted - depreciation)
```

The LLM's job is only to write the rationale and decide the recommended_action, not compute numbers.

**System prompt skeleton:**

```
You are the Payout Agent. You have been given three verdicts (Policy, Liability, Fraud) plus a pre-computed numerical breakdown. Your job is to decide the recommended action and write the rationale.

Recommended actions:
- "approve" if coverage is confirmed, fault leans toward third party, and fraud suspicion is below 0.6
- "partial_approve" if partial fault or partial coverage applies
- "decline" if not covered or claimant 100% at fault
- "escalate" if fraud suspicion is above 0.6 or any verdict has confidence below 0.5

Output the PayoutRecommendation JSON. The payout_breakdown is given to you — do not modify it.
```

**Retry policy:** 1 retry.

### 5.6 Auditor agent

**Purpose:** Adversarially review the Payout recommendation and all upstream verdicts. Challenge or approve.

**Inputs:** All prior verdicts plus the PayoutRecommendation

**Output contract:** `AuditResult`

**Tools used:** GLM text model

**System prompt skeleton:**

```
You are the Auditor Agent. You are a skeptical compliance reviewer. Your job is to find flaws in the upstream agents' reasoning before a claim is paid out.

You receive all verdicts from Policy, Liability, Fraud, and Payout.

Look for:
- Policy clauses cited that don't actually cover the described incident
- Liability percentages that don't match the evidence strength
- Fraud signals that were dismissed without adequate reasoning
- Payout calculations that don't follow from the liability + policy combination
- Internal contradictions between verdicts

If you find a flaw, output verdict="challenge" and list specific AuditorChallenge objects. Name the agent, the issue, and a suggested fix.

If the reasoning is sound across all agents, output verdict="approve" with an empty challenges list. Do not manufacture challenges for the sake of disagreement.

If the claim has Fraud suspicion above 0.7 OR Policy confidence below 0.4 OR any contradiction you cannot resolve, output verdict="escalate".

Output only the JSON object.
```

**Retry policy:** 1 retry.

**Loop control:**
- CaseState tracks `auditor_loop_count`
- If Auditor challenges AND loop_count < 2 → route to challenged agent, increment counter
- If Auditor challenges AND loop_count >= 2 → escalate to human, status = "escalated"
- If Auditor approves → proceed to PDF generation, status = "awaiting_approval"

---

## 6. LangGraph workflow definition

### 6.1 Graph structure

```python
from langgraph.graph import StateGraph, END

workflow = StateGraph(CaseState)

workflow.add_node("intake", intake_agent)
workflow.add_node("policy", policy_agent)
workflow.add_node("liability", liability_agent)
workflow.add_node("fraud", fraud_agent)
workflow.add_node("parallel_analysis", run_parallel)  # runs policy, liability, fraud concurrently
workflow.add_node("payout", payout_agent)
workflow.add_node("auditor", auditor_agent)
workflow.add_node("generate_pdf", pdf_generator)

workflow.set_entry_point("intake")
workflow.add_edge("intake", "parallel_analysis")
workflow.add_edge("parallel_analysis", "payout")
workflow.add_edge("payout", "auditor")

def route_from_auditor(state: CaseState) -> str:
    if state.audit_result.verdict == "approve":
        return "generate_pdf"
    elif state.audit_result.verdict == "escalate":
        return END  # status already set to "escalated"
    elif state.auditor_loop_count >= 2:
        state.status = "escalated"
        return END
    else:
        challenged = state.audit_result.challenges[0].challenged_agent
        state.auditor_loop_count += 1
        return challenged  # loop back to that specific agent

workflow.add_conditional_edges("auditor", route_from_auditor)

# After each re-run from a challenge, go back through payout and auditor
for agent in ["policy", "liability", "fraud"]:
    workflow.add_edge(agent, "payout")

workflow.add_edge("generate_pdf", END)

compiled = workflow.compile()
```

### 6.2 Parallel execution inside `parallel_analysis`

```python
async def run_parallel(state: CaseState) -> CaseState:
    results = await asyncio.gather(
        policy_agent(state),
        liability_agent(state),
        fraud_agent(state),
    )
    state.policy_verdict, state.liability_verdict, state.fraud_assessment = results
    return state
```

All three agents run concurrently, which is what the middle pane visualizes as three nodes pulsing simultaneously.

### 6.3 State-change event emission

Every node wraps its agent call with an emit-event decorator:

```python
async def with_events(agent_name: str, agent_fn):
    async def wrapped(state: CaseState) -> CaseState:
        await emit_sse(state.case_id, {"event": "agent_started", "agent": agent_name})
        new_state = await agent_fn(state)
        await emit_sse(state.case_id, {
            "event": "agent_completed",
            "agent": agent_name,
            "output_key": output_field_for(agent_name)
        })
        return new_state
    return wrapped
```

---

## 7. API specification

### 7.1 HTTP endpoints

**`POST /submit-claim`**

Request: multipart/form-data
- `police_report`: PDF file
- `policy`: PDF file
- `photos`: multiple image files
- `chat_transcript`: optional text

Response: `{"case_id": "CLM-2026-00812", "status": "submitted"}`

Behavior:
1. Generate a case ID
2. Save all files to `/tmp/cases/{case_id}/`
3. Create a CaseState, store in memory
4. Trigger `compiled.ainvoke(state)` as an asyncio background task
5. Return case ID immediately

**`GET /case/{case_id}`**

Response: full CaseState as JSON, for debugging and fallback

**`GET /case/{case_id}/stream`**

Response: Server-Sent Events stream. Events:

```
event: agent_started
data: {"agent": "intake", "timestamp": "..."}

event: agent_completed
data: {"agent": "intake", "output_key": "case_facts", "timestamp": "..."}

event: auditor_challenged
data: {"challenged_agent": "liability", "issue": "...", "loop_count": 1}

event: workflow_completed
data: {"status": "awaiting_approval", "pdf_ready": true}

event: workflow_failed
data: {"reason": "...", "agent": "..."}
```

**`GET /case/{case_id}/pdf`**

Response: application/pdf of the Claim Decision document. 404 if not ready.

**`POST /case/{case_id}/approve`**

Request body: `{}`
Response: `{"status": "approved"}`

**`POST /case/{case_id}/override`**

Request body: `{"rationale": "string", "override_fields": {"fault_percentage": 50}}`
Response: `{"status": "overridden", "pdf_regenerated": true}`

### 7.2 Frontend-backend contract summary

The frontend never touches the agent runtime directly. It only:
1. POSTs the submission → receives case ID
2. Opens SSE stream with the case ID
3. Renders based on incoming events
4. Fetches the final PDF via `/case/{id}/pdf`
5. POSTs operator decision via `/approve` or `/override`

---

## 8. Data flow walkthrough

This section walks one complete case from click to signed PDF. Every engineer should be able to recite this flow.

### 8.1 Happy path

1. Driver opens `/file-claim` in phone browser
2. Uploads police report, policy PDF, 3 photos, pastes chat
3. Taps "Submit"
4. Frontend POSTs to `/submit-claim`
5. Backend creates `case_id = "CLM-2026-00812"`, saves files, stores initial CaseState, returns case ID
6. Frontend redirects (in demo, we switch to operator dashboard manually on the projector)
7. Operator dashboard opens, establishes SSE to `/case/CLM-2026-00812/stream`
8. Backend kicks off LangGraph run
9. Intake node runs: reads PDFs, calls GLM, produces CaseFacts, updates CaseState
10. SSE emits `agent_started: intake` then `agent_completed: intake`
11. Middle pane: Intake node pulses, then turns solid; Blackboard right pane populates with CaseFacts JSON
12. Parallel node runs: Policy, Liability, Fraud fire concurrently via `asyncio.gather`
13. SSE emits three `agent_started` events, then three `agent_completed` events as each finishes
14. Middle pane: three nodes pulse simultaneously, turn solid one by one
15. Payout node runs: computes breakdown arithmetically, calls GLM for rationale, produces PayoutRecommendation
16. Auditor node runs: reviews all verdicts, outputs AuditResult with verdict="approve"
17. Generate-PDF node runs: ReportLab renders the decision PDF, saves to disk
18. SSE emits `workflow_completed`, status = "awaiting_approval"
19. Dashboard shows "Approve" button
20. Operator clicks Approve, frontend POSTs to `/case/.../approve`
21. CaseState status → "approved". Done.

### 8.2 Auditor-challenge path (the wow moment)

Steps 1–15 identical. Then:

16. Auditor reviews and returns `verdict="challenge"` with a challenge against the Liability agent: "The liability verdict cites photo 2 as showing rear-impact damage, but photo 2 shows front-right damage."
17. SSE emits `auditor_challenged`
18. Middle pane animates an arrow backward from Auditor to Liability, Liability node pulses orange
19. Router re-runs Liability with the challenge included in the prompt
20. Liability produces an updated verdict with corrected evidence citation
21. Payout re-runs with the updated Liability verdict
22. Auditor re-runs, now approves
23. Flow proceeds to PDF generation

### 8.3 Fraud-catch path (the second demo case)

Same flow but:
- Fraud agent returns suspicion_score = 0.72 with signals: ["policy_age_14_days", "photo_metadata_mismatch"]
- Payout agent's recommended_action becomes "escalate"
- Auditor agent confirms "escalate"
- Workflow ends with status = "escalated", PDF is not generated
- Dashboard shows escalation panel with all agent reasoning for human review

---

## 9. Failure handling and edge cases

### 9.1 Agent-level failures

| Failure | Detection | Recovery |
|---|---|---|
| Agent returns malformed JSON | Pydantic parse at boundary | Retry once with stricter prompt; then set workflow_failed |
| Agent exceeds 15s timeout | `asyncio.wait_for` wrapper | Retry once; then set workflow_failed |
| GLM API returns 429 rate limit | HTTP client sees 429 | Exponential backoff, 3 retries over 15s, then fail |
| Vision tool fails on a photo | Try/except around vision call | Liability proceeds with `vision_tool_used=true`, `vision_corroborates_narrative=null`, lower confidence |
| PDF extraction returns empty text | Check length after extraction | Fall back pdfplumber → pypdf → OCR; if all empty, fail workflow |
| LangGraph detects infinite loop | Loop count > 2 | Force status="escalated", end workflow |

### 9.2 System-level failures

| Failure | Detection | Recovery |
|---|---|---|
| GLM API key invalid | Fails on first call | Fail fast at startup, log clear error |
| Disk full for uploaded files | OSError on write | Return 507 Insufficient Storage to frontend |
| Memory pressure from concurrent cases | Monitor case store size | For hackathon demo, one case at a time — not a concern |
| Frontend loses SSE connection | Browser-side reconnect | SSE auto-reconnects; backend emits full state on reconnect |
| Live-demo WiFi failure on stage | Obvious | Play cached run from `/tmp/cases/demo_cached/` using replay mode |

### 9.3 Cached fallback replay mode

On day 5–6 of the build, record one full successful demo run:

1. Run the happy-path demo case through the full pipeline
2. Capture every SSE event to `demo_replay.jsonl`
3. Capture the generated PDF to `demo_decision.pdf`

Replay mode:
- Backend endpoint `/demo/replay` reads the JSONL and emits events at the original timings (or faster)
- Frontend connects to `/demo/replay/stream` instead of the live stream
- The dashboard looks identical to the live run

Trigger: if the live run stalls for > 20 seconds at any agent, the presenter clicks a hidden key combo and the frontend switches to replay mode. Judges cannot tell.

---

## 10. File and project layout

```
claims-engine/
├── README.md
├── docker-compose.yml
├── Dockerfile
├── .env.example
│
├── backend/
│   ├── pyproject.toml
│   ├── app/
│   │   ├── main.py                  # FastAPI entry
│   │   ├── api/
│   │   │   ├── claims.py            # /submit-claim, /case/{id}, etc.
│   │   │   └── streaming.py         # SSE endpoints
│   │   ├── agents/
│   │   │   ├── intake.py
│   │   │   ├── policy.py
│   │   │   ├── liability.py
│   │   │   ├── fraud.py
│   │   │   ├── payout.py
│   │   │   └── auditor.py
│   │   ├── workflow/
│   │   │   ├── graph.py             # LangGraph definition
│   │   │   └── state.py             # CaseState model
│   │   ├── contracts/
│   │   │   ├── case_facts.py
│   │   │   ├── policy_verdict.py
│   │   │   ├── liability_verdict.py
│   │   │   ├── fraud_assessment.py
│   │   │   ├── payout_recommendation.py
│   │   │   └── audit_result.py
│   │   ├── tools/
│   │   │   ├── pdf_extraction.py
│   │   │   ├── vision.py
│   │   │   └── glm_client.py
│   │   ├── pdf_generator/
│   │   │   └── decision_pdf.py
│   │   ├── store/
│   │   │   └── case_store.py        # in-memory dict
│   │   └── replay/
│   │       └── demo_replay.py       # cached fallback
│   └── tests/
│       ├── test_contracts.py
│       └── test_agents.py
│
├── frontend/
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── file-claim/
│   │   │   └── page.tsx            # claimant view
│   │   └── dashboard/
│   │       └── page.tsx            # operator 3-pane
│   ├── components/
│   │   ├── claimant/
│   │   │   ├── UploadForm.tsx
│   │   │   └── SubmissionConfirm.tsx
│   │   └── dashboard/
│   │       ├── IntakePane.tsx      # left
│   │       ├── WorkflowGraph.tsx   # middle (React Flow)
│   │       ├── Blackboard.tsx      # right
│   │       └── DecisionActions.tsx # approve/override
│   ├── lib/
│   │   ├── api-client.ts
│   │   └── sse-hook.ts             # useSSE custom hook
│   └── types/
│       └── events.ts               # TypeScript mirror of backend contracts
│
└── demo-assets/
    ├── sample_police_report.pdf
    ├── sample_policy.pdf           # Etiqa or similar
    ├── photos/
    │   ├── crash_1.jpg
    │   ├── crash_2.jpg
    │   └── crash_3.jpg
    ├── chat_transcript.txt
    └── cached_replay/
        ├── demo_replay.jsonl
        └── demo_decision.pdf
```

---

## 11. Development environment

### 11.1 Prerequisites

- Python 3.11+
- Node.js 20+
- Docker 24+
- A GLM API key provisioned by the hackathon

### 11.2 Local setup

```bash
# Backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e .
cp .env.example .env
# Add GLM_API_KEY to .env
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev  # port 3000
```

### 11.3 Environment variables

```
GLM_API_KEY=...
GLM_BASE_URL=https://api.glm.example/v1
GLM_MODEL_TEXT=glm-4.6
GLM_MODEL_VISION=glm-4v
CASE_STORAGE_DIR=/tmp/cases
LOG_LEVEL=INFO
```

---

## 12. Interface boundaries and ownership

This section makes explicit which teammate owns which file and which boundaries must not be crossed without coordination.

### 12.1 Hard boundaries

- **Backend Python code is owned by the Backend and AI engineers.** Frontend engineer does not write Python.
- **Frontend React code is owned by the Frontend engineer.** Backend engineer does not write TSX.
- **The Pydantic contracts in `backend/app/contracts/`** are the shared interface. Changes require team agreement. TypeScript types in `frontend/types/events.ts` mirror them and must be updated together.
- **Agent prompts in `backend/app/agents/`** are owned by the AI engineer. Backend engineer does not edit prompts. AI engineer does not restructure the LangGraph wiring.
- **LangGraph wiring in `backend/app/workflow/graph.py`** is owned by the Backend engineer. AI engineer does not edit the graph structure; they ship agents that conform to the contracts.
- **Demo artifacts** are owned by the Product manager. Nobody else fabricates or modifies demo inputs.

### 12.2 Daily integration checkpoint

End of every day, one team member (rotating) runs the full end-to-end pipeline with a sample case and verifies:

- `/submit-claim` accepts the upload
- SSE stream emits events in the expected order
- Middle pane renders correctly
- PDF is produced

If this fails at end of day, the team fixes it before sleeping. No day ends with a broken pipeline.

---

## 13. Observability and debugging

### 13.1 Logging

Every agent logs at INFO level:
- Agent name, case ID
- Input summary (first 200 chars of relevant fields)
- Output summary
- Duration in milliseconds

Every tool call (GLM, vision, PDF extraction) logs at DEBUG level:
- Full request and response
- Retry attempts

Logs go to stdout in dev, rotated file in prod (not needed for hackathon).

### 13.2 Tracing (optional, nice-to-have)

If time permits on day 4, add LangSmith or a simple OpenTelemetry exporter. Not required for the demo.

### 13.3 Debug endpoints

`GET /debug/cases` — lists all active case IDs (dev only, disable in prod)
`GET /debug/case/{id}/history` — full event log for a case
`POST /debug/case/{id}/replay-from/{agent}` — re-run from a specific agent for testing

---

## 14. Security and privacy notes (post-hackathon considerations)

Not in scope for the hackathon demo but flagged for awareness:

- IC numbers are masked in CaseFacts (first char + asterisks). Full IC never appears in logs or PDFs outside of the initial extraction buffer.
- Uploaded files are stored in `/tmp/cases/` which is ephemeral in containers. Real deployment needs encrypted object storage.
- GLM API calls send raw extracted text including names and plate numbers. Production deployment would need either on-prem inference or a DPA with the model provider.
- Audit trails should be immutable (append-only) in production. Hackathon build uses in-memory dict.

---

## 15. Open technical questions

Unresolved at time of writing. Flag these to the team on day 0.

1. **Does GLM have native structured-output (JSON schema) mode?** If yes, use it — reduces retry rate. If no, we use prompt-level JSON instructions plus Pydantic validation.
2. **Does GLM-4V support multiple images in one call?** If yes, Liability agent sends all photos in one request. If no, serial calls with `asyncio.gather`.
3. **What's the GLM rate limit and quota under the hackathon allocation?** Determines whether we can run the full pipeline 5+ times during rehearsals.
4. **Is there a Malaysian police report PDF format that's publicly available for reference?** If not, fabricate plausibly from MySettle's output format.
5. **Do we have an older MySettle output to use as demo input, or do we fabricate?** Either is fine; commit on day 1.

Resolve all five before starting agent implementation.
