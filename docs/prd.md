# Product Requirements Document

---

## 1. Executive summary

A Malaysian motor insurance claim takes 2 to 4 weeks to process. During that time, the claimant's vehicle sits in a workshop and a claims officer inside the insurer spends 30 to 60 minutes per claim manually reviewing documents — a police report, a licensed loss adjuster's inspection report, the workshop's requested repair price, and the customer's specific Policy Schedule & Cover Note — before deciding whether to approve, partially approve, or escalate the claim.

Our product, **Claims Engine**, is an AI decision-support layer that sits on the claims officer's side of this workflow. Six specialized AI agents read the same documents a claims officer reads, reason over policy coverage, fault determination, fraud signals, and payout calculation, and draft a complete claim decision in under 90 seconds — including an adversarial Auditor agent that challenges the draft before it reaches the officer. The officer reviews and approves in 30 seconds instead of 30 minutes, turning a major throughput bottleneck into a supervised checkpoint.

Claims Engine is designed to plug into Merimen eClaims — the platform 120+ Malaysian insurers, 500+ licensed loss adjusters, and 5,000+ workshops already use to manage the claims workflow. We do not compete with Merimen; we add the AI reasoning layer Merimen doesn't yet provide.

This is Team spectrUM's continuation of last year's MySettle project. MySettle digitized the police-report step at the accident scene. Claims Engine automates the decision-drafting step inside the insurer two weeks later. Together they cover the two most painful, most manual points in the full incident lifecycle.

---

## 2. Why this product exists

### 2.1 The real Malaysian motor insurance claim workflow

Understanding the actual workflow is essential. Every team member must be able to recite this. There are eight steps and six parties:

1. **Accident happens.** Driver takes photos, exchanges details with the other driver, and calls their insurer's hotline (within minutes).

2. **Driver lodges a police report** at the nearest police station within 24 hours, as required by Section 52(2) of the Road Transport Act. The police investigate and determine fault. The driver receives a **police report** and, later, the **police investigation result**. *(This is what MySettle digitizes.)*

3. **Driver notifies the insurer within 7 days** and selects the claim type: Own Damage (OD) if at fault, Third Party (TP) if the other driver is at fault, or Own Damage Knock-for-Knock (OD-KFK) when the other driver is at fault but the claimant claims on their own policy for faster processing while keeping their NCD.

4. **Driver sends vehicle to a PIAM-approved panel workshop.** The workshop inspects the damage and produces a **repair quotation** listing parts, labour, and estimated repair days. Non-panel workshops can void the claim.

5. **Insurer appoints a licensed loss adjuster.** This is a regulated, independent profession in Malaysia. The adjuster physically inspects the vehicle, reads the police report, reviews the workshop's quotation, and produces a formal **adjuster's report** with photos, damage assessment, fault corroboration, and recommended repair scope and cost. This report is the single most important document in the whole workflow.

6. **The insurer's claims officer reviews the adjuster's report + police report + policy schedule** and decides: approve, partial approve, decline, or escalate for fraud investigation. They cross-check policy coverage (via Insurance Source API), apply excess, NCD, and depreciation, and issue the **discharge voucher** the driver must sign to release payment. *(This is where Claims Engine sits.)*

7. **Approved repairs commence** within 15 working days at the panel workshop. Bank Negara Malaysia's policy requires status updates every 14 working days.

8. **Insurer pays the workshop directly** upon signed discharge voucher. NCD records are updated. The claim closes.

### 2.2 The six parties involved

Every team member must know these by name:

| Party | Role in the workflow |
|---|---|
| **Driver / policyholder** | Source of inputs (photos, statement, police report). Not a direct user of our product. |
| **Police (PDRM)** | Produces the police report and investigation outcome used as primary fault evidence. |
| **Panel workshop** | PIAM-approved repair shop that inspects the vehicle and produces the repair quotation. |
| **Loss adjuster** | Independent licensed professional appointed by the insurer to physically inspect the car and produce the adjuster's report. **We do not replace this role — it is regulated.** |
| **Insurer's claims officer** | Sits inside the insurance company. Reviews adjuster report + policy + police report, decides the claim. **This is Claims Engine's primary user.** |
| **Merimen eClaims** | The digital platform (Malaysian company, Seri Kembangan, founded 2005) that connects all the above parties. Used by 120+ Malaysian insurers, 500+ adjusters, 5,000+ workshops. The industry's de facto workflow backbone. **We plug into Merimen, we don't replace it.** |

### 2.3 The specific pain Claims Engine solves

Everything from steps 1 to 5 above has existing digital tooling: MySettle (step 2), insurer apps (step 3), Merimen (steps 4–5 paperwork flow). **Step 6 — the claims officer's manual review and decision drafting — remains almost entirely manual.**

A typical Malaysian motor insurance claims officer today:

- Opens the claim in Merimen
- Downloads and reads the police report (5–10 min)
- Downloads and reads the adjuster's report (10–15 min)
- Cross-references the Policy Schedule and Cover Note to verify specific coverage terms, excess, and vehicle details (3–5 min)
- Checks NCD, excess, depreciation schedule (3–5 min)
- Runs mental fraud pattern checks (claim frequency, policy age, damage-narrative consistency) (2–5 min)
- Computes payout arithmetic (2–3 min)
- Writes the decision narrative and issues the discharge voucher (3–5 min)
- Updates Merimen with the decision

Total: **30–60 minutes per claim**. Malaysian insurers process roughly 900,000 motor claims per year. At even 30 minutes per claim and a loaded labour cost of RM 200/hour for a trained claims officer, that is RM 90 million/year of manual review labour industry-wide.

