import asyncio
from typing import Any, Dict, List, Optional

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

# Persistent checkpointer for HITL resumption
workflow_checkpointer = MemorySaver()

from srcs.schemas.state import ClaimWorkflowState, WorkflowNodes
from srcs.schemas.case_dto import AgentId, AgentStatus, BlackboardSection
from srcs.services.agents.intake import ingest_tagging, validation_gate, wait_for_docs_node
from srcs.services.agents.payout import payout_node
from srcs.services.agents.auditor import auditor_node, decision_router, decision_gate_logic
from srcs.services.agents.refiner import refiner_node
from srcs.services.agents.analysis_tasks import (
    policy_analysis_task,
    liability_narrative_task,
    liability_poi_task,
    damage_quote_audit_task,
    fraud_assessment_task
)
from srcs.utils.cluster_factory import create_cluster_subgraph
from srcs.services.sse_service import SseService
from srcs.schemas.case_dto import (
    SseAgentStatusChangedData,
    SseAgentOutputData,
    SseWorkflowCompletedData,
    CaseStatus
)
from srcs.services.case_store import CaseStore, now_iso

from srcs.schemas.state import ClaimWorkflowState, WorkflowNodes, ClusterState

# -- Cluster Definitions -----------------------------------------------------

async def _run_cluster(graph, cluster_id: str, state: ClaimWorkflowState):
    """Bridge between global ClaimWorkflowState and isolated ClusterState."""
    input_state: ClusterState = {
        "case_id": state["case_id"],
        "documents": state["documents"],
        "case_facts": state["case_facts"],
        "active_challenge": state["active_challenge"],
        "results": state.get(f"{cluster_id}_results", {}),
        "trace_log": [] # Sub-graph appends to its own fresh log
    }
    
    # Execute the sub-graph
    # We use a thread_id that includes the cluster to keep checkpointers separate if needed,
    # but here we just invoke it directly as a function.
    result = await graph.ainvoke(input_state)
    
    return {
        f"{cluster_id}_results": result["results"],
        "trace_log": result["trace_log"]
    }

