import asyncio
from typing import Any, Dict, List, Optional

from srcs.logger import logger

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

# Persistent checkpointer for HITL resumption
workflow_checkpointer = MemorySaver()

from srcs.schemas.state import ClaimWorkflowState, WorkflowNodes
from srcs.schemas.case_dto import AgentId, AgentStatus, BlackboardSection
from srcs.services.agents.intake import ingest_tagging, entity_extraction_node, validation_gate, wait_for_docs_node
from srcs.services.agents.payout import payout_node
from srcs.services.agents.adjuster_request import adjuster_request_node, wait_for_adjuster_node, should_request_adjuster
from srcs.services.agents.auditor import auditor_node, decision_router, decision_gate_logic
from srcs.services.agents.refiner import refiner_node
from srcs.services.agents.analysis_tasks import (
    policy_analysis_task,
    liability_narrative_task,
    liability_poi_task,
    damage_quote_audit_task,
    pricing_validation_task,
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

# -- Graph Topology (Dynamic UI Metadata) -----------------------------------

TOPOLOGY = {
    AgentId.POLICY.value: ["policy_analysis_task"],
    AgentId.LIABILITY.value: ["liability_narrative_task", "liability_poi_task"],
    AgentId.DAMAGE.value: ["damage_quote_audit_task", "pricing_validation_task"],
    AgentId.FRAUD.value: ["fraud_assessment_task"],
}

def _assert_no_upstream_citations_in_cluster_input(
    cluster_id: str, input_state: ClusterState
) -> None:
    """Keep citations as audit metadata, not cluster reasoning input."""
    leaked_keys = [
        key
        for key in input_state
        if key.endswith("_citations") or (key == "citations" and input_state[key])
    ]
    if leaked_keys:
        raise ValueError(
            f"Cluster '{cluster_id}' input unexpectedly includes citation payloads: "
            f"{', '.join(leaked_keys)}"
        )


# -- Cluster Definitions -----------------------------------------------------

async def _run_cluster(graph, cluster_id: str, state: ClaimWorkflowState):
    """Bridge between global ClaimWorkflowState and isolated ClusterState."""
    input_state: ClusterState = {
        "case_id": state["case_id"],
        "documents": state["documents"],
        "case_facts": state["case_facts"],
        "active_challenge": state["active_challenge"],
        "results": state.get(f"{cluster_id}_results", {}),
        "citations": {},  # fresh per-run; sub-tasks contribute keyed by node_id
        "trace_log": []
    }
    _assert_no_upstream_citations_in_cluster_input(cluster_id, input_state)

    logger.debug(
        "[_run_cluster] Invoking subgraph for %s. input_state keys: %s, case_id: %s",
        cluster_id, list(input_state.keys()), input_state.get("case_id"),
    )
    result = await graph.ainvoke(input_state)

    # Flatten {node_id: [citations]} into a single section-level list.
    citations_by_node = result.get("citations") or {}
    flattened: list[dict] = []
    for node_citations in citations_by_node.values():
        if isinstance(node_citations, list):
            flattened.extend(node_citations)

    return {
        f"{cluster_id}_results": result["results"],
        f"{cluster_id}_citations": flattened,
        "trace_log": result["trace_log"]
    }

def build_workflow() -> StateGraph:
    """Assembles the full Auditor-Orchestrated Insurance Claims Graph."""
    builder = StateGraph(ClaimWorkflowState)

    # 1. Intake Phase
    builder.add_node("ingest_tagging", node_sse_wrapper("ingest_tagging", ingest_tagging))
    builder.add_node("entity_extraction", node_sse_wrapper("entity_extraction", entity_extraction_node))
    builder.add_node("validation_gate", node_sse_wrapper("validation_gate", validation_gate))
    builder.add_node("wait_for_docs", wait_for_docs_node)
    
    # 2. Analysis Phase (Clusters)
    policy_graph = create_cluster_subgraph("policy", [policy_analysis_task]).compile()
    liability_graph = create_cluster_subgraph("liability", [liability_narrative_task, liability_poi_task]).compile()
    damage_graph = create_cluster_subgraph("damage", [damage_quote_audit_task, pricing_validation_task]).compile()
    fraud_graph = create_cluster_subgraph("fraud", [fraud_assessment_task]).compile()

    async def run_policy(x): return await _run_cluster(policy_graph, "policy", x)
    async def run_liability(x): return await _run_cluster(liability_graph, "liability", x)
    async def run_damage(x): return await _run_cluster(damage_graph, "damage", x)
    async def run_fraud(x): return await _run_cluster(fraud_graph, "fraud", x)

    builder.add_node(WorkflowNodes.POLICY_CLUSTER, node_sse_wrapper(WorkflowNodes.POLICY_CLUSTER, run_policy))
    builder.add_node(WorkflowNodes.LIABILITY_CLUSTER, node_sse_wrapper(WorkflowNodes.LIABILITY_CLUSTER, run_liability))
    builder.add_node(WorkflowNodes.DAMAGE_CLUSTER, node_sse_wrapper(WorkflowNodes.DAMAGE_CLUSTER, run_damage))
    builder.add_node(WorkflowNodes.FRAUD_CLUSTER, node_sse_wrapper(WorkflowNodes.FRAUD_CLUSTER, run_fraud))

    # 3. Payout & Audit Phase
    builder.add_node("payout_node", node_sse_wrapper("payout_node", payout_node))
    builder.add_node(WorkflowNodes.ADJUSTER_REQUEST, node_sse_wrapper(WorkflowNodes.ADJUSTER_REQUEST, adjuster_request_node))
    builder.add_node(WorkflowNodes.WAIT_FOR_ADJUSTER, node_sse_wrapper(WorkflowNodes.WAIT_FOR_ADJUSTER, wait_for_adjuster_node))
    builder.add_node("auditor_node", node_sse_wrapper("auditor_node", auditor_node))

    # 4. Refinement & Decision Phase
    builder.add_node(WorkflowNodes.DECISION_GATE, decision_gate_logic)
    builder.add_node(WorkflowNodes.REFINER, node_sse_wrapper(WorkflowNodes.REFINER, refiner_node))
    async def run_report_gen(state):
        case = CaseStore.get(state["case_id"])
        if case:
            from srcs.services.case_service import generate_artifacts
            await generate_artifacts(case)
        return {"status": "completed"}

    builder.add_node(WorkflowNodes.REPORT_GENERATOR, node_sse_wrapper(WorkflowNodes.REPORT_GENERATOR, run_report_gen))

    # -- Edges & Routing ------------------------------------------------------
    
    builder.add_edge(START, "ingest_tagging")
    builder.add_edge("ingest_tagging", "entity_extraction")
    builder.add_edge("entity_extraction", "validation_gate")
    
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
    
    def payout_router(state: ClaimWorkflowState) -> str:
        return WorkflowNodes.ADJUSTER_REQUEST if should_request_adjuster(state) else "auditor_node"

    builder.add_conditional_edges("payout_node", payout_router, {
        "auditor_node": "auditor_node",
        WorkflowNodes.ADJUSTER_REQUEST: WorkflowNodes.ADJUSTER_REQUEST,
    })
    builder.add_edge(WorkflowNodes.ADJUSTER_REQUEST, WorkflowNodes.WAIT_FOR_ADJUSTER)
    builder.add_edge(WorkflowNodes.WAIT_FOR_ADJUSTER, "auditor_node")
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
    "entity_extraction": AgentId.INTAKE,
    "validation_gate": AgentId.INTAKE,
    WorkflowNodes.POLICY_CLUSTER: AgentId.POLICY,
    WorkflowNodes.LIABILITY_CLUSTER: AgentId.LIABILITY,
    WorkflowNodes.DAMAGE_CLUSTER: AgentId.DAMAGE,
    WorkflowNodes.FRAUD_CLUSTER: AgentId.FRAUD,
    "payout_node": AgentId.PAYOUT,
    WorkflowNodes.ADJUSTER_REQUEST: AgentId.ADJUSTER,
    WorkflowNodes.WAIT_FOR_ADJUSTER: AgentId.ADJUSTER,
    "auditor_node": AgentId.AUDITOR,
}

