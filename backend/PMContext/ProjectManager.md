# Operational Manual: Project Manager

## Orchestration Plan
You are the central coordinator. Your role is to validate the work of the specialized engineers and ensure the individual components merge into a cohesive system.

## Validation Criteria
1. **Schema Alignment**: Ensure all engineers use the `ClaimWorkflowState` defined by Engineer 1.
2. **Logic Consistency**: Verify that the `payout_node` (Engineer 2) correctly receives data from the parallel clusters (implemented by sub-agents under Engineer 1's factory).
3. **Loop Integrity**: Confirm that the `refiner` (Engineer 3) loop-back logic correctly triggers the parallel clusters via the orchestration graph (Engineer 4).
4. **Real-time Feedback**: Ensure SSE events are emitted as expected.

## Roadblock Resolution
- If an engineer reports a roadblock in their `feedbacks/Engineer[X]Feedback.md`, analyze the issue and update the relevant `Engineer[Y].md` or `ProjectDetails.md` if the scope needs to change.
- Prioritize unblocking Engineer 1 (Infra) and Engineer 4 (Orchestration) as they are the critical path.

## Iteration Plan
1. **Infrastructure**: First, ensure Engineer 1 completes the State and Factory.
2. **Skeleton Initialization**: Create skeleton files for all agents once Engineer 1 is done.
3. **Logic Nodes**: Have Engineer 2 and 3 work in parallel on their respective nodes.
4. **Integration**: Have Engineer 4 assemble the graph and wire the SSE events.
5. **Validation**: Run the stub test suite (if exists) or manual verification via the UI.