def build_workflow() -> StateGraph:
    """Assembles the full Auditor-Orchestrated Insurance Claims Graph."""
    builder = StateGraph(ClaimWorkflowState)

    # 1. Intake Phase
    builder.add_node("ingest_tagging", ingest_tagging)
    builder.add_node("validation_gate", validation_gate)
    builder.add_node("wait_for_docs", wait_for_docs_node)
    
    # 2. Analysis Phase (Clusters)
    policy_graph = create_cluster_subgraph("policy", [policy_analysis_task]).compile()
    liability_graph = create_cluster_subgraph("liability", [liability_narrative_task, liability_poi_task]).compile()
    damage_graph = create_cluster_subgraph("damage", [damage_quote_audit_task]).compile()
    fraud_graph = create_cluster_subgraph("fraud", [fraud_assessment_task]).compile()

    async def run_policy(x): return await _run_cluster(policy_graph, "policy", x)
    async def run_liability(x): return await _run_cluster(liability_graph, "liability", x)
    async def run_damage(x): return await _run_cluster(damage_graph, "damage", x)
    async def run_fraud(x): return await _run_cluster(fraud_graph, "fraud", x)

    builder.add_node(WorkflowNodes.POLICY_CLUSTER, run_policy)
    builder.add_node(WorkflowNodes.LIABILITY_CLUSTER, run_liability)
    builder.add_node(WorkflowNodes.DAMAGE_CLUSTER, run_damage)
    builder.add_node(WorkflowNodes.FRAUD_CLUSTER, run_fraud)

    # 3. Payout & Audit Phase
    builder.add_node("payout_node", payout_node)
    builder.add_node("auditor_node", auditor_node)

    # 4. Refinement & Decision Phase
    builder.add_node(WorkflowNodes.DECISION_GATE, decision_gate_logic)
    builder.add_node(WorkflowNodes.REFINER, refiner_node)
    builder.add_node(WorkflowNodes.REPORT_GENERATOR, lambda x: {"status": "completed"})

    # -- Edges & Routing ------------------------------------------------------
    
    builder.add_edge(START, "ingest_tagging")
    builder.add_edge("ingest_tagging", "validation_gate")
    
    # 2. Analysis Phase (Parallel Clusters)
    builder.add_node("parallel_analysis_start", lambda x: {})
    
    # Validation Gate Routing
    def intake_router(state: ClaimWorkflowState):
        if state.get("status") == "awaiting_docs":
            return "wait_for_docs"
        return "parallel_analysis_start"

    builder.add_conditional_edges("validation_gate", intake_router, {
        "parallel_analysis_start": "parallel_analysis_start",
        "wait_for_docs": "wait_for_docs"
    })
    
    builder.add_edge("wait_for_docs", "ingest_tagging")
    
    # Fan out to all clusters concurrently
    builder.add_edge("parallel_analysis_start", WorkflowNodes.POLICY_CLUSTER)
    builder.add_edge("parallel_analysis_start", WorkflowNodes.LIABILITY_CLUSTER)
    builder.add_edge("parallel_analysis_start", WorkflowNodes.DAMAGE_CLUSTER)
    builder.add_edge("parallel_analysis_start", WorkflowNodes.FRAUD_CLUSTER)
    
    # All clusters fan in to payout_node
    # LangGraph will wait for all branches to complete if payout_node is reached
    builder.add_edge(WorkflowNodes.POLICY_CLUSTER, "payout_node")
    builder.add_edge(WorkflowNodes.LIABILITY_CLUSTER, "payout_node")
    builder.add_edge(WorkflowNodes.DAMAGE_CLUSTER, "payout_node")
    builder.add_edge(WorkflowNodes.FRAUD_CLUSTER, "payout_node")
    
    builder.add_edge("payout_node", "auditor_node")
    builder.add_edge("auditor_node", WorkflowNodes.DECISION_GATE)
    
    # Decision Gate Routing (The Surgical Loop)
    builder.add_conditional_edges(WorkflowNodes.DECISION_GATE, decision_router, {
        WorkflowNodes.POLICY_CLUSTER: WorkflowNodes.POLICY_CLUSTER,
        WorkflowNodes.LIABILITY_CLUSTER: WorkflowNodes.LIABILITY_CLUSTER,
        WorkflowNodes.DAMAGE_CLUSTER: WorkflowNodes.DAMAGE_CLUSTER,
        WorkflowNodes.FRAUD_CLUSTER: WorkflowNodes.FRAUD_CLUSTER,
        WorkflowNodes.REFINER: WorkflowNodes.REFINER,
        WorkflowNodes.REPORT_GENERATOR: WorkflowNodes.REPORT_GENERATOR,
        WorkflowNodes.DECISION_GATE: WorkflowNodes.DECISION_GATE
    })
    
    builder.add_edge(WorkflowNodes.REFINER, WorkflowNodes.DECISION_GATE) # Loop back for another check or surgical rerun
    builder.add_edge(WorkflowNodes.REPORT_GENERATOR, END)

    return builder

# -- SSE Streaming Integration -----------------------------------------------

# Mapping nodes to AgentId and Section for SSE
_NODE_TO_AGENT = {
    "ingest_tagging": AgentId.INTAKE,
    WorkflowNodes.POLICY_CLUSTER: AgentId.POLICY,
    WorkflowNodes.LIABILITY_CLUSTER: AgentId.LIABILITY,
    WorkflowNodes.DAMAGE_CLUSTER: AgentId.DAMAGE,
    WorkflowNodes.FRAUD_CLUSTER: AgentId.FRAUD,
    "payout_node": AgentId.PAYOUT,
    "auditor_node": AgentId.AUDITOR,
}

_NODE_TO_SECTION = {
    "ingest_tagging": BlackboardSection.CASE_FACTS,
    WorkflowNodes.POLICY_CLUSTER: BlackboardSection.POLICY_VERDICT,
    WorkflowNodes.LIABILITY_CLUSTER: BlackboardSection.LIABILITY_VERDICT,
    WorkflowNodes.DAMAGE_CLUSTER: BlackboardSection.DAMAGE_RESULT,
    WorkflowNodes.FRAUD_CLUSTER: BlackboardSection.FRAUD_ASSESSMENT,
    "payout_node": BlackboardSection.PAYOUT_RECOMMENDATION,
    "auditor_node": BlackboardSection.AUDIT_RESULT,
}