_NODE_TO_SECTION = {
    "ingest_tagging": BlackboardSection.CASE_FACTS,
    "entity_extraction": BlackboardSection.CASE_FACTS,
    "validation_gate": BlackboardSection.CASE_FACTS,
    WorkflowNodes.POLICY_CLUSTER: BlackboardSection.POLICY_VERDICT,
    WorkflowNodes.LIABILITY_CLUSTER: BlackboardSection.LIABILITY_VERDICT,
    WorkflowNodes.DAMAGE_CLUSTER: BlackboardSection.DAMAGE_RESULT,
    WorkflowNodes.FRAUD_CLUSTER: BlackboardSection.FRAUD_ASSESSMENT,
    "payout_node": BlackboardSection.PAYOUT_RECOMMENDATION,
    WorkflowNodes.ADJUSTER_REQUEST: BlackboardSection.ADJUSTER_REQUEST,
    WorkflowNodes.WAIT_FOR_ADJUSTER: BlackboardSection.ADJUSTER_REQUEST,
    "auditor_node": BlackboardSection.AUDIT_RESULT,
}

def get_graph():
    """Compiles the graph with standardized interrupt points."""
    builder = build_workflow()
    return builder.compile(
        checkpointer=workflow_checkpointer, 
        interrupt_before=[WorkflowNodes.DECISION_GATE, WorkflowNodes.WAIT_FOR_DOCS, WorkflowNodes.WAIT_FOR_ADJUSTER]
    )

