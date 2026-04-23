# Claims Engine Product Requirements Document

## 1. Executive Summary

Claims Engine is an AI decision-support product for Malaysian motor insurance claims officers. It helps insurers reduce the 30-60 minute manual review step in a motor claim by reading the same claim materials a claims officer reviews today, drafting a defensible claim decision in under 90 seconds, and presenting the decision for human approval, decline, or challenge.

The product is designed to sit beside Merimen eClaims, the industry workflow platform used by Malaysian insurers, loss adjusters, and panel workshops. Claims Engine does not compete with Merimen and does not replace regulated loss adjusters. It adds an AI reasoning layer at the insurer decision step, where claims officers currently spend significant time reconciling police reports, adjuster reports, policy terms, repair quotations, crash photos, and fraud signals.

For UMHackathon 2026, the goal is to demonstrate a focused, credible claims-officer workflow: upload claim documents, watch the AI review progress in a live dashboard, inspect the structured reasoning, and finalize a Claim Decision PDF through a human-in-the-loop action.

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

Claims Engine focuses on **Step 6**, the claims officer's review and decision-drafting step.

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

This is the specific pain Claims Engine targets: not accident reporting, not workshop repair, and not loss adjustment. It targets the insurer's final manual decision-drafting bottleneck.

### 2.3 Why Claims Engine Is Feasible Now

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
- May use Claims Engine to prepare claim packets before insurer submission.

**User pain:**

- Every day a vehicle sits in a workshop creates lost revenue.
- Claim follow-up with insurers can be slow and opaque.
- Fleet teams often submit incomplete or poorly structured claim evidence.

**Desired outcome:**

Ahmad's team uploads claim materials and receives a structured draft decision packet that can reduce back-and-forth with the insurer and speed up review.

### 3.3 Loss Adjuster Positioning

Claims Engine **does not replace the licensed loss adjuster**.

The loss adjuster remains a regulated, independent professional who physically inspects the vehicle and produces the adjuster report. Claims Engine consumes the adjuster's report as a key input and operates after the adjuster's work, inside the insurer's claim decision process.

This positioning is non-negotiable for product, regulatory, and pitch credibility.

### 3.4 Additional Service Buyers

These are the commercial or operational buyers who may purchase or sponsor usage of Claims Engine. Parties that provide evidence but do not use the product directly are intentionally excluded from this PRD.

| Buyer | How they use Claims Engine |
|---|---|
| Insurer Head of Claims Operations | Buys Claims Engine to reduce review time, improve consistency, and increase claims officer throughput. |
| Claims Team Lead / Supervisor | Monitors escalated cases, reviews decision quality, and uses audit trails for coaching and governance. |
| Fleet Operations Director | Uses Claims Engine as a pre-drafting tool to submit cleaner claim packets and reduce vehicle downtime. |

## 4. Product Overview & Core Features

### 4.1 End-to-End Product Experience

Claims Engine should feel like an operations cockpit for motor claim decisions. A first-time judge should immediately understand three things: what documents entered the system, what the AI is reviewing, and what decision the human officer can safely take.

The MVP demo experience follows one claim from submission to human decision:

1. **A claim is submitted.** A demo user or fleet operator uploads the required claim materials. The product confirms that the case has been created and starts review.
2. **The case appears in the claims queue.** The officer sees the case alongside other claims, with a clear status such as running, awaiting approval, escalated, approved, or declined.
3. **The officer opens the dashboard.** The screen is divided into the raw evidence, the live review workflow, and the structured decision blackboard.
4. **The review becomes visible.** The officer can see which parts of the claim are being reviewed, which parts are complete, and whether any inconsistency has triggered a challenge.
5. **The draft decision is presented.** The system summarizes coverage, liability, fraud risk, payout, and audit result in a format that is faster to review than the original document stack.
6. **The officer remains in control.** The officer approves, declines with a reason, or challenges a specific part of the reasoning.
7. **The output is generated.** The officer can download the Claim Decision PDF and audit trail for handoff, record keeping, or demo proof.

Claims Engine has three primary product surfaces for the MVP demo:

1. **Document upload experience** for submitting claim materials.
2. **Claims queue** for officers to view submitted cases and their current status.
3. **Three-pane claims officer dashboard** for reviewing live AI progress, structured reasoning, and final decision actions.

