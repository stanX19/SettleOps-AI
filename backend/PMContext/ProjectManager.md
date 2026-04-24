# Project Manager: Orchestration Plan

## Overview
This document guides the orchestration of the Frontend-Workflow integration.

## Iteration Plan
1. **Phase 1: Foundation (Engineer 1)**
   - Update state schema and parallel reducers.
   - Introduce interrupt nodes.
2. **Phase 2: Wiring (Engineer 2)**
   - Connect API routes to graph resumption logic.
   - Implement audit logging for "Operator Jack".
3. **Phase 3: Validation (Joint)**
   - Run integration tests to ensure the HITL loop is closed.

## Validation Criteria
- **Ingestion Loop:** Does uploading a document to a case in `awaiting_docs` status automatically trigger a graph resumption?
- **Decision Loop:** Does clicking "Approve" with a reason correctly bypass the AI Auditor's `inconsistent` gate?
- **Concurrency:** Do parallel analysis results merge correctly without data loss?
- **Audit Trail:** Is "Operator Jack" correctly recorded in the `CaseStore` snapshot?

## Roadmap & Handoffs
- Engineer 2 depends on the updated `ClaimWorkflowState` from Engineer 1.
- Both engineers must ensure that SSE events are emitted consistently to avoid UI flickering.

## Merging Strategy
- Validate each engineer's work against their specific test suite.
- Perform a final integration run using `integration_test_workflow.py`.