async def run_workflow_with_sse(case_id: str, initial_state: Optional[ClaimWorkflowState]):
    """Executes the LangGraph and pipes updates to SSE and CaseStore in real-time."""
    graph = get_graph()
    config = {"configurable": {"thread_id": case_id}}
    
    # 1. Start execution
    try:
        await graph.ainvoke(initial_state, config)
    except Exception as e:
        print(f"ERROR: [WorkflowEngine] Graph execution failed for {case_id}: {str(e)}", flush=True)
        # Emit explicit failure event so frontend can stop spinners
        await SseService.emit(case_id, SseWorkflowCompletedData(
            case_id=case_id,
            timestamp=now_iso(),
            status=CaseStatus.FAILED,
            pdf_ready=False,
            auditor_loop_count=0,
            officer_challenge_count=0,
            chatbox_enabled=False,
            topology=TOPOLOGY,
        ))
        raise # Re-raise to let the background task handler know it failed

    # 2. Final status resolution & Completion Event
    final_state_wrapper = await graph.aget_state(config)
    final_status = final_state_wrapper.values.get("status")
    
    display_status = CaseStatus.AWAITING_APPROVAL # Default for finished graph
    if final_status in ("inconsistent", "escalated"):
        display_status = CaseStatus.ESCALATED
    elif final_status == "awaiting_adjuster":
        display_status = CaseStatus.AWAITING_ADJUSTER
    elif final_status == "completed":
        display_status = CaseStatus.AWAITING_APPROVAL
    elif final_status == "awaiting_docs":
        display_status = CaseStatus.AWAITING_DOCS
    elif final_status == "running":
        if final_state_wrapper.next:
             if WorkflowNodes.DECISION_GATE in final_state_wrapper.next:
                 display_status = CaseStatus.AWAITING_APPROVAL
             elif WorkflowNodes.WAIT_FOR_DOCS in final_state_wrapper.next:
                 display_status = CaseStatus.AWAITING_DOCS
             elif WorkflowNodes.WAIT_FOR_ADJUSTER in final_state_wrapper.next:
                 display_status = CaseStatus.AWAITING_ADJUSTER
             else:
                 display_status = CaseStatus.RUNNING
        else:
             display_status = CaseStatus.AWAITING_APPROVAL
    
    print(f"DEBUG: [WorkflowEngine] Phase finished for {case_id}. next_nodes={final_state_wrapper.next}", flush=True)
    await SseService.emit(case_id, SseWorkflowCompletedData(
        case_id=case_id,
        timestamp=now_iso(),
        status=display_status,
        pdf_ready=False,
        auditor_loop_count=final_state_wrapper.values.get("auditor_loop_count", 0),
        officer_challenge_count=final_state_wrapper.values.get("officer_challenge_count", 0),
        chatbox_enabled=display_status in (CaseStatus.AWAITING_APPROVAL, CaseStatus.ESCALATED, CaseStatus.AWAITING_DOCS, CaseStatus.AWAITING_ADJUSTER),
        topology=TOPOLOGY,
    ))
    return final_state_wrapper

