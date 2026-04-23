# Role: Systems Orchestrator

## Task: Assemble the LangGraph and Integrate SSE
You are responsible for wiring everything together and ensuring real-time feedback to the UI.

## Files to Work On
- `project/backend/srcs/services/workflow_engine.py` [NEW]
- `project/backend/srcs/services/case_service.py` [MODIFY]

## Scope & Out of Scope
- **In Scope**:
    - Assemble the `StateGraph` using nodes from other engineers.
    - Configure `interrupt_before=["decision_gate"]` and any intake interrupts.
    - Update `run_pipeline` and `run_partial_pipeline` in `case_service.py` to invoke the LangGraph.
    - Ensure every state update or trace entry is emitted via `SseService`.
- **Out of Scope**:
    - Implementing the logic inside the individual nodes (delegated to Engineers 1, 2, 3).

## Expected Outcome
A fully operational agentic workflow that replaces the existing stubs and communicates state changes in real-time.

## Definition of Done (DoD)
- [ ] LangGraph `workflow.compile()` succeeds.
- [ ] `run_pipeline` triggers the graph correctly.
- [ ] SSE updates are emitted for every major node transition and audit trail entry.
- [ ] Graph correctly pauses at the Decision Gate.

## Roadblock Protocol
If the integration with `SseService` causes circular dependencies or the `interrupt` mechanism behaves unexpectedly, STOP and document the issue in `feedbacks/Engineer4Feedback.md`.

## Feedback Instructions
Write all completion notes or roadblocks to `project/backend/PMContext/feedbacks/Engineer4Feedback.md`.
