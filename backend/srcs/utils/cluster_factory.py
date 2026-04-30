from typing import List, Callable
import asyncio
from langgraph.graph import StateGraph, START, END
from langgraph.types import Send
from srcs.schemas.citations import CitationValidationError
from srcs.schemas.state import ClusterState
from srcs.services.citation_validator import validate_citations
from srcs.services.sse_service import SseService
from srcs.services.case_store import CaseStore, now_iso
from srcs.schemas.case_dto import (
    AgentId,
    AgentStatus,
    SseAgentStatusChangedData
)

def create_cluster_subgraph(cluster_id: str, sub_tasks: List[Callable]) -> StateGraph:
    """
    Creates a parallel cluster subgraph for a specific domain (e.g., liability, policy).
    
    Args:
        cluster_id: The identifier for the cluster (e.g., "liability").
        sub_tasks: A list of functions (nodes) to execute in parallel.
        
    Returns:
        A LangGraph StateGraph builder (uncompiled).
    """
    builder = StateGraph(ClusterState)

    def fan_out(state: ClusterState):
        """Maps global state to parallel sub-tasks using the Send API."""
        if not sub_tasks:
            return END
        return [Send(f"task_{i}", state) for i in range(len(sub_tasks))]

    for i, task_fn in enumerate(sub_tasks):
        async def reflection_wrapper(state: ClusterState, task=task_fn):
            """
            Wraps a task with reflection logic. 
            Injects feedback if an active challenge exists for this cluster.
            """
            # 1. Determine if we should skip
            active_challenge = state.get("active_challenge")
            has_results = bool(state.get("results"))
            
            should_rerun = True
            feedback = None
            
            if active_challenge:
                # If there's an active challenge, only rerun if THIS cluster is the target
                should_rerun = active_challenge.get("target_cluster") == cluster_id
                if should_rerun:
                    feedback = active_challenge.get("feedback")
            
            if not should_rerun and has_results:
                return {
                    "trace_log": [f"[{cluster_id}] Skipping - previously calculated and not challenged."]
                }

            # 2. Emit WORKING status for sub-task
            case_id = state.get("case_id")
            if not case_id:
                print("WARNING: [ClusterFactory] Missing case_id in state. Skipping SSE.", flush=True)
                return result
            
            sub_task_name = task.__name__
            parent_agent_id = AgentId(cluster_id)
            
            # Update CaseStore for sub-task
            case = CaseStore.get(case_id)
            if case:
                async with CaseStore.lock(case_id):
                    rs = case.agent_states[parent_agent_id]
                    if sub_task_name not in rs.sub_tasks:
                        from srcs.services.case_store import AgentRuntimeState
                        rs.sub_tasks[sub_task_name] = AgentRuntimeState()
                    
                    sub_rs = rs.sub_tasks[sub_task_name]
                    sub_rs.status = AgentStatus.WORKING
                    sub_rs.started_at = now_iso()

            print(f"DEBUG: [ClusterFactory] Emitting WORKING for {sub_task_name} in {cluster_id}", flush=True)
            await SseService.emit(case_id, SseAgentStatusChangedData(
                case_id=case_id,
                timestamp=now_iso(),
                agent=parent_agent_id,
                status=AgentStatus.WORKING,
                sub_task=sub_task_name,
                parent_agent=parent_agent_id
            ))

            # 3. Execute task
            try:
                if asyncio.iscoroutinefunction(task):
                    result = await task(state, feedback=feedback)
                else:
                    result = task(state, feedback=feedback)

                # 3.5 Citation gate — raises CitationValidationError on hard failure,
                # which falls through to the outer except so ERROR SSE is emitted
                # exactly once via the existing path.
                result, _ = await validate_citations(
                    raw_result=result,
                    state=state,
                    task_fn=task,
                    feedback=feedback,
                    node_id=sub_task_name,
                )

                # 4. Emit COMPLETED status for sub-task
                if case:
                    async with CaseStore.lock(case_id):
                        sub_rs = case.agent_states[parent_agent_id].sub_tasks[sub_task_name]
                        sub_rs.status = AgentStatus.COMPLETED
                        sub_rs.completed_at = now_iso()

                await SseService.emit(case_id, SseAgentStatusChangedData(
                    case_id=case_id,
                    timestamp=now_iso(),
                    agent=parent_agent_id,
                    status=AgentStatus.COMPLETED,
                    sub_task=sub_task_name,
                    parent_agent=parent_agent_id
                ))

                # 5. Format output for the sub-graph state
                citations = list(result.get("citations") or [])
                return {
                    "results": result.get("data", {}),
                    # Keyed by node_id; dict_merge overwrites the same key on rerun.
                    "citations": {sub_task_name: citations},
                    "trace_log": [f"[{cluster_id}] {result.get('reasoning', 'No reasoning provided.')}"]
                }
            except CitationValidationError as e:
                # Citation gate hard failure — let the generic except handle SSE/CaseStore.
                if case:
                    async with CaseStore.lock(case_id):
                        sub_rs = case.agent_states[parent_agent_id].sub_tasks[sub_task_name]
                        sub_rs.status = AgentStatus.ERROR
                        sub_rs.completed_at = now_iso()

                await SseService.emit(case_id, SseAgentStatusChangedData(
                    case_id=case_id,
                    timestamp=now_iso(),
                    agent=parent_agent_id,
                    status=AgentStatus.ERROR,
                    sub_task=sub_task_name,
                    parent_agent=parent_agent_id
                ))

                return {
                    "results": {"status": "error", "error": str(e), "citation_errors": e.errors},
                    "citations": {sub_task_name: []},
                    "trace_log": [f"[{cluster_id}] CITATION GATE FAILED: {e}"]
                }
            except Exception as e:
                # 4. Emit ERROR status for sub-task
                if case:
                    async with CaseStore.lock(case_id):
                        sub_rs = case.agent_states[parent_agent_id].sub_tasks[sub_task_name]
                        sub_rs.status = AgentStatus.ERROR
                        sub_rs.completed_at = now_iso()

                await SseService.emit(case_id, SseAgentStatusChangedData(
                    case_id=case_id,
                    timestamp=now_iso(),
                    agent=parent_agent_id,
                    status=AgentStatus.ERROR,
                    sub_task=sub_task_name,
                    parent_agent=parent_agent_id
                ))

                # ERROR GRANULARITY: Catch and mark section as error
                return {
                    "results": {"status": "error", "error": str(e)},
                    "citations": {sub_task_name: []},
                    "trace_log": [f"[{cluster_id}] CRITICAL ERROR: {str(e)}"]
                }
            
        builder.add_node(f"task_{i}", reflection_wrapper)

    async def aggregate(state: ClusterState):
        """Final aggregation node for the cluster."""
        return {"trace_log": [f"[{cluster_id}] Cluster analysis complete."]}

    builder.add_node("aggregator", aggregate)
    
    # Define edges
    # START -> fan_out logic (done via conditional edges or just direct if simple)
    # Actually, for Send, we usually use a starting node that returns the Send list.
    builder.add_node("fan_out_node", lambda x: {}) # Passthrough node, returns nothing to avoid duplicating state
    builder.add_conditional_edges("fan_out_node", fan_out)
    
    # All tasks point to the aggregator
    for i in range(len(sub_tasks)):
        builder.add_edge(f"task_{i}", "aggregator")
        
    builder.add_edge("aggregator", END)
    builder.set_entry_point("fan_out_node")

    return builder
