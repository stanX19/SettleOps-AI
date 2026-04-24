# Engineer 1: Workflow & Schema Specialist

## Role
AI Backend Engineer / LangGraph Specialist

## Task
Harden the LangGraph state and routing logic to support parallel analysis clusters and HITL interrupts.

## Files to Work On
- `project/backend/srcs/schemas/state.py`
- `project/backend/srcs/services/workflow_engine.py`
- `project/backend/srcs/services/agents/intake.py`
- `project/backend/srcs/services/agents/auditor.py`

## Scope & Out of Scope
- **In Scope:**
    - Adding `human_decision` and `human_audit_log` to `ClaimWorkflowState`.
    - Implementing the `WAIT_FOR_DOCS` node logic.
    - Updating `decision_router` to support human overrides and surgical reruns.
    - Ensuring all parallel fields use the `dict_merge` reducer.
- **Out of Scope:**
    - Modifying FastAPI routes (Engineer 2).
    - Implementing PDF generation logic (Report Generator).

## Tests
- Update `integration_test_workflow.py` to assert correct status transitions through the new interrupt points.

## Expected Outcome
The LangGraph is capable of fanning out to parallel clusters without data loss, interrupting for missing documents, and correctly routing based on human override flags.

## Definition of Done (DoD)
- [ ] `ClaimWorkflowState` updated with audit and decision fields.
- [ ] `WAIT_FOR_DOCS` node integrated into the graph.
- [ ] `decision_router` handles `force_approve` and `latest_user_message`.
- [ ] Reducers correctly applied and verified with unit tests.

## Roadblock Protocol
If you encounter missing dependencies or ambiguous routing logic, STOP and document the blocker in `PMContext/feedbacks/Engineer1Feedback.md`.

## Feedback Instructions
Write all completion notes and roadblocks to `PMContext/feedbacks/Engineer1Feedback.md`.
