# Project Details: Auditor-Orchestrated Insurance Claims Engine

## High-Level Overview
The goal of this project is to replace the current stub-based claims pipeline with a robust, **4-Phase Interactive Map-Reduce Architecture** using LangGraph. This engine will handle insurance claims with high-precision parallel analysis and a human-in-the-loop (HITL) refinement cycle.

## Business Objectives
- Automate the initial analysis of insurance claims across multiple domains (Policy, Liability, Damage, Fraud).
- Implement a "Surgical Loop" that allows human officers to challenge specific agent decisions and trigger targeted reruns.
- Ensure deterministic accuracy for financial calculations (Payout Engine).
- Maintain a comprehensive audit trail (Trace Log) for every step of the process.

## Tech Stack
- **Core**: Python 3.12
- **Orchestration**: LangGraph, LangChain-Core
- **LLM**: RotatingLLM (custom provider-rotating wrapper)
- **State Management**: TypedDict with Annotated reducers
- **Async**: asyncio
- **Messaging**: SSE (Server-Sent Events)

## Project Scope
- **Phase 1 (Ingestion)**: Extraction and Categorization + Validation Gate.
- **Phase 2 (Analysis Clusters)**: Policy, Liability, Damage, and Fraud clusters.
- **Phase 3 (Calculations & Audit)**: Deterministic Payout Node and AI Auditor Node.
- **Phase 4 (Refinement)**: Human Decision Gate (HITL) and Feedback Refiner.

## Global Constraints
- **Minimal Change**: Preserve existing SSE contracts and API endpoints where possible.
- **Guard Clauses**: Use early returns and guard clauses for all logic.
- **DRY/KISS**: Keep logic modular and avoid redundant implementations.
- **Persistence**: Defer database persistence (use process-local store for now), but ensure the graph is compatible with checkpointing.
