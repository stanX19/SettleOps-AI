# SettleOps AI

## 1. Executive Summary

SettleOps AI is an AI-powered automation platform designed specifically for insurance claims officers to accelerate and improve the accuracy of claim decision-making. By leveraging a sophisticated multi-agent AI architecture featuring 9-13 specialized agents—including a dedicated Vision AI Agent for precise damage photo analysis—the platform reads and reconciles complex claim documents (police reports, adjuster reports, policy terms, and crash photos) to generate a structured decision report in under 90 seconds.

The product centralizes the entire review process into a high-efficiency "cockpit," allowing officers to monitor parallel AI agents as they reason through evidence. It features a human-in-the-loop feedback system where officers can challenge agent outputs or request re-evaluation from a high-level "Auditor" agent. SettleOps AI transforms the traditionally manual, 30-60 minute review process into a streamlined, supervised workflow, ensuring consistency and surfacing fraud risks that might otherwise be missed.

## 2. Problem & Market Context

### 2.1 Malaysian Motor Claim Workflow

A Malaysian motor insurance claim involves multiple regulated and operational parties. The typical workflow has eight steps:

1. **Accident occurs.** The driver takes photos, exchanges information, and contacts the insurer.
2. **Police report is lodged.** The driver reports the accident within 24 hours. Police investigate and produce a police report and, later, an investigation result.
3. **Insurer is notified.** The driver submits claim details and selects the appropriate claim type, such as Own Damage, Third Party, or Own Damage Knock-for-Knock.
4. **Vehicle goes to a panel workshop.** The workshop inspects the vehicle and prepares a repair quotation.
5. **Licensed loss adjuster inspects the vehicle.** The adjuster physically reviews the damage, considers the police report and quotation, and produces an adjuster report.
6. **Claims officer reviews the case.** The insurer's claims officer reads the documents, verifies policy coverage, assesses liability and fraud risk, calculates payout, and decides whether to approve, partially approve, decline, or escalate.
7. **Repairs commence.** Approved repairs proceed at the panel workshop.
8. **Payment and closure.** The insurer pays the workshop after required documentation is completed, and the claim is closed.

SettleOps AI focuses on **Step 6**, the claims officer's review and decision-drafting step.

### 2.2 Manual Review Bottleneck and Business Pain

Much of the upstream workflow is already digitized through insurer apps, MySettle-style police report digitization, workshop systems, and Merimen eClaims. However, the claims officer's review remains heavily manual. This is the point where a digital claim turns back into a human reading exercise.

A judge should think of the claims officer's desk as a queue of cases where every case contains several separate sources of truth: the police version, the adjuster's version, the policy wording, the workshop's price, the driver's explanation, and the photos. None of those documents arrive as one clean decision. The officer has to mentally reconcile them while also staying fast enough to keep the claim queue moving.

A claims officer typically needs to:

- Read the police report and investigation result.
- Read the licensed loss adjuster's report.
- Review the policy schedule, cover note, excess, NCD, and exclusions.
- Check whether the damage pattern matches the accident narrative.
- Review repair quotation details.
- Consider fraud indicators such as policy age, claim frequency, or inconsistent evidence.
- Calculate the recommended payout.
- Draft a decision narrative and supporting documentation.
- Update the claim workflow system.

The pain is not only the time spent. It is the accumulated risk:

- **Backlog pressure:** A 30-minute review sounds manageable until one officer has 15-25 claims a day and new documents keep arriving.
- **Context switching:** Officers jump between PDFs, photos, policy wording, repair quotations, and workflow screens, increasing fatigue and missed details.
- **Fraud blind spots:** A suspicious pattern may be obvious only when evidence is compared across documents, but rushed officers often review each document separately.
- **Inconsistent decisions:** Two officers may reach different conclusions because much of the reasoning lives in memory and experience rather than a structured review trail.
- **Customer and fleet downtime:** Every delayed decision means a driver or fleet vehicle stays in the workshop longer.
- **Operational cost:** With roughly **900,000 motor claims per year in Malaysia**, even conservative assumptions imply a large industry-wide labour cost and a significant settlement bottleneck.