The hero experience is the claims officer dashboard. It must make clear that Claims Engine is not a chatbot; it is a decision-support workflow that turns messy claim documents into a structured, reviewable decision draft.

### 4.2 Document Upload Experience

The upload experience should be simple enough for a hackathon demo but realistic enough for judges to believe it maps to a real insurer workflow. The user should understand which documents are required, which are optional, and what happens after submission.

The upload experience allows a demo user or fleet operator to submit the core claim materials:

- Police report.
- Policy schedule or cover note.
- Repair quotation.
- Crash photos.
- Adjuster report, if available.
- Optional driver chat transcript or informal statement.

After submission, the system creates a case and begins reviewing the claim. The user receives clear confirmation that the case has entered the review workflow. The confirmation should show the case reference, current status, and next step so the presenter can smoothly move from upload to officer review.

### 4.3 Claims Queue

The claims queue is the officer's landing page. It lists submitted cases with practical status information so the officer can quickly identify which cases are pending, running, escalated, awaiting approval, approved, declined, or failed.

The queue should make the product feel like an insurer operations tool, not a standalone demo page. A good queue experience lets Siti scan her workload in seconds:

- Which cases are ready for her decision.
- Which cases are still being reviewed.
- Which cases carry fraud or escalation signals.
- Which cases have already been approved or declined.
- Which case should be opened next.

### 4.4 Three-Pane Claims Officer Dashboard

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

### 4.5 Human-in-the-Loop Review

Every AI-drafted decision is provisional. The officer remains the final decision-maker.

The system supports three human actions:

- **Approve:** The officer accepts the draft and finalizes the decision.
- **Decline:** The officer rejects the claim and records a reason.
- **Challenge:** The officer questions a specific part of the reasoning, such as fault percentage, coverage, fraud risk, or payout amount. The system then revisits the relevant portion of the review and updates the recommendation.

The system must limit repeated challenges so the workflow cannot run indefinitely. When uncertainty remains unresolved, the system must escalate rather than force an unsupported decision.

### 4.6 Output Artifacts

Claims Engine produces two primary outputs:

- **Claim Decision PDF:** A formal decision document containing claim reference, incident summary, coverage rationale, liability assessment, fraud assessment, payout breakdown, challenge history, and officer decision status.
- **Structured audit trail:** A review record showing what the system considered, what it concluded, where it found uncertainty, and what the officer did.

These outputs are designed for review, compliance support, and operational handoff. They are not a replacement for insurer approval controls.

### 4.7 Feature Comparison with Alternatives

Claims Engine should be positioned against adjacent tools and likely judge comparisons. The clearest message is: existing tools move documents, estimate damage, or provide generic automation; Claims Engine drafts the insurer-side claim decision with visible reasoning and human control.

| Capability | Claims Engine | Merimen eClaims | Generic chatbot | Workflow automation tools | Visual damage AI |
|---|---|---|---|---|---|
| Malaysian motor claim decision support | **Yes. Built around insurer claim review.** | Partial. Manages claim workflow and document exchange. | No. Requires manual prompting and lacks claim workflow context. | No. Automates predefined steps but does not reason over claim evidence. | No. Focuses on vehicle damage images. |
| Claims officer dashboard | **Yes. Queue, evidence, review progress, blackboard, actions.** | Yes for workflow operations, not AI decision drafting. | No. Chat interface only. | No dedicated claims officer cockpit. | No. Usually image-assessment focused. |
| Multi-document evidence review | **Yes. Police report, policy, repair quotation, photos, adjuster report, chat.** | Stores and routes documents. | Possible but unstructured and not workflow-safe. | Limited unless every rule is manually configured. | Usually limited to images. |
| Policy, liability, fraud, and payout reasoning | **Yes. Combined into one decision draft.** | Not the core product promise. | Possible in text but not controlled or auditable enough. | Rule-based only; weak for unstructured evidence. | No. |
| Visible challenge / audit behavior | **Yes. Shows contradictions and escalates uncertainty.** | No AI reasoning challenge layer. | No reliable internal challenge workflow. | No unless custom-built. | No. |
| Human-in-the-loop final decision | **Yes. Officer approves, declines, or challenges.** | Yes as workflow owner, but not AI decision support. | Human decides outside the tool. | Depends on configuration. | Usually reviewer validates image estimate. |
| Strategic role | **AI reasoning layer beside Merimen.** | Industry workflow backbone. | General assistant. | Process automation layer. | Damage assessment point solution. |

