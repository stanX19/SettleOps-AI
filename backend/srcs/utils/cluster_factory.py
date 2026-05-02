from typing import List, Callable
import asyncio
from langgraph.graph import StateGraph, START, END
from langgraph.types import Send
from srcs.schemas.citations import CitationValidationError
from srcs.schemas.state import ClusterState
from srcs.services.citation_validator import validate_citations
from srcs.services.agents.validator import cluster_validator_task
from srcs.services.sse_service import SseService
from srcs.logger import logger
from srcs.services.case_store import CaseStore, now_iso
from srcs.schemas.case_dto import (
    AgentId,
    AgentStatus,
    SseAgentStatusChangedData
)

VALIDATOR_SUBTASK_NAME = "validator"


async def _emit_subtask_status(
    *,
    case_id: str,
    parent_agent_id: AgentId,
    sub_task_name: str,
    status: AgentStatus,
) -> None:
    case = CaseStore.get(case_id)
    timestamp = now_iso()
    if case:
        async with CaseStore.lock(case_id):
            rs = case.agent_states[parent_agent_id]
            if sub_task_name not in rs.sub_tasks:
                from srcs.services.case_store import AgentRuntimeState
                rs.sub_tasks[sub_task_name] = AgentRuntimeState()

            sub_rs = rs.sub_tasks[sub_task_name]
            sub_rs.status = status
            if status == AgentStatus.WORKING:
                sub_rs.started_at = timestamp
            elif status in (AgentStatus.COMPLETED, AgentStatus.ERROR):
                sub_rs.completed_at = timestamp

    await SseService.emit(case_id, SseAgentStatusChangedData(
        case_id=case_id,
        timestamp=timestamp,
        agent=parent_agent_id,
        status=status,
        sub_task=sub_task_name,
        parent_agent=parent_agent_id
    ))


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
                logger.warning("[ClusterFactory] Missing case_id in state. Skipping SSE.")
                return {}
            
            sub_task_name = task.__name__
            parent_agent_id = AgentId(cluster_id)
            
            logger.debug("[ClusterFactory] Emitting WORKING for %s in %s", sub_task_name, cluster_id)
            await _emit_subtask_status(
                case_id=case_id,
                parent_agent_id=parent_agent_id,
                sub_task_name=sub_task_name,
                status=AgentStatus.WORKING,
            )

            # 3. Execute task
            try:
                if asyncio.iscoroutinefunction(task):
                    result = await task(state, feedback=feedback)
                else:
                    result = task(state, feedback=feedback)

                # 3.5 Citation gate: CitationValidationError is caught by the
                # dedicated except block below, which handles SSE + CaseStore update.
                # validate_citations._call_task handles sync/async and feedback detection.
                result, _ = await validate_citations(
                    raw_result=result,
                    state=state,
                    task_fn=task,
                    feedback=feedback,
                    node_id=sub_task_name,
                )

                # 4. Emit COMPLETED status for sub-task
                await _emit_subtask_status(
                    case_id=case_id,
                    parent_agent_id=parent_agent_id,
                    sub_task_name=sub_task_name,
                    status=AgentStatus.COMPLETED,
                )

                # 5. Format output for the sub-graph state
                citations = list(result.get("citations") or [])
                return {
                    "results": result.get("data", {}),
                    # Keyed by node_id; dict_merge overwrites the same key on rerun.
                    "citations": {sub_task_name: citations},
                    "trace_log": [f"[{cluster_id}] {result.get('reasoning', 'No reasoning provided.')}"]
                }
            except CitationValidationError as e:
                # Citation gate hard failure — preserve whatever data the agent
                # extracted and attach citation errors as a warning flag instead
                # of wiping the result. This lets downstream agents (payout,
                # auditor) continue with best-effort data rather than an empty
                # section, while the flag surfaces for human review.
                await _emit_subtask_status(
                    case_id=case_id,
                    parent_agent_id=parent_agent_id,
                    sub_task_name=sub_task_name,
                    status=AgentStatus.ERROR,
                )

                preserved_data = e.last_result.get("data", {}) if e.last_result else {}
                return {
                    "results": {
                        **preserved_data,
                        f"_citation_warning_{sub_task_name}": {
                            "citation_errors": e.errors,
                        },
                    },
                    "citations": {sub_task_name: []},
                    "trace_log": [
                        f"[{cluster_id}] CITATION GATE FAILED (data preserved): {e}"
                    ],
                }
            except Exception as e:
                # 4. Emit ERROR status for sub-task
                await _emit_subtask_status(
                    case_id=case_id,
                    parent_agent_id=parent_agent_id,
                    sub_task_name=sub_task_name,
                    status=AgentStatus.ERROR,
                )

                # ERROR GRANULARITY: Catch and mark section as error
                return {
                    "results": {
                        f"_error_{sub_task_name}": {
                            "status": "error",
                            "error": str(e),
                        }
                    },
                    "citations": {sub_task_name: []},
                    "trace_log": [f"[{cluster_id}] CRITICAL ERROR: {str(e)}"]
                }
            
        builder.add_node(f"task_{i}", reflection_wrapper)

    async def validator(state: ClusterState):
        active_challenge = state.get("active_challenge")
        has_results = bool(state.get("results"))

        if (
            active_challenge
            and active_challenge.get("target_cluster") != cluster_id
            and has_results
        ):
            return {
                "trace_log": [f"[{cluster_id}] Validator skipped - cluster not challenged."]
            }

        case_id = state.get("case_id")
        if not case_id:
            logger.warning("[ClusterFactory] Missing case_id in validator. Skipping SSE.")
            return {
                "results": {
                    "_validation": {
                        "is_valid": False,
                        "mistakes": [],
                        "feedback": "Validator could not run without a case id.",
                        "suggested_action": "challenge",
                    }
                },
                "trace_log": [f"[{cluster_id}] Validator failed: missing case id."],
            }

        parent_agent_id = AgentId(cluster_id)
        feedback = active_challenge.get("feedback") if active_challenge else None
        await _emit_subtask_status(
            case_id=case_id,
            parent_agent_id=parent_agent_id,
            sub_task_name=VALIDATOR_SUBTASK_NAME,
            status=AgentStatus.WORKING,
        )

        try:
            validation, reasoning = await cluster_validator_task(
                cluster_id,
                state,
                feedback=feedback,
            )
            await _emit_subtask_status(
                case_id=case_id,
                parent_agent_id=parent_agent_id,
                sub_task_name=VALIDATOR_SUBTASK_NAME,
                status=AgentStatus.COMPLETED,
            )
            return {
                "results": {"_validation": validation},
                "trace_log": [f"[{cluster_id}] Validator: {reasoning}"],
            }
        except Exception as e:
            logger.exception("[ClusterFactory] Validator failed for %s: %s", cluster_id, e)
            await _emit_subtask_status(
                case_id=case_id,
                parent_agent_id=parent_agent_id,
                sub_task_name=VALIDATOR_SUBTASK_NAME,
                status=AgentStatus.ERROR,
            )
            return {
                "results": {
                    "_validation": {
                        "is_valid": False,
                        "mistakes": [],
                        "feedback": f"Validator error: {e}",
                        "suggested_action": "challenge",
                    }
                },
                "trace_log": [f"[{cluster_id}] VALIDATOR FAILED: {e}"],
            }

    async def aggregate(state: ClusterState):
        """Final aggregation node for the cluster."""
        return {"trace_log": [f"[{cluster_id}] Cluster analysis complete."]}

    builder.add_node(VALIDATOR_SUBTASK_NAME, validator)
    builder.add_node("aggregator", aggregate)
    
    # Define edges
    # START -> fan_out logic (done via conditional edges or just direct if simple)
    # Actually, for Send, we usually use a starting node that returns the Send list.
    builder.add_node("fan_out_node", lambda x: {}) # Passthrough node, returns nothing to avoid duplicating state
    builder.add_conditional_edges("fan_out_node", fan_out)
    
    # All tasks fan in to the validator, then the validator feeds the aggregator.
    for i in range(len(sub_tasks)):
        builder.add_edge(f"task_{i}", VALIDATOR_SUBTASK_NAME)

    builder.add_edge(VALIDATOR_SUBTASK_NAME, "aggregator")
    builder.add_edge("aggregator", END)
    builder.set_entry_point("fan_out_node")

    return builder