This is the specific pain SettleOps AI targets: not accident reporting, not workshop repair, and not loss adjustment. It targets the insurer's final manual decision-drafting bottleneck.

### 2.3 Why SettleOps AI Is Feasible Now

The product opportunity exists because several conditions have recently converged:

- AI models can now extract and summarize information from Malaysian insurance documents more reliably than earlier generations.
- Vision-capable AI can help corroborate damage direction from crash photos, without attempting to replace professional damage cost estimation.
- AI processing costs have fallen enough to make per-claim decision support economically attractive.
- Insurers face ongoing pressure to improve claim settlement speed and customer experience.
- Merimen already owns the workflow layer, creating an opportunity for a focused AI reasoning layer that complements, rather than replaces, the existing ecosystem.

## 3. Target Users & Service Buyers

### 3.1 Primary User: Claims Officer

The primary user is an insurer-side claims officer responsible for reviewing Malaysian motor insurance claims and making claim decisions.

**Persona: Siti Noraini binti Hamid**

- Senior Claims Officer at a Malaysian general insurer.
- Processes 15-25 motor claims per day.
- Works inside the insurer's claim workflow system.
- Is measured on settlement speed, accuracy, and operational throughput.

**User pain:**

- Too many claims and limited review time.
- Documents are lengthy, inconsistent, and arrive from multiple parties.
- Fraud detection depends heavily on experience and memory.
- Manual payout calculation and decision drafting create repetitive work.
- Rushed review increases the risk of missed inconsistencies.

**Desired outcome:**

Siti opens a case, reviews an AI-drafted decision, inspects the reasoning where needed, and makes a final human decision in minutes instead of spending 30-60 minutes drafting from scratch.

### 3.2 Secondary User: Fleet Operations Manager

The secondary user is a fleet operations manager whose business is affected by vehicle downtime.

**Persona: Ahmad bin Rashid**

- Operations Manager at a fleet business with approximately 200 vehicles.
- Needs accident claims resolved quickly so vehicles can return to service.

**User pain:**

- Every day a vehicle sits in a workshop creates lost revenue.
- Claim follow-up with insurers can be slow and opaque.

**Desired outcome:**

- Ahmad benefits from the significantly faster claim processing time enabled by the insurer using SettleOps AI, reducing vehicle downtime and operational loss.

### 3.3 Loss Adjuster Positioning

SettleOps AI **does not replace the licensed loss adjuster**.

The loss adjuster remains a regulated, independent professional who physically inspects the vehicle and produces the adjuster report. SettleOps AI consumes the adjuster's report as a key input and operates after the adjuster's work, inside the insurer's claim decision process.

This positioning is non-negotiable for product, regulatory, and pitch credibility.

### 3.4 Additional Service Buyers

These are the commercial or operational buyers who may purchase or sponsor usage of SettleOps AI. Parties that provide evidence but do not use the product directly are intentionally excluded from this document.

| Buyer | How they use SettleOps AI |
|---|---|
| Insurer Head of Claims Operations | Buys SettleOps AI to reduce review time, improve consistency, and increase claims officer throughput. |
| Claims Team Lead / Supervisor | Monitors escalated cases, reviews decision quality, and uses audit trails for coaching and governance. |
| Fleet Operations Director | Invests in SettleOps AI to ensure their insurance provider can settle claims faster, reducing business downtime. |

Page 5 of 22

## 4. Product Overview & Core Features

### 4.1 Product Architecture & Interaction

SettleOps AI is built around a centralized Intelligence Hub that allows officers to manage cases, interact with AI, and oversee automated workflows.

1.  **Chat Home Page:** A interface where users can ask questions about any claim or start a new claim by simply uploading documents.
2.  **Manage Hub:** A dedicated space for file management and evidence uploading. Once a new claim is initiated, the officer uses this hub to organize and submit the document stack.
3.  **Claims Queue:** A real-time dashboard showing all active cases. Each case workflow is independent and runs in parallel, allowing for massive throughput.
4.  **Case Workflow Page (Three-Pane Cockpit):** The core operational interface for reviewing a specific claim.
5.  **Multi-Agent Reasoning:** A fleet of 9-13 specialized AI agents (Liability, Coverage, Fraud, Payout, Vision, etc.) work simultaneously to analyze the case. This includes a dedicated **Vision AI Agent** that performs forensic analysis on damage photos to corroborate narratives. A high-level "Auditor" agent oversees the final synthesis.