async def resume_workflow_with_sse(case_id: str, updates: dict):
    """Resumes a suspended graph thread with new state updates."""
    graph = get_graph()
    config = {"configurable": {"thread_id": case_id}}
    
    # Apply updates to the thread state
    await graph.aupdate_state(config, updates)
    
    # Resume execution (passing None to signal resumption of existing thread)
    return await run_workflow_with_sse(case_id, None)

def node_sse_wrapper(node_name: str, func):
    """Wraps a node to automatically emit SSE status and data updates."""
    async def wrapper(state: ClaimWorkflowState):
        case_id = state.get("case_id")
        agent_id = _NODE_TO_AGENT.get(node_name)
        section = _NODE_TO_SECTION.get(node_name)
        
        # Special handling for parallel start
        if node_name == "parallel_analysis_start":
             for cluster_agent in [AgentId.POLICY, AgentId.LIABILITY, AgentId.DAMAGE, AgentId.FRAUD]:
                 await _emit_agent_status(case_id, cluster_agent, AgentStatus.WORKING)
        
        # 1. Emit Status: WORKING
        if agent_id:
            await _emit_agent_status(case_id, agent_id, AgentStatus.WORKING)
            
        # 2. Execute Node
        if asyncio.iscoroutinefunction(func):
            result = await func(state)
        else:
            result = func(state)
            
        # 3. Handle Result & SSE (Data + Status)
        if result and isinstance(result, dict):
            # Extract main payload for this node
            data = None
            for key, val in result.items():
                if key.endswith("_results") or key == "payout_results" or key == "case_facts":
                    data = val
                    break

            # Citations for this section come from {agent}_citations (e.g.
            # policy_citations, auditor_citations).
            citations: list[dict] = []
            if agent_id:
                citations_key = f"{agent_id.value.lower()}_citations"
                raw_citations = result.get(citations_key, [])
                if isinstance(raw_citations, list):
                    citations = raw_citations

            # Sync to Store & Emit Output
            case = CaseStore.get(case_id)
            trace_log: list[str] = []
            if case:
                async with CaseStore.lock(case_id):
                    # 1. Store Blackboard Data
                    if section and data is not None:
                        case.set_section_data(section, data)

                    # 2. Store Citations (replace, not append; keeps reruns clean)
                    if section:
                        case.set_section_citations(section, citations)

                    # 3. Store Trace Logs
                    trace_log = result.get("trace_log", [])
                    if trace_log and agent_id:
                        rs = case.agent_states.get(agent_id)
                        if rs:
                            rs.logs.extend(trace_log)

                    if "auditor_loop_count" in result:
                        case.auditor_loop_count = int(result.get("auditor_loop_count") or 0)

            # Emit Output SSE
            if section and data is not None:
                await SseService.emit(case_id, SseAgentOutputData(
                    case_id=case_id,
                    timestamp=now_iso(),
                    agent=agent_id,
                    section=section,
                    data=data,
                    logs=trace_log,
                    citations=citations,
                ))

            # Emit Status: COMPLETED or ERROR
            if agent_id:
                final_status = AgentStatus.COMPLETED
                if data and isinstance(data, dict) and data.get("status") == "error":
                    final_status = AgentStatus.ERROR
                await _emit_agent_status(case_id, agent_id, final_status)
        
        return result
    return wrapper

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