## 5. Scope Boundaries

### 5.1 In Scope for the MVP Demo

The MVP demo includes:

- Claims queue for officer case selection.
- Document upload flow for demo claim submission.
- Three-pane claims officer dashboard.
- Live progress display for the AI review workflow.
- Review of police report, policy document, repair quotation, crash photos, and optional adjuster report or chat transcript.
- Structured decision blackboard showing facts, coverage, liability, fraud, payout, and audit result.
- AI-drafted claim decision produced in under 90 seconds for standard demo cases.
- Visible challenge behavior when the system detects inconsistent reasoning.
- Fraud risk flagging and escalation.
- Officer actions: approve, decline with reason, and challenge.
- Claim Decision PDF generation and download.
- Structured audit trail download.
- Recovery of the current case view after page refresh or temporary connection loss.
- Cached replay fallback for the hackathon presentation.
- Two primary demo cases: happy path and fraud catch.
- One optional demo case: auditor challenge correcting a flawed recommendation.

### 5.2 Out of Scope for the MVP Demo

The MVP demo excludes:

- Replacing licensed loss adjusters.
- Real Merimen production integration.
- Real insurer system integration.
- Payment processing or fund disbursement.
- Native mobile app.
- Production user authentication, account management, or multi-tenancy.
- Full analytics dashboard.
- Push notifications, email workflows, or messaging integrations.
- Voice-note transcription.
- Bahasa Malaysia output.
- Automated damage cost estimation from photos.
- Multi-insurer policy support.
- Historical claims database.
- Production-grade data retention, audit storage, or enterprise access controls.
- Rebuilding MySettle's police-report or identity-verification flow.

### 5.3 Scope Rationale

The hackathon product must demonstrate depth, not breadth. The core proof is that Claims Engine can convert messy claim evidence into a structured, challengeable, human-reviewed decision draft. Features that do not strengthen that proof are deferred.

## 6. Functional Requirements

### 6.1 Claim Submission

The system must allow a user to submit claim materials and start a new review case.

**Acceptance criteria:**

- Given the required claim documents are provided, when the user submits the case, then the system creates a new claim case and confirms that review has started.
- Given a required document is missing, when the user attempts submission, then the system shows a clear validation message.
- Given optional documents are not provided, when the user submits, then the system still creates the case if all required materials are present.
- Given the case is created successfully, when the user proceeds, then the case appears in the claims queue.

### 6.2 Claims Queue

The system must give claims officers a clear queue of submitted cases.

**Acceptance criteria:**

- Given cases exist, when the officer opens the queue, then each case displays a case reference, status, submission time, and current review state.
- Given a case has fraud concerns, when the officer views the queue, then the case is visually distinguishable from ordinary pending cases.
- Given a case is awaiting human decision, when the officer views the queue, then that status is easy to identify.
- Given the officer selects a case, when the case opens, then the officer is taken to the three-pane dashboard.

### 6.3 Live Review Progress

The system must display review progress in a way that makes the AI workflow transparent and understandable.

**Acceptance criteria:**

- Given a case is under review, when the officer opens the dashboard, then the officer can see which review stages are waiting, active, completed, challenged, or escalated.
- Given multiple review stages are being assessed, when they are active, then the dashboard communicates that work is happening in parallel where relevant.
- Given the system detects an inconsistency, when a challenge occurs, then the dashboard visibly shows the challenge and the affected review area.
- Given review completes successfully, when the officer views the dashboard, then the final recommendation is clearly marked as ready for human decision.

### 6.4 Input Evidence View

The system must let the officer inspect the raw claim materials alongside the AI-generated reasoning.

**Acceptance criteria:**

- Given uploaded documents exist, when the officer opens a case, then the documents are visible from the dashboard.
- Given crash photos exist, when the officer opens the input pane, then photo thumbnails are visible.
- Given a chat transcript was submitted, when the officer views inputs, then the transcript is accessible.
- Given a document cannot be previewed, when the officer opens it, then the system provides a clear fallback message rather than failing silently.

### 6.5 Structured Decision Blackboard

The system must present the claim reasoning in structured sections rather than a single freeform answer.

**Acceptance criteria:**