### 2.4 Why this pain has not been solved yet

Three conditions had to converge, and only converged in 2024:

- **LLMs can reliably extract structured data from Malaysian police reports and insurance policy PDFs** — this was unreliable in 2022.
- **Vision-capable LLMs can reason about damage direction from crash photos** well enough to corroborate a fault narrative, not estimate cost (damage cost estimation is still unreliable without insurer-proprietary training data).
- **Inference costs** dropped to under RM 2 per claim processed, versus RM 100–200 of claims-officer labour per manual claim.

Merimen themselves have publicly stated they are working toward AI-driven claim decisioning and fraud detection (via their Truesight product), but have not shipped this capability yet. There is a clear window.

### 2.5 Why this fits the hackathon brief

UMHackathon 2026 Domain 1 asks for AI systems with multi-step workflow orchestration, unstructured input handling, multi-agent coordination, stateful decision-making, structured actionable outputs, and graceful handling of real-world constraints. Claims Engine demonstrates every dimension naturally:

| Brief requirement | How Claims Engine demonstrates it |
|---|---|
| Multi-step workflow orchestration | 6-agent pipeline with deterministic routing, parallel execution, and a conditional feedback loop |
| Unstructured inputs | Police report PDFs, adjuster report PDFs, policy PDFs, crash photos, WhatsApp chat, all in Malay and English |
| Multi-agent coordination | Policy, Liability, and Fraud agents run in parallel and hand off to Payout; Auditor agent adversarially challenges Payout |
| Stateful decision-making | Case state persists across agent invocations and across the Auditor challenge loop |
| Structured actionable output | Signed Claim Decision PDF, JSON audit trail, machine-readable payout breakdown |
| Real-world constraints | Hallucination containment via Pydantic contracts, malformed-input recovery, disagreement resolution via Auditor, human escalation after 2 unresolved loops |

---

## 3. Users and stakeholders

### 3.1 Primary user: the insurer's claims officer

**Name:** Siti Noraini binti Hamid
**Role:** Senior Claims Officer at a major Malaysian general insurer
**Location:** insurer's head office, Kuala Lumpur
**Daily reality:** processes 15–25 motor claims per day, each requiring 30–60 minutes of document review. Works inside Merimen eClaims all day. Reports to a Claims Operations Manager who is graded on settlement cycle time (a KPI Bank Negara Malaysia scrutinizes).

**Pain:**
- Too many claims, too little time per claim
- Documents arrive at different times, making context-switching expensive
- Fraud detection relies on memory and intuition, not systematic analysis
- Monthly performance measured on both speed and accuracy — a hard trade-off today

**For Siti, Claims Engine is not a replacement.** It is a first-pass drafter. She opens a claim in Claims Engine (integrated via Merimen API), reviews the 90-second AI-drafted decision, and either approves in 30 seconds or clicks into the reasoning to override. Her daily throughput goes from 25 claims to 60+. Her accuracy goes up because the Auditor agent catches flaws she would have missed in a rushed review.

### 3.2 Secondary user: the fleet operations manager

**Name:** Ahmad bin Rashid
**Role:** Operations Manager at KLFleet Sdn Bhd
**Fleet:** 200 vehicles across car rental and e-hailing partnership
**Office:** Shah Alam

Ahmad is not the primary user, but he is a meaningful secondary user because fleet operators have a *direct interest* in claims moving faster — every day a fleet vehicle sits in a workshop costs ~RM 120 of lost rental revenue. With ~26 accidents per year across his fleet, annual downtime cost runs RM 30,000–65,000.

Fleets can either (a) push their insurers to adopt Claims Engine, or (b) use Claims Engine themselves as a self-service claim-preparation tool that pre-drafts decisions before submission, reducing back-and-forth with their insurer. Both paths close deals.

Ahmad has direct approval authority for tools up to RM 2,000/month.

### 3.3 The loss adjuster

The licensed loss adjuster remains a regulated, independent professional in Malaysia. Claims Engine does not replace them and must not be pitched as replacing them. The adjuster continues to physically inspect the car and produce the adjuster's report. **Claims Engine consumes the adjuster's report as an input** — we augment the step *after* the adjuster, inside the insurer.

This positioning is non-negotiable. Judges who know the Malaysian insurance industry will ask. Saying we replace adjusters would be technically wrong, regulatorily incorrect, and would puncture the pitch.

### 3.4 The driver

The driver of the crashed vehicle is the *source* of the upstream inputs Claims Engine ultimately processes. They interact with MySettle at the accident scene, not with Claims Engine directly. For the demo we show a simplified driver-side mobile view to illustrate where the inputs originate, but the core product is claims-officer-facing.

### 3.5 The buyer

| Buyer | Why they buy | Procurement speed |
|---|---|---|
| **Insurer Head of Claims Operations** | Reduces claim cycle time (a BNM KPI) and adjuster cost per claim | 3–6 months (enterprise, but fast because BNM pressure is active) |
| **Fleet Operations Director** | Reduces vehicle downtime; RM 30k+ annual savings for 200-vehicle fleet | 2–6 weeks (SMB, fast) |
| **Merimen (partnership, not buyer)** | Could bundle Claims Engine as an add-on to their eClaims platform | Strategic partnership conversation |

---

## 4. Product overview

### 4.1 The one-sentence description

Claims Engine is a web-based AI decision-support system that reads a Malaysian motor insurance claim's documents (police report, adjuster's report, policy PDF, repair quotation, crash photos) and produces a drafted claim decision in under 90 seconds, via six specialized AI agents coordinated by LangGraph and including an adversarial auditor.