### 4.2 Three-Pane Case Workflow Page

The workflow page is designed for maximum transparency and control:

-   **Panel 1: Uploaded Evidences:** Displays all raw input documents, photos, and transcripts for quick reference.
-   **Panel 2: Workflow Canvas:** A live visualization of the 9-13 agents running in parallel. The officer can see the reasoning steps as they happen.
-   **Panel 3: Outcome & Interaction (Toggleable):**
    -   **Blackboard State:** Shows the structured output results (Liability %, Payout, etc.).
    -   **AI Strategy Chat:** A direct chat interface where the officer can ask the AI to explain specific outcomes, clarify reasoning, or provide feedback to the Auditor agent to recheck a specific issue.

### 4.3 AI Model & Prompt Design

#### 4.3.1 Model Selection & Benchmarking

SettleOps AI utilizes **Google Gemini 2.5 Flash** as its foundational intelligence engine. Our benchmarking against industry leaders revealed that while several models offer high reasoning capability, Gemini 2.5 Flash provides the optimal balance of speed, multimodal vision, and context length required for real-time insurance automation.

| Model | Reasoning Depth | Inference Speed | Context Window | Vision Accuracy | Cost Efficiency | SettleOps Fit |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Gemini 2.5 Flash** | High | Ultra-Fast | 1M+ Tokens | Excellent | High | **Primary Engine** |
| OpenAI GPT-4o | Very High | Fast | 128k | Good | Moderate | Secondary/Fallback |
| Claude 3.5 Sonnet | Very High | Moderate | 200k | Moderate | Low (Costly) | Over-engineered |
| GLM-4 | Moderate | Fast | 128k | Basic | Moderate | Regional alternative |
| Gemini 1.5 Pro | Ultra-High | Moderate | 2M+ Tokens | Excellent | Moderate | Auditor Tasks |

**Why Gemini 2.5 Flash?**
- **Sub-90s Decisions:** Its high token-per-second throughput is critical for our 90-second generation target.
- **Multimodal Vision AI:** Native image support allows the Vision AI Agent to analyze crash photos directly for damage corroboration without external OCR dependencies.
- **Infinite Context:** Handling multiple PDFs (police reports, adjuster reports, and 100-page policy booklets) simultaneously requires a massive context window which Gemini provides.

**Development vs. Production Strategy**
During the development and prototyping phase, the team utilized **Gemini 1.5 Pro** and **Claude 3.5 Sonnet** for their extreme reasoning depth. This allowed us to validate the complex multi-agent architecture and "stress-test" the liability logic across contradictory evidence sets. For a live **Production** environment, however, we prioritize **Gemini 2.5 Flash**. The shift to 2.5 Flash is driven by the need for commercial scalability; it delivers the rapid inference speeds required for a responsive user experience and a significantly more sustainable cost-per-claim ratio, which is essential for handling the high volume of claims in the Malaysian insurance market.

#### 4.3.2 Prompting Strategy: Multi-Step Agentic Prompting

-   **Our Approach:** SettleOps AI uses a **Multi-Step Agentic Prompting** strategy coordinated by a central Auditor. Each of the 9-13 specialized agents is assigned a highly focused domain (e.g., Liability, Policy, or Damage) with strict JSON output constraints.
-   **Why it fits:** Insurance claims are inherently non-linear and involve contradictory evidence. A single-shot or zero-shot approach would struggle to reconcile a police report against a repair quote. By decomposing the claim into sub-tasks, we ensure higher reasoning accuracy, improve traceability for audits, and enable the Auditor Agent to perform cross-consistency checks between specialized outputs.

#### 4.3.3 Context & Input Handling: Large-Scale Multimodal Ingestion