- Given case review has started, when each review section completes, then the corresponding blackboard section appears or updates.
- Given the officer reviews the blackboard, then they can distinguish case facts, coverage, liability, fraud risk, payout, and audit result.
- Given the system lacks confidence or detects missing evidence, when the blackboard updates, then the uncertainty is clearly shown.
- Given the officer needs to inspect the basis for a recommendation, then the blackboard includes concise evidence references and rationale.

### 6.6 Coverage and Liability Assessment

The system must help the officer understand whether the claim is covered and how fault is assessed.

**Acceptance criteria:**

- Given a policy document is provided, when review completes, then the system states whether the claim appears covered.
- Given relevant exclusions or excess apply, when the recommendation is shown, then those factors are visible to the officer.
- Given police, adjuster, photo, or statement evidence affects fault, when liability is shown, then the officer can see the evidence basis.
- Given evidence conflicts, when the system cannot resolve it confidently, then the case is challenged or escalated rather than presented as certain.

### 6.7 Fraud Risk Review

The system must identify and explain fraud risk indicators.

**Acceptance criteria:**

- Given no major fraud indicators are present, when review completes, then the case shows low fraud risk.
- Given fraud indicators are present, when review completes, then the system lists the specific signals in plain language.
- Given fraud risk exceeds the acceptable threshold, when the recommendation is produced, then the case is escalated rather than recommended for routine approval.
- Given a case is escalated for fraud, when the officer views it, then the escalation reason is clear enough to support handoff to investigation.

### 6.8 Payout Recommendation

The system must produce a draft payout recommendation that is understandable and reviewable by the officer.

**Acceptance criteria:**

- Given coverage, liability, repair amount, excess, NCD, and depreciation are available, when review completes, then the payout breakdown shows each component.
- Given a payout amount is recommended, then the final amount is clearly distinguished from intermediate calculations.
- Given the case should be declined or escalated, then the system does not present the payout as a routine approval.
- Given the officer challenges the payout, then the system revisits the relevant reasoning and updates the recommendation or escalates.

### 6.9 Auditor Challenge and Escalation

The system must challenge weak or inconsistent recommendations before they reach final officer approval.

**Acceptance criteria:**

- Given the system detects a contradiction in evidence or reasoning, when the review is in progress, then it triggers a visible challenge.
- Given the challenge can be resolved, when the review updates, then the revised recommendation shows what changed.
- Given the challenge cannot be resolved within the allowed limit, when review completes, then the case is escalated to the officer.
- Given a case is escalated, then the officer can see the unresolved disagreement or missing evidence.

### 6.10 Officer Decision Actions

The system must support final human decision-making.

**Acceptance criteria:**

- Given a case is awaiting decision, when the officer approves it, then the case status becomes approved and the final decision artifact is available.
- Given a case is awaiting decision, when the officer declines it without a reason, then the system requires a reason before proceeding.
- Given the officer submits a decline reason, when the decision is saved, then the case status becomes declined and the reason is retained.
- Given the officer challenges the recommendation, when the challenge is accepted, then the system updates the case status to show that review is running again.
- Given the maximum number of officer challenges has been reached, when the officer attempts another challenge, then the system prevents it and prompts the officer to approve or decline.
- Given a case review is actively running, when the officer attempts a final action, then the system blocks the action until the review is ready.

### 6.11 Decision Artifacts

The system must provide downloadable artifacts suitable for demo and operational review.

**Acceptance criteria:**

- Given a case is ready for officer decision, when artifacts are available, then the officer can download the Claim Decision PDF and audit trail.
- Given the officer approves a case, when the final PDF is generated, then it includes claim reference, incident summary, coverage assessment, liability assessment, fraud assessment, payout breakdown, and officer decision status.
- Given a case is escalated, when the officer views artifacts, then the output reflects escalation rather than routine approval.
- Given a recommendation changes after a challenge, then the final artifacts reflect the latest recommendation.

### 6.12 Demo Reliability

The product must support a credible live hackathon demo even if venue conditions are unreliable.

**Acceptance criteria:**

- Given the live review stalls during presentation, when the presenter activates fallback mode, then the dashboard continues through a prerecorded successful run.
- Given fallback mode is active, when judges watch the demo, then the experience remains visually consistent with the intended live workflow.
- Given the demo case has completed before, when replay is used, then the same claim reasoning and decision artifacts are shown.