### 4.2 How it fits into the existing workflow

```
Driver → Police → Workshop → Adjuster → [Claims Engine drafts] → Claims Officer approves → Payment
            (MySettle)                    (new — this product)     (Merimen integration)
```

Claims Engine is inserted at step 6 of the 8-step workflow described in section 2.1. It receives the adjuster's report (via Merimen API in production, via manual upload in the hackathon demo), along with the policy PDF, the police report, and the workshop's repair quotation. It outputs a drafted decision packet that the claims officer reviews.

### 4.3 What the user sees

Two interfaces share one backend:

**Claimant / fleet submission view** — a mobile-responsive web page where a driver or fleet ops person uploads the accident documents and triggers a claim. In a real insurer deployment this would be replaced by a Merimen API integration, but for the demo it lets us show where inputs originate.

**Claims officer dashboard** — a desktop 3-pane web interface where Siti (or Ahmad, if a fleet is using it directly) watches the six agents work on a claim in real time, then approves or overrides the drafted decision. **This is the hero screen of the demo.**

### 4.4 The 3-pane claims officer dashboard

This is the single most important UI element in the product. Every team member must understand it deeply.

**Left pane (approximately 25% width) — Inputs**

Displays the raw messy inputs as they arrive: the police report PDF preview, the adjuster's report PDF preview, thumbnail previews of crash photos, the policy PDF, the WhatsApp chat transcript if provided. This pane represents "the stack of documents on Siti's desk today." Its job is to create contrast with the middle and right panes — to show the mess the AI is resolving.

**Middle pane (approximately 50% width) — Live agent workflow**

A horizontal node graph showing the six agents as interactive nodes with labeled connections. Each node has three visual states: idle (gray), active (pulsing, colored), done (solid, colored). When data passes between nodes, a small particle or line animation travels along the edge. When the Auditor agent challenges the Payout agent, an arrow visibly animates *backward* from Auditor to the challenged upstream agent.

**This pane is the proof that we built a workflow, not a chatbot.** When judges ask "where's the workflow?" we point here.

**Right pane (approximately 25% width) — Blackboard**

A live structured-view display of the shared case state. As each agent completes, its output appears as a new section: CaseFacts, PolicyVerdict, LiabilityVerdict, FraudAssessment, PayoutRecommendation, AuditResult. The claims officer can scroll through to inspect any agent's reasoning. At the bottom, the final Claim Decision PDF preview with "Approve" and "Override" buttons.

### 4.5 The six AI agents

Every agent has one specific job, one input contract, and one output contract. No agent improvises outside its contract. This is the architectural decision that prevents hallucination cascades.

| Agent | Role | Why this agent exists as a separate unit |
|---|---|---|
| **Intake** | Reads all raw inputs (Police report, Repot Keputusan, photos, unstructured evidence, workshop price) and produces a structured CaseFacts object | Separates the parsing problem from the reasoning problem. If parsing fails, reasoning never starts. |
| **Policy** | Fetches and reads the Policy Schedule and Cover Note (via Insurance Source API) alongside CaseFacts to determine coverage, exclusions, excess, and NCD rules. | Utilizing an API to fetch the exact schedule is how real insurers work, skipping the need to parse generic 40-page booklets. |
| **Liability** | Determines fault percentage using the police verdict + adjuster's report + chat + photos (calls the vision tool) | Fault determination is evidence-weighing, which is different from policy reading. Requires multi-source reasoning. |
| **Fraud** | Scores suspicion using heuristics (policy age, photo metadata, claim frequency) plus LLM judgment over narrative inconsistency | Fraud detection has an **adversarial posture** that conflicts with a "pay the claim" mindset. Separating it ensures the system is never emotionally aligned with the claimant. |
| **Payout** | Reconciles Policy + Liability + Fraud verdicts and computes the final payout number | Reconciliation of conflicting inputs is its own reasoning task. Arithmetic is done in Python, not by the LLM, for deterministic accuracy. |
| **Auditor** | Reads the Payout recommendation and all upstream verdicts. It approves, challenges internally, OR issues a "Request for Clarification" back to the Adjuster if critical info is missing. | This adversarial check prevents the "all agents agree wrongly" failure mode and allows the workflow to loop back to human adjusters when evidence is inadequate. |

**The Auditor / Adjuster loop:** If the Auditor challenges (e.g. "the Liability agent cited photo 2 as rear-impact damage but photo 2 shows front damage"), the graph routes back to the challenged agent, which re-runs with the Auditor's feedback included in its prompt. If the problem is missing or contradictory evidence from the field, the workflow pauses and sends a **Request if needed & missing** back to the human Adjuster. Maximum 2 internal loops. After 2 unresolved challenges, the case escalates to the human claims officer with the full disagreement bundled for review. This looping is *visible in the middle pane* and is the demo's wow moment.

### 4.6 Inputs and outputs

**Inputs accepted:**
- **Police Report (PDF):** MySettle-style format, or any Malaysian police accident report.
- **Repot Keputusan >> 3-6 Crash Photos:** The official investigation result linked with visual evidence of the damage.
- **Workshop Price:** The repair cost quotation proposed by the workshop.
- **Any Unstructured Evidence:** WhatsApp driver chat transcripts, informal statements, or voicenotes.
- **Adjuster Report (PDF):** The licensed professional's physical inspection details and recommended scope.
- **Insurance Source API:** A direct data feed providing the customer's specific Policy Schedule and Cover Note, bypassing unstructured 40-page policy booklets.