-   **Our Approach:** The system is designed to handle messy, unstructured document stacks including PDFs, handwritten reports, and crash photos.
-   **Maximum Input Size:** Utilizing **Gemini 2.5 Flash**, the system accepts up to **1,000,000 tokens** per case. This massive window allows us to process full policy booklets and high-resolution images in a single context without early rejection.
-   **Handling Oversized Inputs:** In the rare event that a case exceeds the 1M token limit (e.g., a massive multi-year fleet history), the system employs **Recursive Summarization**. Critical legal evidence (Police Reports) is prioritized for full-text ingestion, while secondary technical annexes are summarized into structured summaries to fit the context window without losing essential intent.

#### 4.3.4 Fallback & Failure Behavior: Conflict Resolution Protocol

-   **Hallucination & Failure Detection:** If a model returns an off-topic, unusable, or hallucinated response, the **Auditor Agent** identifies the inconsistency during its cross-check phase (e.g., detecting a mismatch between the Damage and Liability results).
-   **Mechanism for Retrying:** The system implements a **Surgical Rerun** mechanism. The Auditor sends the failing agent specific corrective feedback (e.g., 'Re-check photo evidence for rear impact') and triggers a retry (capped at 3 attempts to prevent infinite loops).
-   **Human Escalation Path:** If a contradiction remains unresolved after the retries (a genuine evidentiary conflict), the system marks the case as **"Inconsistent"**. This pauses the automated workflow and highlights the conflicting data for the Claims Officer to resolve via the **AI Strategy Chat** or a manual override.
-   **Graceful Error State:** If a critical technical failure occurs, the case is moved to an **"Escalated"** status, providing a clear audit log of the failure reason so the officer can take over the manual review immediately.

### 4.4 Human-in-the-Loop Feedback Loop

The system is designed to be human-supervised. If a final report or a warning appears, the officer can:
-   Interrogate the AI through the chat panel for clarification.
-   Provide direct feedback to the **Auditor Agent**.
-   Request a re-check or re-run of a specific reasoning process if the officer identifies a nuance the agents may have missed.

### 4.5 Three-Pane Claims Officer Dashboard

The dashboard is organized around the officer's review job:

**Left pane: Inputs**

Shows the uploaded claim materials, including document previews, photo thumbnails, and optional chat transcript. This pane represents the raw evidence stack the officer would normally inspect manually. It gives judges immediate visual proof that the product is working from real claim evidence rather than a typed prompt.

**Middle pane: Live review workflow**

Shows the AI review process as a sequence of visible reasoning stages. Each stage has a clear status such as waiting, reviewing, completed, challenged, or escalated. When the system finds an inconsistency and rechecks part of the decision, the dashboard must show that challenge visibly. This pane is the "workflow proof" for judges: it demonstrates that the product coordinates a claim review, rather than answering one chat question.

**Right pane: Decision blackboard**

Shows the structured outputs produced during review, including extracted case facts, policy coverage assessment, liability assessment, fraud assessment, payout recommendation, and final audit result. The officer can inspect the reasoning before taking action. The blackboard should read like a working decision memo: concise enough for quick approval, structured enough for audit, and specific enough to justify challenge or escalation.

**Bottom action area**

Allows the officer to:

- Approve the drafted decision.
- Decline the claim with a required reason.
- Challenge a specific part of the reasoning.
- Download the decision artifact and audit trail when available.

### 4.6 Human-in-the-Loop Review

Every AI-drafted decision is provisional. The officer remains the final decision-maker.

The system supports three human actions:

- **Approve:** The officer accepts the draft and finalizes the decision.
- **Decline:** The officer rejects the claim and records a reason.
- **Challenge:** The officer questions a specific part of the reasoning, such as fault percentage, coverage, fraud risk, or payout amount. The system then revisits the relevant portion of the review and updates the recommendation.

The system must limit repeated challenges so the workflow cannot run indefinitely. When uncertainty remains unresolved, the system must escalate rather than force an unsupported decision.

### 4.7 Output Artifacts

SettleOps AI produces two primary outputs:

