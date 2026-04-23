from typing import List, Callable
import asyncio
from langgraph.graph import StateGraph, START, END
from langgraph.types import Send
from srcs.schemas.state import ClaimWorkflowState, ClusterState

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

            # 2. Execute task
            # The task is expected to return a dict with 'data' and 'reasoning'
            if asyncio.iscoroutinefunction(task):
                result = await task(state, feedback=feedback)
            else:
                result = task(state, feedback=feedback)
            
            # 3. Format output for the sub-graph state
            return {
                "results": result.get("data", {}),
                "trace_log": [f"[{cluster_id}] {result.get('reasoning', 'No reasoning provided.')}"]
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