**Output produced:**
- **Claim Decision PDF** — formally formatted with: claim reference, extracted structured facts, policy clause citation with verbatim text, fault determination with evidence references, fraud risk assessment, payout breakdown (base repair cost, liability-adjusted amount, excess deducted, NCD adjustment, depreciation, final payout), Auditor challenge log, timestamps, and agent attribution per decision
- **JSON audit trail** — machine-readable log of every agent invocation, input, output, and timing, for record-keeping and regulatory compliance

---

## 5. Scope — what is and is not in this version

### 5.1 In scope for the hackathon

- Web application with 2 views: input submission, claims officer dashboard
- 6 agents implemented in LangGraph with Pydantic contracts
- Vision tool used by Liability agent for photo corroboration of fault direction
- Auditor challenge loop with max 2 iterations, then human escalation
- Demo dataset: fabricated MySettle-style police report, fabricated adjuster's report, real publicly-available insurance policy PDF, 3 staged crash photos, WhatsApp chat transcript, repair quotation
- Two demo cases: the happy path (Auditor approves after one loop) and the fraud catch (Fraud agent flags, Auditor forces escalation)
- Cached replay mode: on-stage fallback if live API fails during demo
- Pitch deck, 3-minute live demo, and Q&A preparation

### 5.2 Explicitly NOT in scope

Every item here is something a teammate will propose adding during build week. **All are cut.** If it's not written in section 5.1, it is post-hackathon work. The team refers anyone proposing additions to this list.

- Native mobile application (no Expo, no React Native, no app store)
- Voice-note transcription of the driver — text chat transcript only
- Damage cost estimation in ringgit from photos — we corroborate direction of impact only, not cost
- Replacing the licensed loss adjuster — we consume their report as input
- Real asynchronous message bus, Redis pub/sub, or distributed actor system — we use LangGraph's synchronous execution with parallel nodes
- Rebuilding MySettle's QR handshake or MyDigital ID verification flow
- Multi-insurer support — one insurer's policy format only for the demo
- Bahasa Malaysia output — English only for v1; BM is a v2 feature
- User authentication, multi-tenancy, or account management
- Real API integration with Merimen, any insurer system, or any claim submission gateway — we mock the integration surface
- Payment processing or fund disbursement
- Historical claims database or analytics dashboard
- Mobile push notifications, email sending, or third-party messaging integrations
- Automated Merimen data ingestion — we use file upload in the demo

### 5.3 Rationale for scope cuts

The hackathon grades on a coherent demonstration of agentic workflow automation, not on breadth of features. A deep 3-pane dashboard with 6 visibly coordinating agents beats a broad product with 15 half-working features. Every feature added beyond 5.1 costs a day of build time and adds a failure surface during the live demo.

---

## 6. Core features

### 6.1 Feature 1 — Multi-document ingestion with Pydantic-validated extraction

Claims Engine accepts four distinct document types in a single submission: the police report, the adjuster's report, the insurance policy, and the workshop quotation, plus supplementary crash photos and chat transcript. The Intake agent uses pdfplumber (with pypdf and OCR fallbacks) to extract text, then structures everything into a single Pydantic-validated CaseFacts object that downstream agents consume. This is the foundation — if parsing fails, the system fails fast with a clear error rather than hallucinating forward.

### 6.2 Feature 2 — Six-agent coordinated reasoning pipeline

The core of the product. Intake feeds Policy + Liability + Fraud running in parallel (via asyncio.gather), whose outputs feed Payout, whose output is adversarially reviewed by Auditor. The graph is defined declaratively in LangGraph with strict state typing. This is what judges see animating in the middle pane of the dashboard.

### 6.3 Feature 3 — Adversarial Auditor with bounded feedback loop

The Auditor agent has an explicitly adversarial prompt: find flaws in the upstream reasoning. When it challenges, the graph routes backward to the challenged agent, which re-runs with the challenge text injected into its prompt. A hard ceiling of 2 loops prevents infinite oscillation. After 2 unresolved challenges, the system escalates to a human. This is the "reliable failure" guarantee — the system either produces a defensible decision, or explicitly flags its own uncertainty.

### 6.4 Feature 4 — Live 3-pane dashboard with SSE streaming

The claims officer watches agents work in real time. Left pane shows inputs. Middle pane (React Flow) animates the agent graph as each node transitions from idle to active to done. Right pane streams structured outputs to the Blackboard as agents complete. Backend pushes state changes via Server-Sent Events. This is the feature that converts "chatbot" skepticism into "workflow automation" belief.

### 6.5 Feature 5 — Structured Claim Decision PDF output

A formally formatted, downloadable PDF that mirrors the structure of a real Malaysian motor insurance claim decision letter: insurer letterhead, claim reference, structured facts, policy clause citations, fault determination, payout breakdown, signature line. Plus a parallel JSON audit trail. This is the "structured actionable output" the brief requires.

### 6.6 Feature 6 — Fraud detection with adversarial framing

The Fraud agent scores suspicion independently of the payout-approval mindset. It combines deterministic heuristics (policy age under 30 days, photo metadata vs. incident time, claim frequency patterns) with LLM reasoning over narrative consistency. Its signals can override a happy-path recommendation by triggering Auditor escalation. This is the feature Malaysian insurers immediately recognize as valuable — PIAM statistics indicate motor fraud is a top-three loss driver industry-wide.

### 6.7 Feature 7 — Human-in-the-loop approval and override

