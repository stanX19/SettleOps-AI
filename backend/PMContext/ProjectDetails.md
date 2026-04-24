# Project Details: Evergreen Graph Frontend Integration

## Overview
The "Evergreen Graph" is a production-grade agentic insurance claims engine. This phase focuses on connecting the existing LangGraph workflow with the FastAPI backend and React frontend to support real-time ingestion loops and human-in-the-loop (HITL) decision making.

## Business Objectives
- **Seamless Ingestion:** Automatically resume the workflow when missing documents are uploaded.
- **Human Authority:** Allow operators to override AI auditor findings with logged reasoning.
- **Strict Auditing:** Maintain a persistent audit trail of all manual interventions for compliance.
- **Scalable Analysis:** Use Map-Reduce patterns to prevent data collisions during parallel agent execution.

## Tech Stack
- **Orchestration:** LangGraph (StateGraph, MemorySaver).
- **Backend:** FastAPI, Pydantic.
- **Persistence:** CaseStore (In-memory dict-based storage with locking).
- **Communication:** Server-Sent Events (SSE) for real-time updates.

## Global Constraints & Decisions
- **Operator Identity:** For this hackathon, use the hardcoded identity "Operator Jack" for all human actions.
- **Anonymized Reporting:** PDF reports generated for the user MUST NOT contain human operator names.
- **State Reducers:** Parallel cluster results (Policy, Liability, Damage, Fraud) MUST use the `dict_merge` reducer to avoid data overwrites.
- **Interrupts:** The graph MUST interrupt before `DECISION_GATE` and at a new `WAIT_FOR_DOCS` node.