- **Claim Decision PDF:** A formal decision document containing claim reference, incident summary, coverage rationale, liability assessment, fraud assessment, payout breakdown, challenge history, and officer decision status.
- **Structured audit trail:** A review record showing what the system considered, what it concluded, where it found uncertainty, and what the officer did.

These outputs are designed for review, compliance support, and operational handoff. They are not a replacement for insurer approval controls.

### 4.8 Feature Comparison with Alternatives

SettleOps AI should be positioned against adjacent tools and likely judge comparisons. The clearest message is: existing tools move documents, estimate damage, or provide generic automation; SettleOps AI drafts the insurer-side claim decision with visible reasoning and human control.

| Capability | SettleOps AI | Merimen eClaims | Generic chatbot | Workflow automation tools | Visual damage AI |
|---|---|---|---|---|---|
| Malaysian motor claim decision support | **Yes. Built around insurer claim review.** | Partial. Manages claim workflow and document exchange. | No. Requires manual prompting and lacks claim workflow context. | No. Automates predefined steps but does not reason over claim evidence. | No. Focuses on vehicle damage images. |
| Claims officer dashboard | **Yes. Queue, evidence, review progress, blackboard, actions.** | Yes for workflow operations, not AI decision drafting. | No. Chat interface only. | No dedicated claims officer cockpit. | No. Usually image-assessment focused. |
| Multi-document evidence review | **Yes. Police report, policy, repair quotation, photos, adjuster report, chat.** | Stores and routes documents. | Possible but unstructured and not workflow-safe. | Limited unless every rule is manually configured. | Usually limited to images. |
| Policy, liability, fraud, and payout reasoning | **Yes. Combined into one decision draft.** | Not the core product promise. | Possible in text but not controlled or auditable enough. | Rule-based only; weak for unstructured evidence. | No. |
| Visible challenge / audit behavior | **Yes. Shows contradictions and escalates uncertainty.** | No AI reasoning challenge layer. | No reliable internal challenge workflow. | No unless custom-built. | No. |
| Human-in-the-loop final decision | **Yes. Officer approves, declines, or challenges.** | Yes as workflow owner, but not AI decision support. | Human decides outside the tool. | Depends on configuration. | Usually reviewer validates image estimate. |
| Strategic role | **AI reasoning layer beside Merimen.** | Industry workflow backbone. | General assistant. | Process automation layer. | Damage assessment point solution. |

Page 10 of 22

## 5. Functional Requirements

### 5.1 Claim Submission

The system must allow a user to submit claim materials and start a new review case.

**Acceptance criteria:**

- Given the required claim documents are provided, when the user submits the case, then the system creates a new claim case and confirms that review has started.
- Given a required document is missing, when the user attempts submission, then the system shows a clear validation message.
- Given optional documents are not provided, when the user submits, then the system still creates the case if all required materials are present.
- Given the case is created successfully, when the user proceeds, then the case appears in the claims queue.

### 5.2 Claims Queue

The system must give claims officers a clear queue of submitted cases.

**Acceptance criteria:**

- Given cases exist, when the officer opens the queue, then each case displays a case reference, status, submission time, and current review state.
- Given a case has fraud concerns, when the officer views the queue, then the case is visually distinguishable from ordinary pending cases.
- Given a case is awaiting human decision, when the officer views the queue, then that status is easy to identify.
- Given the officer selects a case, when the case opens, then the officer is taken to the three-pane dashboard.

### 5.3 Live Review Progress

The system must display review progress in a way that makes the AI workflow transparent and understandable.

**Acceptance criteria:**

- Given a case is under review, when the officer opens the dashboard, then the officer can see which review stages are waiting, active, completed, challenged, or escalated.
- Given multiple review stages are being assessed, when they are active, then the dashboard communicates that work is happening in parallel where relevant.
- Given the system detects an inconsistency, when a challenge occurs, then the dashboard visibly shows the challenge and the affected review area.
- Given review completes successfully, when the officer views the dashboard, then the final recommendation is clearly marked as ready for human decision.

### 5.4 Input Evidence View

The system must let the officer inspect the raw claim materials alongside the AI-generated reasoning.

**Acceptance criteria:**

