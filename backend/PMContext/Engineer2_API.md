# Engineer 2: API & Service Integrator

## Role
Backend Engineer / FastAPI Specialist

## Task
Connect the FastAPI routes to the LangGraph workflow engine, supporting automatic resumption and audit logging.

## Files to Work On
- `project/backend/srcs/routes/cases.py`
- `project/backend/srcs/services/case_service.py`
- `project/backend/srcs/services/case_store.py`

## Scope & Out of Scope
- **In Scope:**
    - Updating `submit_case_documents` to resume the graph if `AWAITING_DOCS`.
    - Updating `approve_case` to pass "Operator Jack" and "Reason" into the graph.
    - Implementing `resume_workflow_with_sse` in `case_service.py`.
    - Persisting the human audit trail in `CaseStore`.
- **Out of Scope:**
    - Modifying LangGraph node logic (Engineer 1).
    - UI implementation.

## Tests
- Create `tests/test_hitl_loop.py` to verify that API calls correctly trigger graph resumption and update the persistent store.

## Expected Outcome
The frontend can seamlessly interact with the agentic workflow via existing REST endpoints, and all manual decisions are strictly logged in the backend store.

## Definition of Done (DoD)
- [ ] `submit_case_documents` handles automatic resumption.
- [ ] `approve_case` correctly populates `human_audit_log` in the graph.
- [ ] `resume_workflow_with_sse` correctly handles SSE event piping.
- [ ] Audit logs for "Operator Jack" are verifiable in the CaseStore.

## Roadblock Protocol
If you encounter status mapping mismatches or SSE synchronization issues, STOP and document the blocker in `PMContext/feedbacks/Engineer2Feedback.md`.

## Feedback Instructions
Write all completion notes and roadblocks to `PMContext/feedbacks/Engineer2Feedback.md`.