Every AI-drafted decision is explicitly provisional. The claims officer reviews, then either clicks Approve (in which case the decision is finalized) or clicks Override (opens the reasoning, lets them adjust specific fields, and regenerates the PDF). This is a deliberate design choice, not a limitation: BNM's regulatory posture toward AI in financial services strongly favors human-in-the-loop systems.

### 6.8 Feature 8 — Cached demo replay (internal)

For the demo only. One successful live run is recorded to disk during rehearsal. If the live GLM API stalls or the venue WiFi drops during the actual demo, the presenter triggers replay mode and the dashboard plays back the cached run identically. This is the safety net. It's internal but it's a feature because shipping it is non-negotiable.

---

## 7. Use cases

### 7.1 Use case 1: happy path — standard rear-end collision claim

Siti's claims queue shows a new case. She clicks in. Claims Engine has already processed it in 90 seconds.

The Intake agent extracted: 15 March 2026, Jalan Tun Razak KL, claimant's Proton X50 rear-ended by third-party Myvi, third-party driver cited by police for careless driving. The Policy agent confirmed the claim is covered under the Etiqa Comprehensive Motor policy, Clause 4.2(a), with RM 400 excess and 25% NCD at time of incident (preserved under OD-KFK since claimant is not at fault). The Liability agent determined third-party 100% at fault, citing the police verdict and corroborating with photo 2 (rear bumper damage pattern consistent with rear-end impact). The Fraud agent returned suspicion score 0.18, no red flags. The Payout agent computed RM 4,200 approved (RM 5,600 repair estimate × 100% liability − RM 400 excess − RM 1,000 depreciation). The Auditor approved with no challenges.

Siti reviews the reasoning, clicks Approve. The Claim Decision PDF is finalized and sent to the workshop. Total Siti time: 30 seconds.

### 7.2 Use case 2: Auditor catches a flawed verdict

New case. Claims Engine produces a Payout recommendation. The Auditor reads the Liability verdict and flags: "Liability cited photo 2 showing impact on the front-right bumper as evidence of rear-ending by third party, but a rear-end collision should show damage on the rear bumper of the claimant's vehicle. Evidence does not support the stated fault direction."

The graph visibly routes backward to the Liability agent, which re-runs with the Auditor's challenge in its prompt. It reconsiders and returns a revised verdict: claimant 50% at fault, third-party 50% at fault, with updated evidence citations. The Payout agent re-runs with the new liability split. The Auditor now approves.

Siti sees the entire disagreement log on her dashboard. She agrees with the revised conclusion and clicks Approve. Without the Auditor, Siti would have either approved a flawed decision or spent 15 minutes catching the photo-narrative inconsistency herself.

### 7.3 Use case 3: fraud catch and escalation

New case. The Fraud agent returns suspicion score 0.78 with signals: *policy_purchased_14_days_before_incident*, *photo_EXIF_timestamp_inconsistent_with_stated_time*, *claimant_filed_3_claims_in_past_12_months*. The Payout agent's recommendation becomes "escalate" rather than "approve." The Auditor confirms escalation.

The case lands in Siti's escalation queue, not her approval queue. She opens it, sees the three specific fraud signals clearly laid out, and routes the case to the insurer's Special Investigations Unit. Without Claims Engine, this case would have been approved routinely; fraud would have gone undetected and paid out.

### 7.4 Use case 4: fleet self-service pre-drafting

Ahmad at KLFleet has had a rental vehicle in a fender-bender. His driver has already gone through MySettle and lodged the police report. The adjuster's report came through Merimen this morning. Ahmad's team uploads the four documents into Claims Engine's submission view, runs it, gets back a drafted claim decision in 90 seconds. They attach this draft to their submission to the insurer via Merimen — effectively handing the insurer's claims officer a pre-analyzed case that takes 30 seconds to approve instead of 30 minutes. The claim cycle shortens from 3 weeks to 1 week. Ahmad's vehicle returns to service faster.

---

## 8. Success criteria

### 8.1 Hackathon success (immediate)

Non-negotiable:
- Live demo completes end-to-end under 3 minutes on stage without visible errors
- Middle pane visibly animates 6 agents coordinating, including the Auditor backward loop
- Judges see at least one moment of genuine agent disagreement resolved by the Auditor
- Claim Decision PDF is generated and downloadable on stage
- Pitch answers all anticipated Q&A questions (see section 11) without hedging
- Merimen positioning is explicit and confident in both pitch and Q&A

Aspirational:
- Top 3 placement in Domain 1
- Judge citation of either the 3-pane UI, the Auditor pattern, or the Merimen positioning as a highlight
- At least one judge from industry expresses interest in post-hackathon conversation

### 8.2 Product success (hypothetical post-hackathon)

If Claims Engine were pursued as a real product:

- **Claim processing time at claims officer:** reduced from 30–60 minutes to under 5 minutes (drafted by AI + approved by officer)
- **Overall claim cycle time:** reduced from 2–4 weeks to 5–10 working days
- **Agent decision accuracy vs. claims officer ground truth:** ≥ 90% on back-tested historical claims
- **Fraud detection:** ≥ 2 genuine fraud attempts caught per 1,000 claims processed
- **Integration:** live Merimen API integration with at least 1 insurer logo within 12 months

---

## 9. Business model

### 9.1 Primary buyer: the insurer

Malaysian motor insurers are the primary economic buyer. They have the largest cost exposure (adjuster labour, claims officer labour, fraud losses), the clearest regulatory pressure (BNM Treating Customers Fairly framework on settlement speed), and the budgets to sign enterprise contracts.

**Pricing:** RM 15 per claim processed, billed monthly, with enterprise volume tiers.