- Given uploaded documents exist, when the officer opens a case, then the documents are visible from the dashboard.
- Given crash photos exist, when the officer opens the input pane, then photo thumbnails are visible.
- Given a chat transcript was submitted, when the officer views inputs, then the transcript is accessible.
- Given a document cannot be previewed, when the officer opens it, then the system provides a clear fallback message rather than failing silently.

### 5.5 Structured Decision Blackboard

The system must present the claim reasoning in structured sections rather than a single freeform answer.

**Acceptance criteria:**

- Given case review has started, when each review section completes, then the corresponding blackboard section appears or updates.
- Given the officer reviews the blackboard, then they can distinguish case facts, coverage, liability, fraud risk, payout, and audit result.
- Given the system lacks confidence or detects missing evidence, when the blackboard updates, then the uncertainty is clearly shown.
- Given the officer needs to inspect the basis for a recommendation, then the blackboard includes concise evidence references and rationale.

### 5.6 Coverage and Liability Assessment

The system must help the officer understand whether the claim is covered and how fault is assessed.

**Acceptance criteria:**

- Given a policy document is provided, when review completes, then the system states whether the claim appears covered.
- Given relevant exclusions or excess apply, when the recommendation is shown, then those factors are visible to the officer.
- Given police, adjuster, photo, or statement evidence affects fault, when liability is shown, then the officer can see the evidence basis.
- Given evidence conflicts, when the system cannot resolve it confidently, then the case is challenged or escalated rather than presented as certain.

### 5.7 Fraud Risk Review

The system must identify and explain fraud risk indicators.

**Acceptance criteria:**

- Given no major fraud indicators are present, when review completes, then the case shows low fraud risk.
- Given fraud indicators are present, when review completes, then the system lists the specific signals in plain language.
- Given fraud risk exceeds the acceptable threshold, when the recommendation is produced, then the case is escalated rather than recommended for routine approval.
- Given a case is escalated for fraud, when the officer views it, then the escalation reason is clear enough to support handoff to investigation.

### 5.8 Payout Recommendation

The system must produce a draft payout recommendation that is understandable and reviewable by the officer.

**Acceptance criteria:**

- Given coverage, liability, repair amount, excess, NCD, and depreciation are available, when review completes, then the payout breakdown shows each component.
- Given a payout amount is recommended, then the final amount is clearly distinguished from intermediate calculations.
- Given the case should be declined or escalated, then the system does not present the payout as a routine approval.
- Given the officer challenges the payout, then the system revisits the relevant reasoning and updates the recommendation or escalates.

### 5.9 Auditor Challenge and Escalation

The system must challenge weak or inconsistent recommendations before they reach final officer approval.

**Acceptance criteria:**

- Given the system detects a contradiction in evidence or reasoning, when the review is in progress, then it triggers a visible challenge.
- Given the challenge can be resolved, when the review updates, then the revised recommendation shows what changed.
- Given the challenge cannot be resolved within the allowed limit, when review completes, then the case is escalated to the officer.
- Given a case is escalated, then the officer can see the unresolved disagreement or missing evidence.

### 5.10 Officer Decision Actions

The system must support final human decision-making.

**Acceptance criteria:**

- Given a case is awaiting decision, when the officer approves it, then the case status becomes approved and the final decision artifact is available.
- Given a case is awaiting decision, when the officer declines it without a reason, then the system requires a reason before proceeding.
- Given the officer submits a decline reason, when the decision is saved, then the case status becomes declined and the reason is retained.
- Given the officer challenges the recommendation, when the challenge is accepted, then the system updates the case status to show that review is running again.
- Given the maximum number of officer challenges has been reached, when the officer attempts another challenge, then the system prevents it and prompts the officer to approve or decline.
- Given a case review is actively running, when the officer attempts a final action, then the system blocks the action until the review is ready.

### 5.11 Decision Artifacts

The system must provide downloadable artifacts suitable for demo and operational review.

**Acceptance criteria:**

