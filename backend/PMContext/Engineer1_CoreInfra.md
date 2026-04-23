# Role: Core Infrastructure Engineer

## Task: Define the Global State and Cluster Factory
You are responsible for the foundational types and utilities that power the agentic graph.

## Files to Work On
- `project/backend/srcs/schemas/state.py` [NEW]
- `project/backend/srcs/utils/cluster_factory.py` [NEW]

## Scope & Out of Scope
- **In Scope**:
    - Define `ClaimWorkflowState` and `ChallengeState` using `TypedDict`.
    - Implement list-based `trace_log` with `operator.add` reducer.
    - Implement `policy_results`, `liability_results`, etc., with dict-merge reducers.
    - Implement `create_cluster_subgraph` factory using `Send` for parallel execution.
    - Implement a `reflection_wrapper` that injects feedback into parallel tasks.
- **Out of Scope**:
    - Implementing the actual LLM prompts for agents.
    - Building the main orchestration graph.

## Expected Outcome
A set of robust schemas and a factory that allows other engineers to define parallel clusters without worrying about state collision or parallel execution logic.

## Definition of Done (DoD)
- [ ] `ClaimWorkflowState` correctly handles parallel updates via reducers.
- [ ] `create_cluster_subgraph` can spawn `N` parallel tasks and aggregate results.
- [ ] `reflection_wrapper` correctly passes `active_challenge` feedback to tasks.
- [ ] Code follows guard clause and early return principles.

## Roadblock Protocol
If you encounter ambiguity in how LangGraph handles `TypedDict` reducers or if `Send` API is unclear, STOP and document the issue in `feedbacks/Engineer1Feedback.md`.

## Feedback Instructions
Write all completion notes or roadblocks to `project/backend/PMContext/feedbacks/Engineer1Feedback.md`.