## 7. Non-Functional Requirements

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

## 8. Demo Scenarios

### 8.1 Happy Path: Standard Rear-End Collision

**User story:** As Siti, I want Claims Engine to draft a routine approval for a clear rear-end collision so I can approve it quickly.

**Flow:**

1. A new claim appears in the claims queue.
2. Siti opens the case and sees the uploaded police report, policy document, repair quotation, crash photos, and adjuster report.
3. The dashboard shows the AI review stages completing in real time.
4. The blackboard shows that the third-party driver was cited by police, the damage pattern supports a rear-end collision, coverage applies, fraud risk is low, and the recommended payout is RM 4,200.
5. The system indicates the recommendation is ready for human decision.
6. Siti reviews the summary and clicks Approve.
7. The final Claim Decision PDF becomes available.

**Demo point:** Claims Engine turns a routine 30-60 minute review into a short supervised approval.

### 8.2 Auditor Challenge: Inconsistent Photo Evidence

**User story:** As Siti, I want the system to catch inconsistencies before I approve a flawed decision.

**Flow:**

1. A new claim is reviewed and initially appears to support a rear-end collision.
2. The system identifies that a cited photo does not match the stated impact direction.
3. The dashboard visibly shows a challenge against the liability reasoning.
4. The liability assessment is revised to reflect the inconsistency.
5. The payout recommendation updates based on the revised fault assessment.
6. The final review result explains what changed and why.
7. Siti inspects the disagreement log and makes the final decision.

**Demo point:** The system does not merely generate a confident answer; it challenges its own weak reasoning and makes disagreement visible.

### 8.3 Fraud Catch and Escalation

**User story:** As Siti, I want high-risk claims to be escalated with clear reasons instead of being routed for routine approval.

**Flow:**

1. A new claim enters the queue.
2. The system reviews the documents and identifies fraud indicators, such as very recent policy purchase, inconsistent photo timing, and repeated claim history.
3. The case is marked as high risk in the dashboard.
4. The blackboard lists the specific fraud signals in plain language.
5. The recommendation becomes Escalate rather than Approve.
6. Siti routes the case to further investigation instead of approving payment.

**Demo point:** Claims Engine adds value beyond speed by surfacing fraud risk that may be missed in rushed manual review.

### 8.4 Fleet Self-Service Pre-Drafting

**User story:** As Ahmad, I want to prepare a structured claim packet before insurer submission so my fleet vehicle can return to service faster.

**Flow:**

1. Ahmad's team uploads the police report, repair quotation, photos, and available claim documents.
2. Claims Engine produces a draft decision packet.
3. Ahmad's team attaches the structured output to the insurer submission.
4. The insurer's claims officer receives a cleaner, pre-analyzed case.
5. The claim requires fewer clarification cycles and moves faster toward approval or escalation.

**Demo point:** The product can support both insurer-side operations and fleet-side pre-submission workflows.

## 9. Success Criteria

### 9.1 Hackathon Success Criteria

The UMHackathon 2026 demo is successful if:

- The live demo completes within 3 minutes without visible product failure.
- The dashboard clearly shows a multi-stage AI review workflow, not a simple chatbot.
- Judges see at least one visible challenge or disagreement resolved by the system.
- A Claim Decision PDF is generated and downloadable during the demo.
- The product story clearly positions Claims Engine as a Merimen-complementary AI reasoning layer.
- The team can confidently explain that Claims Engine does not replace licensed loss adjusters.
- The demo communicates concrete business value: faster review, better consistency, clearer fraud escalation, and human-controlled decisions.

### 9.2 Long-Term Product Success Criteria

If continued beyond the hackathon, Claims Engine should aim to achieve:

- Reduce claims officer review time from 30-60 minutes to under 5 minutes per claim.
- Reduce overall motor claim cycle time from 2-4 weeks to 5-10 working days for suitable cases.
- Achieve at least 90% agreement with experienced claims officers on back-tested routine cases.
- Surface at least 2 genuine fraud attempts per 1,000 claims reviewed.
- Complete a pilot with at least one Malaysian insurer or fleet operator.
- Establish a strategic integration or partnership path with Merimen or Merimen-connected insurers.
- Demonstrate a credible commercial model, such as per-claim insurer pricing or fleet subscription pricing.