- Given a case is ready for officer decision, when artifacts are available, then the officer can download the Claim Decision PDF and audit trail.
- Given the officer approves a case, when the final PDF is generated, then it includes claim reference, incident summary, coverage assessment, liability assessment, fraud assessment, payout breakdown, and officer decision status.
- Given a case is escalated, when the officer views artifacts, then the output reflects escalation rather than routine approval.
- Given a recommendation changes after a challenge, then the final artifacts reflect the latest recommendation.

### 5.12 Demo Reliability

The product must support a credible live hackathon demo even if venue conditions are unreliable.

**Acceptance criteria:**

- Given the live review stalls during presentation, when the presenter activates fallback mode, then the dashboard continues through a prerecorded successful run.
- Given fallback mode is active, when judges watch the demo, then the experience remains visually consistent with the intended live workflow.
- Given the demo case has completed before, when replay is used, then the same claim reasoning and decision artifacts are shown.

## 6. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Standard case draft time | Under 90 seconds from submission to drafted recommendation for demo cases. |
| Officer decision time | Under 2 minutes from opening a completed case to approving, declining, or challenging. |
| Live progress responsiveness | Dashboard progress should visibly update within 1 second of a review-stage change. |
| Demo duration | End-to-end presentation flow must fit within a 3-minute stage demo. |
| Human control | No claim is final until a human officer approves or declines it. |
| Challenge limit | System-generated challenge loops and officer-triggered challenges must be bounded to prevent indefinite review. |
| Financial clarity | Payout breakdown must be explainable and auditable by a claims officer. |
| Privacy | Full IC numbers and sensitive personal identifiers should not appear unnecessarily in visible outputs, logs, or demo artifacts. |
| Recoverability | Refreshing the dashboard or briefly losing connection must not require restarting the case review. |
| Demo focus | Non-MVP features such as login, voice, analytics, and general chat must not distract from the claims officer workflow. |

Page 18 of 22

## 7. Use Case Scenario

### Scenario: Complex Liability Dispute

**Background:** A claim is submitted involving a two-vehicle collision at a junction. The driver's statement and the police report contain conflicting accounts of who had the right of way.

**The Workflow:**
1.  **Initiation:** The Claims Officer clicks "Start a new claim" on the Chat Home Page and uploads the document stack in the Manage Hub.
2.  **Parallel Analysis:** On the Workflow Canvas, the officer watches the 9-13 specialized agents—including the **Liability Agent** and **Vision AI Agent**—analyze the police sketch and vehicle impact points simultaneously. The Vision AI Agent performs deep analysis of the crash photos to determine the exact point of impact.
3.  **Surfacing Inconsistency:** The system flags a warning: the damage pattern on the vehicle (right side) contradicts the police report's description of a head-on collision.
4.  **Human Intervention:** The officer uses the **AI Strategy Chat** to ask: "Explain why the Vision AI Agent flagged a discrepancy in the impact zone."
5.  **Clarification:** The AI explains that the dent curvature suggests a side-swipe, not a direct hit.
6.  **Auditor Feedback:** The officer provides feedback: "Recalculate liability assuming the third party was changing lanes improperly based on the vision agent's findings."
7.  **Re-run:** The **Auditor Agent** triggers a re-check of the liability reasoning.
8.  **Final Decision:** The Blackboard updates to show a 70/30 liability split. The officer approves the refined decision and generates the final report.

Page 20 of 22

## 8. Product Roadmap

SettleOps AI aims to become the definitive reasoning layer for the global insurance industry.

-   **Phase 1: Ecosystem Integration:** Seamless API-level integration with Merimen eClaims and other core insurer systems to eliminate manual document uploads.
-   **Phase 2: Advanced Computer Vision:** Proprietary models for deep damage assessment, estimating repair costs directly from photos to cross-reference workshop quotations.
-   **Phase 3: Multi-Party Collaboration:** A unified portal where adjusters and workshops can interact with the AI-assisted review process in real-time.
-   **Phase 4: Predictive Fraud Network:** Aggregating anonymized cross-insurer data to identify sophisticated fraud rings and patterns across the industry.
-   **Phase 5: Automated Settlement:** End-to-end straight-through processing (STP) for routine claims with automated payout disbursement.
