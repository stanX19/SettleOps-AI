# System Architecture & Design (SAD) - SettleOps AI

Page 1 of 22

## Introduction

This section introduces the strategic solution for **SettleOps AI**, an agentic platform designed to automate the complex reasoning required for insurance claim decision-making. By moving away from manual, document-heavy reviews toward a structured, multi-agent AI pipeline, SettleOps AI addresses the settlement bottlenecks identified in the motor insurance industry.

## Purpose

The system analysis document highlights the technical scope and design-related decisions behind the **SettleOps AI** development. It serves as a blueprint for the 9-13 specialized agents, the real-time orchestration layer, and the high-fidelity operator cockpit.

The key elements of the system that have been covered are as follows:

-   **Architecture:** A stateful, agentic monolith built using FastAPI and LangGraph, implementing the **PEVR (Plan, Execute, Verify, Replan)** pipeline for autonomous re-analysis.
-   **Data Flows:** Traces the movement of claim evidence (Police Reports, Policy PDFs, Crash Photos) from initial upload through the parallel AI reasoning layers to the final Payout and Auditor nodes.
-   **Model Process:** Outlines the end-to-end workflow: document ingestion, parallel fact-checking via the PEVR loop, liability reconciliation, and human-in-the-loop audit.
-   **Role of Reference:** This document is a reference for developers, AI engineers, and QA testers to ensure the system maintains high reasoning accuracy and low latency during the UMHackathon 2026.

## Background

The Malaysian motor insurance industry processes approximately 900,000 claims annually, with the "Claims Officer Review" stage acting as a severe manual bottleneck. Currently, officers spend 30-60 minutes per case mentally reconciling contradictory documents and photos. SettleOps AI was born from the need to automate this reasoning while maintaining a strict human-supervised audit trail.

-   **Previous Version:** Traditional insurance systems operate as simple "document repositories" where files are stored but not understood. Reviewing each service (Policy, Police, Workshop) requires manual context-switching across multiple tabs and systems.
-   **Major Architectural Changes:** SettleOps AI introduces a **Stateful Intelligence Layer** that treats every claim as a living "Blackboard" where independent agents write their findings in real-time.
-   **New Capabilities:** Includes a **Vision AI Agent** for crash photo forensics and a **Surgical Rerun Loop** that allows the system to autonomously challenge its own logic before a human ever sees the report.

## Target Stakeholders

| Stakeholders | Roles | Expectations |
| :--- | :--- | :--- |
| **Claims Officers** | Primary users who review claim evidence, inspect AI reasoning, and make final decisions. | High-fidelity reasoning transparency and a streamlined decision-making interface. |
| **Claims Team Leads / Supervisors** | Monitor escalated cases, review decision quality, and use audit trails for governance. | Robust audit trails and performance metrics for claim consistency. |
| **Head of Claims Operations** | Business buyer focusing on operational throughput and cost reduction. | Faster processing speeds, better consistency, and higher claim throughput. |
| **Fleet Operations Managers / Drivers** | Secondary stakeholders who benefit from fast resolution of fleet-related accidents. | Reduced vehicle downtime and clear, rapid claim settlements. |
| **Development Team** | Build and maintain the platform, agents, and backend infrastructure. | Clear API contracts, modular agent architecture, and well-documented system flows. |
| **QA Team** | Validate system behavior, reasoning accuracy, and edge-case reliability. | Defined failure states (Inconsistent/Escalated) and reproducible test data. |

Page 5 of 22

## System Architecture & Design

### High Level Architecture

| Type | Details |
| :--- | :--- |
| **System** | Web Application (Next.js Frontend + FastAPI Backend) |
| **Architecture** | LangGraph-Orchestrated Agentic Monolith (Cloud-Ready) |

SettleOps AI is structured as a high-performance **Agentic Platform**. The system consists of a **Next.js 14 Frontend** providing a real-time Decision Cockpit and a **FastAPI Backend** that manages a stateful workflow graph. The core intelligence is handled by **Google Gemini 2.5 Flash**, integrated as a service layer to perform multi-agent reasoning across text and vision inputs. All case data is managed in a high-speed **CaseStore** and streamed to the UI via **Server-Sent Events (SSE)**.

The architecture integrates **Google Gemini 2.5 Flash** as the primary reasoning layer. Instead of a generic "AI Module," the system treats the LLM as a distributed service that handles **13 specialized internal agents** coordinated via the **PEVR pipeline**.