For an insurer processing 100,000 motor claims per year at RM 15 per claim: **RM 1.5M ARR per insurer logo.** Against internal labour savings of RM 3M–8M per year at the same volume (rough estimate: 100k claims × 20 min saved × RM 200/hour loaded cost × insurer's internal cost multiplier). The ROI math closes in month one.

### 9.2 Secondary buyer: fleet operators

Fleet operators with 100+ vehicles are a faster-moving wedge with smaller individual contracts but easier procurement:

**Pricing:** RM 2,000–8,000/month flat subscription for unlimited claims within tier.

For a 200-vehicle fleet: RM 24k–30k/year, against annual downtime losses of RM 30k–65k. Net positive in year one.

### 9.3 Market size

Malaysian motor insurance processes approximately 900,000 claims per year across approximately 15 general insurers, per PIAM data. At RM 15 per claim across all insurers: **RM 13.5M/year total addressable market from insurer-side alone.** Adding fleet-side direct sales takes the addressable market above RM 20M/year. Not enormous by global SaaS standards, but substantial for a focused Malaysian-first product with clear expansion paths to Singapore and Indonesia, where Merimen also operates.

### 9.4 Go-to-market strategy

**Phase 1 (months 0–6): fleet wedge.** Sign 3–5 fleet operators (target: Socar, Trevo, Moovby, GoCar, selected logistics fleets). Fleets use Claims Engine self-service to pre-draft claims before submission. Proves the product works on real-world claim data.

**Phase 2 (months 6–18): insurer pilot.** Approach 2–3 insurers (target: Etiqa, Allianz, Tune Protect — Tune Protect is already publicly committed to AI-in-insurance) with "your fleet partners already use us, integrate us into your Merimen workflow for a 1-insurer pilot." Prove adjuster-side throughput and fraud-catch metrics.

**Phase 3 (months 18+): Merimen partnership.** Approach Merimen directly. Either OEM partnership (Claims Engine bundled as Merimen's AI decision-support add-on) or strategic integration where every Merimen customer can optionally enable our layer. This is where revenue scales.

### 9.5 Why not Merimen, n8n, Guidewire, or an existing SaaS

**Why not Merimen themselves build this?**
Merimen is a 20-year-old workflow-and-integration company. Their core DNA is document routing, not LLM-based reasoning. They have publicly committed to adding AI but have not shipped deep claim-decision drafting. We are faster, more focused, and partnership-aligned.

**Why not n8n or Zapier?**
These are visual workflow builders for deterministic rules. They cannot read a Malaysian police report, interpret a 40-page policy clause, or reason about fault from photos. They orchestrate plumbing; we replace the reasoning layer.

**Why not Guidewire or Duck Creek?**
Global policy administration systems. They digitize record-keeping, not decision-making, and they are not deployed in Malaysian motor at any scale.

**Why not an insurer in-house effort?**
Each insurer individually lacks the data volume and ML engineering depth to build this alone. A horizontal product sold across multiple insurers amortizes the development cost and benefits from cross-insurer pattern learning (while respecting data isolation).

### 9.6 Why now

Three tailwinds converge in 2026:

- Bank Negara Malaysia's Treating Customers Fairly framework is actively penalizing slow claim settlement — insurers need a credible speed-up story
- GLM and peers have reached reliability thresholds for Malaysian-language document processing
- Merimen themselves are on record about wanting AI in the stack but haven't shipped it, creating a partnership window

---

## 10. Product principles

When in doubt during build week, these principles decide:

1. **The 3-pane dashboard is the hero.** If cuts are needed: the mobile submission view goes first, the second demo case goes second, agent depth goes last. The dashboard animations and Auditor loop do not get cut.

2. **Determinism over intelligence.** Every agent output is Pydantic-validated. A hallucinated JSON field causes a reliable failure, not a silent corruption that propagates.

3. **The Auditor is a feature, not a bug.** When agents disagree on stage, that is the demo's highlight, not a failure. Visible disagreement is proof of multi-agent reasoning.

4. **We augment the claims officer, not the adjuster.** We plug into the workflow at step 6, after the licensed adjuster has done their physical inspection. This positioning is non-negotiable.

5. **We partner with Merimen, not compete.** Every mention of Merimen in the pitch is respectful and positions us as the AI reasoning layer on top of their workflow. We explicitly say this.

6. **Cached fallback is not optional.** We record a successful end-to-end run during rehearsal. If the live run fails at the venue, cached replay plays identically.

7. **MySettle is prior work, not new work.** We reference it in the first 20 seconds of the pitch and do not touch its codebase during build week.

8. **GLM, not GPT.** The hackathon specifies GLM. Every agent uses GLM. We do not hedge.

---

## 11. Anticipated judge questions and rehearsed answers

Every team member must be able to answer every one of these confidently. **The Merimen question is the most important — rehearse it most.**

**Q: How is this different from Merimen?**
A: Merimen is the workflow and integration platform connecting Malaysian insurers, adjusters, and workshops — used by 120+ insurers and 500+ adjusters. They own the document routing and status tracking layer of the industry. What Merimen doesn't do yet is draft the actual claim decision for the claims officer. That's still 30–60 minutes of manual reading and reasoning per claim. We do that part. We plug into Merimen's eClaims platform through their API — we're the AI reasoning layer on top, not a competitor.

**Q: Why not just use n8n or Zapier?**
A: n8n needs someone to design a deterministic workflow in advance. It cannot read a Malaysian police report, interpret unstructured evidence, reason about fault from photos, or catch fraud patterns in a narrative. We replace the reasoning layer that currently requires a human claims officer, not the plumbing.

**Q: How do you prevent hallucinations?**
A: Three layers. First, every agent output is validated against a Pydantic schema at the boundary — malformed JSON is caught before it propagates downstream. Second, the Auditor agent adversarially challenges the Payout recommendation and forces re-runs if reasoning is flawed — you'll see this on the middle pane. Third, the Auditor has a max 2-loop ceiling; beyond that, the case escalates to a human claims officer with the full disagreement bundled for review. The system either produces a defensible decision or explicitly flags its own uncertainty.

**Q: Is this actually multi-agent, or just a prompt chain?**
A: It's a state-machine workflow with six specialized agents, each with strict role, input contract, output contract, and tool access. Policy, Liability, and Fraud run in parallel. The Auditor is adversarial to the Payout agent — when it challenges, the graph routes backward and loops. That's visible on the middle pane. A prompt chain doesn't have adversarial coordination; we do.

**Q: Do you replace loss adjusters?**
A: No, and we explicitly don't want to. Loss adjusters are a regulated, licensed profession in Malaysia — they physically inspect the vehicle, and our product cannot and should not replace that. The adjuster's report is actually one of our most important inputs. We automate the *next* step: the insurer's claims officer reading all the documents together and drafting the decision. That step is currently 30–60 minutes of pure manual reasoning and is where AI genuinely helps.

**Q: Who is your customer?**
A: Primary: insurer Heads of Claims Operations at Malaysian motor insurers — Etiqa, Allianz, Zurich, Tune Protect, Takaful Malaysia. Pricing: RM 15 per claim processed, ~RM 1.5M ARR per insurer logo. Secondary: fleet operators with 100+ vehicles — Socar, Trevo, Moovby — using the self-service version to pre-draft their claims before submission. Fleets close in weeks, insurers in 3–6 months.

**Q: How is this better than what insurers have today?**
A: Today, a claim sits in a claims officer's queue while they read the police report, the adjuster's report, the policy PDF, and the workshop quote — 30 to 60 minutes of manual review per claim. Our system drafts the decision in 90 seconds. The officer reviews and approves in 30 seconds instead of 30 minutes. That's 20x throughput, at a cost of RM 2 per claim versus RM 100+ of officer labour.

**Q: What about fraud?**
A: The Fraud agent runs in parallel with Policy and Liability. It combines deterministic heuristics — policy age under 30 days, photo metadata inconsistencies, claim frequency patterns — with LLM reasoning over narrative consistency. Its suspicion score can override a happy-path approval by triggering Auditor escalation. PIAM identifies motor fraud as a top-three loss driver industry-wide, so this is directly valuable.

**Q: How do you handle a case the AI gets wrong?**
A: Three safety nets. One, the Auditor catches most reasoning flaws internally and forces a re-run. Two, cases that loop twice without Auditor approval auto-escalate to the human claims officer with the full disagreement bundled. Three, the claims officer always has Approve and Override authority on every case — the AI draft is provisional until a human approves. This matches BNM's regulatory preference for human-in-the-loop AI in financial services.

**Q: What's your moat?**
A: Three things. One, specialization to Malaysian motor insurance — the Policy agent is tuned for Malaysian policy language, the Liability agent references the Malaysian Highway Code, the system handles BM and English. Two, the integration position with Merimen — once we're in the Merimen ecosystem, we inherit distribution across 120+ insurers. Three, the adversarial Auditor architecture — it's harder to build reliably than it looks, and we've figured out the loop-control, contract, and escalation pattern.

**Q: Why is last year's MySettle in this pitch?**
A: Team spectrUM built MySettle at the 2025 Digital ID Hackathon to digitize the police report step of the accident workflow. We learned that the police report is only half the nightmare — drivers and fleets still wait 2 to 4 weeks for the actual insurance claim to process. Claims Engine is what we built to finish the job. MySettle is the upstream input; Claims Engine is the decision-drafting layer further down the pipeline. Together they cover the two most painful manual steps in the full lifecycle.

---

## 12. Risks and mitigations

| Risk | Severity | Mitigation |
|------|---------|------------|
| Judges ask the Merimen question and the team fumbles | **Critical** | Rehearse the answer in section 11 verbatim. Every team member must recite it in under 45 seconds. |
| Scope creep during week — someone adds voice input on day 4 | High | Section 5.2. Refer anyone proposing features to the NOT-in-scope list. |
| Team accidentally rebuilds MySettle's QR flow | Medium | Section 5.2 explicitly forbids it. |
| Live demo fails due to API timeout or network issue | High | Cached replay fallback prepared during rehearsal (section 6.8). |
| Judges perceive the system as "just a chatbot with steps" | High | 3-pane UI, explicit pitch language ("state-machine workflow"), visible Auditor backward loop, Blackboard pane. |
| Judge claims we are trying to replace licensed adjusters | Medium | Pre-empt in pitch: "The licensed adjuster stays in the loop; we automate the step after them." Covered in section 11 Q&A. |
| Frontend cannot ship React Flow animations in time | Medium | Frontend lead starts with React Flow on day 1 and timeboxes exploration to 4 hours. |
| Insurance domain expertise gets challenged in Q&A | Medium | Pre-read day 1: Etiqa motor policy PDF, BNM Claims Settlement Practices policy, PIAM motor claim guide, 3 Reddit/Lowyat threads on Malaysian claim experiences. 3 hours of research is enough. |
| UMHackathon rulebook forbids building on prior hackathon submissions | Low | Read rulebook day 0. If forbidden, MySettle gets framed as "user research we conducted" rather than "prior product." |
| GLM API access or quota issues | Medium | Verify API access and quotas on day 0 before any code is written. |
| Fabricated adjuster's report doesn't look realistic | Medium | Day 1 product manager deliverable: research the adjuster's report format, find a sample online or recreate one from Merimen documentation. |

---

## 13. Roles and ownership

| Responsibility | Owner | First deliverable |
|---|---|---|
| Agent design, prompts, LangGraph graph | AI engineer | Day 1: 6 agent stubs with Pydantic contracts |
| Backend API, SSE streaming, PDF generation | Backend engineer | Day 1: FastAPI scaffold with `/submit-claim` and stub SSE |
| 3-pane dashboard, React Flow middle pane, submission view | Frontend engineer | Day 1: Next.js scaffold with static 3-pane layout |
| Demo artifacts, pitch deck, Q&A rehearsal, rehearsal timing | Product manager | Day 1: fabricated police report, adjuster's report, policy PDF download, staged photos, WhatsApp transcript |
| Cached fallback replay setup | Backend engineer | Day 5 |
| Rulebook read, GLM API verification, Merimen research consolidation | Product manager | Day 0 — before any code |

### 13.1 Shared responsibilities

All team members:
- Read this PRD end-to-end before starting work on day 1
- Read the companion System Analysis Document before writing code that crosses component boundaries
- Attend the daily 15-minute sync to surface blockers
- Can recite the Merimen Q&A answer (section 11) on demand
- Never add a feature not in section 5.1 without explicit team consensus

---

## 14. Appendix A: input and output data examples

### 14.1 Example CaseFacts (Intake agent output)

```json
{
  "case_id": "CLM-2026-00812",
  "incident": {
    "datetime": "2026-03-15T14:32:00+08:00",
    "location": {
      "address": "Jalan Tun Razak near KLCC, Kuala Lumpur",
      "coordinates": [3.1570, 101.7123]
    },
    "weather": "clear",
    "road_condition": "dry"
  },
  "vehicles": [
    {
      "role": "claimant",
      "plate": "WXY 1234",
      "driver_id_masked": "A**********",
      "damage_location": ["rear_bumper", "rear_right_quarter_panel"]
    },
    {
      "role": "third_party",
      "plate": "ABC 5678",
      "driver_id_masked": "B**********",
      "damage_location": ["front_bumper"]
    }
  ],
  "narrative": "Claimant was stationary at traffic lights on Jalan Tun Razak when third-party vehicle rear-ended claimant's vehicle. Third-party driver admits failure to brake in time.",
  "police_verdict_summary": "Third-party driver cited under Section 43 Road Transport Act for careless driving. Third-party 100% at fault per police assessment.",
  "adjuster_report_summary": "Adjuster confirmed impact pattern consistent with rear-end collision. Estimated repair RM 5,600, 8 working days. Recommends full liability on third party.",
  "policy_type": "Comprehensive Motor",
  "insurer": "Etiqa General Insurance Berhad"
}
```

### 14.2 Example Claim Decision PDF contents (outline)

```
ETIQA GENERAL INSURANCE BERHAD
Claim Decision Letter

Claim Reference: CLM-2026-00812
Date: 18 April 2026

Claimant: Tan Wei Ming
Policy No: EGI-MTR-2025-448812
Vehicle: WXY 1234 (Proton X50 2023)

Incident Summary: [2 paragraphs from CaseFacts]

Coverage Determination:
  Covered under Clause 4.2(a) — Comprehensive Motor
  "[verbatim clause text]"
  Excess: RM 400
  NCD at time of incident: 25%

Fault Determination:
  Claimant: 0%
  Third Party: 100%
  Basis: Police Section 43 summons against third party;
         adjuster's report confirms rear-end impact pattern;
         photo evidence corroborates (photos 2, 3)

Fraud Risk Assessment: Low (suspicion score 0.18)

Payout Breakdown:
  Repair estimate (adjuster):        RM 5,600.00
  Liability-adjusted (100% TP):      RM 5,600.00
  Excess deducted:                 − RM   400.00
  NCD preserved (OD-KFK):              (no adjustment)
  Depreciation (vehicle age 3 yr): − RM 1,000.00
  ─────────────────────────────────────────────
  Final payout to workshop:          RM 4,200.00

Auditor Review: Approved (0 challenges, 0 loops)

Agent Attribution Log: [timestamps per agent]

Signed: [Claims Officer name, digital signature placeholder]
```

---

## 15. Appendix B: references and prior work

- **Team spectrUM, MySettle** — Digital ID Hackathon 2025 (Innovation Track entry; prior work referenced in pitch)
- **PIAM (Persatuan Insurans Am Malaysia)** — motor claim process documentation, approved repairer list, CART rates
- **Bank Negara Malaysia** — Treating Customers Fairly framework, Claims Settlement Practices policy document, Section 52(2) Road Transport Act penalties for late reporting
- **Merimen Technologies Sdn Bhd** — Malaysian eClaims platform; 120+ insurer users, 500+ adjusters, 5,000+ workshops; product modules eClaims, ePolicy, Truesight
- **Sample insurance policies used for demo:** Etiqa Motor Comprehensive, Allianz Motor Comprehensive, Takaful Malaysia myMotor
- **UMHackathon 2026** — Problem Statement 1, Domain 1 Key Expectations
- **Market benchmarks:** Tractable (UK, $119M raised, auto claim AI), Elysian (US, $6M seed Sep 2025, commercial claims AI), Compensa Poland (73% claims cost reduction with AI)