async def run_workflow_with_sse(case_id: str, initial_state: ClaimWorkflowState):
    """Executes the LangGraph and pipes updates to SSE and CaseStore in real-time."""
    builder = build_workflow()
    graph = builder.compile(checkpointer=workflow_checkpointer, interrupt_before=[WorkflowNodes.DECISION_GATE, WorkflowNodes.WAIT_FOR_DOCS])
    config = {"configurable": {"thread_id": case_id}}
    
    await _process_graph_stream(case_id, graph, config, initial_state)

async def _process_graph_stream(case_id: str, graph, config, initial_state=None):
    """Shared logic for streaming graph updates and piping to SSE/CaseStore."""
    stream = graph.astream(initial_state, config, stream_mode="updates")
    
    async for event in stream:
        for node_name, update in event.items():
            # 1. Emit Status: WORKING
            if node_name == "parallel_analysis_start":
                for cluster_agent in [AgentId.POLICY, AgentId.LIABILITY, AgentId.DAMAGE, AgentId.FRAUD]:
                    await _emit_agent_status(case_id, cluster_agent, AgentStatus.WORKING)
                continue

            agent_id = _NODE_TO_AGENT.get(node_name)
            if not agent_id:
                continue
                
            # 2. Extract Data & Update CaseStore
            section = _NODE_TO_SECTION.get(node_name)
            data = None
            for key, val in update.items():
                if key.endswith("_results") or key == "payout_results" or key == "case_facts":
                    data = val
                    break
            
            if section and data is not None:
                case = CaseStore.get(case_id)
                if case:
                    async with CaseStore.lock(case_id):
                        case.set_section_data(section, data)

                await SseService.emit(case_id, SseAgentOutputData(
                    case_id=case_id,
                    timestamp=now_iso(),
                    agent=agent_id,
                    section=section,
                    data=data
                ))
            
            # 3. Emit Status: COMPLETED or ERROR
            final_agent_status = AgentStatus.COMPLETED
            if data and isinstance(data, dict) and data.get("status") == "error":
                final_agent_status = AgentStatus.ERROR
            
            await _emit_agent_status(case_id, agent_id, final_agent_status)

    # Final status check
    final_state_wrapper = await graph.aget_state(config)
    final_status = final_state_wrapper.values.get("status")
    
    display_status = CaseStatus.RUNNING
    if final_status in ("inconsistent", "escalated"):
        display_status = CaseStatus.ESCALATED
    elif final_status == "completed":
        display_status = CaseStatus.AWAITING_APPROVAL
    elif final_status == "awaiting_docs":
        display_status = CaseStatus.AWAITING_DOCS
    
    if final_state_wrapper.next:
         await SseService.emit(case_id, SseWorkflowCompletedData(
            case_id=case_id,
            timestamp=now_iso(),
            status=display_status,
            pdf_ready=False,
            auditor_loop_count=final_state_wrapper.values.get("auditor_loop_count", 0),
            officer_challenge_count=final_state_wrapper.values.get("officer_challenge_count", 0),
            chatbox_enabled=True
        ))

async def resume_workflow_with_sse(case_id: str, updates: dict):
    """Resumes a suspended graph thread with new state updates."""
    builder = build_workflow()
    graph = builder.compile(checkpointer=workflow_checkpointer, interrupt_before=[WorkflowNodes.DECISION_GATE])
    config = {"configurable": {"thread_id": case_id}}
    
    # Apply updates to the thread state
    await graph.aupdate_state(config, updates)
    
    # Resume execution (passing None to signal resumption of existing thread)
    await _process_graph_stream(case_id, graph, config, None)

async def _emit_agent_status(case_id: str, agent: AgentId, status: AgentStatus):
    """Sync status to CaseStore and emit SSE."""
    timestamp = now_iso()
    case = CaseStore.get(case_id)
    if case:
        async with CaseStore.lock(case_id):
            rs = case.agent_states.get(agent)
            if rs:
                rs.status = status
                if status == AgentStatus.WORKING:
                    rs.started_at = timestamp
                    case.current_agent = agent
                elif status == AgentStatus.COMPLETED:
                    rs.completed_at = timestamp
                    
    await SseService.emit(case_id, SseAgentStatusChangedData(
        case_id=case_id,
        timestamp=timestamp,
        agent=agent,
        status=status
    ))