#### Internal Agents:
- **Intake Specialist:** Categorizes documents (Police reports, Policy books, Adjuster logs).
- **Policy Specialist:** Extracts coverage type, maximum payouts, and excess MYR.
- **Liability Adjuster:** Extracts incident time, location, and narrative from reports.
- **Vision AI Agent:** "Visual Forensic Analyst" for Point of Impact (POI) analysis.
- **Damage Assessor:** Audits workshop repair quotes for cost and labor necessity.
- **Fraud Investigator:** Performs cross-document analysis for suspicious patterns.
- **Payout Strategist:** Deterministic agent for final MYR reconciliation.
- **Senior Auditor:** High-level supervisor for cross-consistency and rerun logic.
- **Feedback Alignment Agent:** Translates "AI Strategy Chat" into agent instructions.
- **Validation Gate:** Ensures "Intake Health" before analysis begins.
- **Report Drafter Agent:** Finalizes the decision artifact PDF with reasoning.
- **Workflow Orchestrator:** LangGraph controller managing the PEVR loops.
- **SSE Streaming Agent:** Manages real-time "Blackboard" UI updates.

#### Dependency Diagram
1.  **Prompt Construction:** The **Workflow Engine** pulls raw evidence from the CaseStore and injects it into agent-specific system prompts (e.g., "You are a Liability Adjuster...").
2.  **Context Window Management:** Gemini 2.5 Flash’s **1,000,000 token** window is utilized to ingest full document stacks.
3.  **Parsing & Routing:** The **RotatingLLM** service sends messages, receives responses, and uses Pydantic validators to parse JSON. Malformed outputs trigger an immediate "Surgical Rerun."
4.  **Token Enforcement:** Intake agents use **1,200-character snippets** for initial tagging to optimize latency, while reasoning agents consume the full context.

#### Sequence Diagram (Claim Ingestion to Decision)
1.  **User -> Frontend:** Uploads PDF/Images and clicks "Start Workflow."
2.  **Frontend -> API:** `POST /submit-claim` (Multipart Upload).
3.  **API -> CaseStore:** Persists files and initializes `ClaimWorkflowState`.
4.  **API -> WorkflowEngine:** Triggers LangGraph `ainvoke()`.
5.  **Intake Agent -> LLM:** Tags and classifies documents (Police, Policy, etc.).
6.  **Parallel Cluster -> LLM:** Policy, Liability, and Fraud agents run concurrently.
7.  **Payout Agent:** Computes the MYR breakdown (Deterministic Python logic).
8.  **Auditor Agent -> LLM:** Validates all findings for cross-document consistency.
9.  **WorkflowEngine -> SSE:** Streams "Agent Completed" and "Blackboard Updated" events to the UI.

### Technological Stack

| Layer | Technology | Rationale |
| :--- | :--- | :--- |
| **Frontend Framework** | Next.js 16.2.4 (App Router) | High-performance React framework for server-side rendering. |
| **Frontend Logic** | React 19.2.4 | Utilizes React 19 concurrent features for smooth UI interaction. |
| **Frontend Styling** | Tailwind CSS 4 | Rapid development with utility-first CSS and modern features. |
| **Frontend State** | Zustand 5 | Lightweight state management for real-time dashboard state. |
| **UI Components** | React Flow, Radix UI, Lucide | For agentic graph visualization and accessible UI primitives. |
| **Backend Framework** | FastAPI, Uvicorn | High-performance async-first Python API. |
| **Agent Orchestration** | LangGraph, LangChain | Managing stateful, cyclic agent workflows with Pydantic validation. |
| **Document Extraction** | MarkItDown, PyMuPDF | Microsoft MarkItDown for structured PDF/DOCX to Markdown. |
| **Visual Forensics** | Gemini Vision, Pytesseract | Gemini multimodal analysis for crash photos and OCR fallback. |
| **Decision Artifacts** | ReportLab | Programmatic generation of Claim Decision PDFs. |
| **State Storage** | In-Memory (Async-Locked) | Process-local dictionary with asyncio locking for low-latency. |
| **Deployment** | Docker | Containerized monolith for portability across environments. |

Page 10 of 22

## Key Data Flows

### Data Flow Diagram (DFD)
-   **Level 0:** Raw evidence flows from the user into the SettleOps API.
-   **Level 1:** The **Intake Process** transforms files into **CaseFacts**.
-   **Level 2:** The **Analysis Process** passes CaseFacts to specialized agents, who return structured verdicts to the **Blackboard**.
-   **Level 3:** The **Auditor Process** reviews the Blackboard and either confirms the **Decision Artifact** or triggers a **Feedback Loop**.

### Normalized Database Schema (Conceptual ERD)
-   **Case:** `case_id (PK), status, submitted_at, current_agent_id`.
-   **Document:** `doc_id (PK), case_id (FK), doc_type, content_path, tagged_slot`.
-   **AgentResult:** `result_id (PK), case_id (FK), agent_type, json_data, trace_log`.
-   **AuditLog:** `audit_id (PK), case_id (FK), feedback, loop_iteration`.

## Functional Requirements & Scope

The system focuses on an **Agentic MVP** to showcase technical feasibility within the UMHackathon 2026.

### Minimum Viable Product (MVP)

| # | Feature | Description |
| :--- | :--- | :--- |
| 1 | **Agentic Document Intake** | Automated tagging and slot-filling for 8 required insurance document types. |
| 2 | **Parallel Analysis Cluster** | Concurrent execution of Policy, Liability, and Fraud agents to reduce wait times. |
| 3 | **3-Pane Operator Cockpit** | Live visualization of evidence, agent reasoning nodes, and the outcome blackboard. |
| 4 | **Surgical Feedback Loop** | Part of the **PEVR Pipeline**; allows officers to challenge specific agents and trigger automated re-runs. |

## Non-Functional Requirements (NFRs)

| Quality | Requirements | Implementation |
| :--- | :--- | :--- |
| **Scalability** | Must handle parallel claim processing for multiple officers. | LangGraph manages independent state threads for every `case_id`. |
| **Reliability** | Claim decisions must be auditable and traceable. | Every agent output includes a `reasoning` field and a `trace_log` entry. |
| **Maintainability** | Agents must be easily updated without breaking the core graph. | Modular design using a `ClusterFactory` to decouple agents from the main engine. |
| **Token Latency** | Decision drafting must complete in sub-90 seconds. | Parallel execution of clusters and optimized Gemini 2.5 Flash usage. |
| **Cost Efficiency** | Must minimize redundant LLM calls during re-runs. | The **PEVR pipeline** ensures only affected components are re-executed during challenges. |

Page 15 of 22

## Out of Scope / Future Enhancements

-   **Phase 2:** Automated repair cost estimation directly from photos (replacing the manual quote audit).
-   **Phase 3:** Real-time In-App chat between the Claims Officer and the Third-Party driver.
-   **Phase 4:** Deep-integration with Merimen eClaims API for automated settlement disbursement.

## Monitor, Evaluation, Assumptions & Dependencies

### Technical Evaluation
-   **Traceability:** Every decision is accompanied by a **Trace Log** showing the step-by-step logic of each agent.
-   **Safe-Failure Mode:** If the Auditor detects a fundamental conflict, the system transitions to an **"Inconsistent"** state, preventing automated errors.

### Priority Matrix
-   **P1 (Critical):** If the Auditor Loop Count exceeds 3, trigger a hard **Human Escalation**.
-   **P2 (High):** If a "Fraud Score" > 0.7 is detected, visually flag the case in the dashboard queue.

### Assumptions
-   Users provide legible PDF or image evidence (Police Report, Policy).
-   Gemini 2.5 Flash API maintains high availability during the live demo.

### External Dependencies

| Tool | Purpose | Risks |
| :--- | :--- | :--- |
| **Gemini 2.5 Flash API** | Core LLM reasoning engine for all 9-13 agents. | **High:** API rate limits or downtime. Mitigation: Implement local mock fallback for demo. |
| **Next.js / FastAPI** | Application framework. | **Low:** Well-supported stable frameworks. |
| **React Flow** | Visualization of the agent graph. | **Medium:** Complexity in real-time node animation. |

## Project Management & Team Contributions

### Project Timeline
-   **Day 1-2:** Architecture design, API contract definition, and repository setup.
-   **Day 3-5:** Agentic core development (LangGraph nodes + Prompt Engineering).
-   **Day 6-8:** Frontend Cockpit development and SSE streaming integration.
-   **Day 9-10:** Final integration, "Demo Mode" implementation, and PRD/SAD finalization.

### Team Roles
-   **Lead AI Architect:** LangGraph orchestration, prompt engineering, and Auditor logic.
-   **Backend Lead:** FastAPI infrastructure, SSE streaming, and PDF generation.
-   **Frontend Specialist:** 3-Pane Cockpit UI, React Flow graph, and real-time state management.

---

**End of Document - SettleOps AI SAD v1.0**
