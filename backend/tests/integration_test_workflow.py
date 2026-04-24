import asyncio
import os
import json
import sys
import datetime
from dotenv import load_dotenv

# Fix Windows console encoding for UTF-8 (checkmarks, emojis from LLM)
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

# Load env before imports that might use it
from pathlib import Path
BACKEND_ROOT = Path(__file__).parent.parent
load_dotenv(dotenv_path=BACKEND_ROOT / ".env")

from srcs.services.workflow_engine import build_workflow
from srcs.schemas.state import ClaimWorkflowState, WorkflowNodes, HumanDecision
from srcs.services.case_store import CaseStore
from langgraph.checkpoint.memory import MemorySaver

async def run_integration_test():
    print("=== Starting Integration Test ===")
    
    # 1. Prepare Documents from uploads
    uploads_dir = Path(__file__).parent / "uploads"
    documents = []
    
    files = sorted(os.listdir(uploads_dir))
    for f in files:
        if f.endswith(".md"):
            with open(os.path.join(uploads_dir, f), "r", encoding="utf-8") as file:
                content = file.read()
                documents.append({
                    "filename": f,
                    "content": content,
                    "doc_type": "unknown" # Let the agent tag it
                })
    
    print(f"Loaded {len(documents)} documents.")

    # 2. Initialize State
    initial_state: ClaimWorkflowState = {
        "case_id": "TEST-CLM-001",
        "documents": documents,
        "case_facts": {},
        "policy_results": {},
        "liability_results": {},
        "damage_results": {},
        "fraud_results": {},
        "payout_results": {},
        "trace_log": [],
        "active_challenge": None,
        "status": "submitted",
        "human_decision": None,
        "human_audit_log": [],
        "current_agent": None,
        "latest_user_message": None
    }

    # 3. Compile Graph with HITL support
    
    memory = MemorySaver()
    builder = build_workflow()
    graph = builder.compile(
        checkpointer=memory, 
        interrupt_before=["wait_for_docs", WorkflowNodes.DECISION_GATE]
    )

    # 4. Run Graph (Phase 1: Until Interrupt)
    print("\n--- Running Graph (Phase 1: Autonomous Analysis) ---")
    config = {"configurable": {"thread_id": "test_thread"}}
    
    try:
        async for event in graph.astream(initial_state, config, stream_mode="updates"):
            for node, update in event.items():
                print(f"\n[Node: {node}]")
                if update is None: continue
                if "trace_log" in update:
                    for log in update["trace_log"]: print(f"  > {log}")
                
                # Show results for critical sections
                for key in ["case_facts", "policy_results", "liability_results", "fraud_results", "payout_results"]:
                    if key in update:
                        print(f"  * {key}: {json.dumps(update[key], indent=2)}")

        # 5. Check if interrupted at Decision Gate
        state = await graph.aget_state(config)
        if state.next and state.next[0] == WorkflowNodes.DECISION_GATE:
            print(f"\n[HITL] Graph interrupted at {state.next[0]}.")
            print("[HITL] Simulating Human Officer Challenge...")
            
            # Simulate officer feedback: "The fraud score is high, please re-evaluate liability."
            human_feedback = "The Fraud agent found a major inconsistency in the rear-impact story. Re-evaluate the liability based on a single-vehicle impact into a pole."
            
            # Update state with human feedback to trigger the Refiner node
            # This follows the pattern where latest_user_message triggers refiner logic
            await graph.aupdate_state(config, {"latest_user_message": human_feedback})
            
            print("[HITL] Feedback injected. Resuming workflow...")
            
            # 6. Resume Graph (Phase 2: Surgical Rerun)
            # We use a loop because the graph interrupts before every Decision Gate.
            # 1st resume: Runs Refiner -> Interrupts before Decision Gate
            # 2nd resume: Runs Decision Gate -> Routes to Cluster -> Payout -> Auditor -> Interrupts before Decision Gate
            # 3rd resume: Runs Decision Gate -> Finishes
            while True:
                async for event in graph.astream(None, config, stream_mode="updates"):
                    for node, update in event.items():
                        print(f"\n[Node: {node}]")
                        if update is None: continue
                        if "trace_log" in update:
                            for log in update["trace_log"]: print(f"  > {log}")
                        
                        if "active_challenge" in update:
                            print(f"  ! ACTIVE CHALLENGE: {json.dumps(update['active_challenge'], indent=2)}")

                # Check if we are done or just interrupted again
                state = await graph.aget_state(config)
                if not state.next:
                    break
                
                # If we are at Decision Gate and have an active challenge or it's just been refined, 
                # we need to resume to proceed through the router.
                print(f"\n[HITL] Graph paused at {state.next}. Resuming to continue workflow...")

        # 7. Final State Check
        final_state = await graph.aget_state(config)
        print("\n--- Final State ---")
        print(f"Status: {final_state.values.get('status')}")
        print(f"Final Action: {final_state.values.get('payout_results', {}).get('recommended_action')}")
        
    except Exception as e:
        print(f"\n!!! ERROR during graph execution: {str(e)}")
        import traceback
        traceback.print_exc()

async def run_hitl_test():
    print("\n\n=== Starting HITL Hardening Test ===")
    
    # 1. Start with NO documents to trigger wait_for_docs
    initial_state: ClaimWorkflowState = {
        "case_id": "HITL-TEST-001",
        "documents": [], # Missing docs
        "processed_indices": [],
        "case_facts": {},
        "policy_results": {},
        "liability_results": {},
        "damage_results": {},
        "fraud_results": {},
        "payout_results": {},
        "trace_log": [],
        "active_challenge": None,
        "status": "submitted",
        "human_decision": None,
        "human_audit_log": [],
        "current_agent": None,
        "latest_user_message": None
    }
    
    memory = MemorySaver()
    builder = build_workflow()
    graph = builder.compile(
        checkpointer=memory, 
        interrupt_before=["wait_for_docs", WorkflowNodes.DECISION_GATE]
    )
    
    config = {"configurable": {"thread_id": "hitl_thread"}}
    
    # Phase 1: Expect interrupt at wait_for_docs
    print("\n--- Phase 1: Missing Documents ---")
    async for event in graph.astream(initial_state, config, stream_mode="updates"):
        for node, update in event.items():
            print(f"[Node: {node}] type={type(update)} update={update}")
            if isinstance(update, dict):
                print(f"  status={update.get('status')}")

    state = await graph.aget_state(config)
    if state.next and state.next[0] == "wait_for_docs":
        print("[SUCCESS] Interrupted at wait_for_docs as expected.")
    
    # Phase 2: Add documents and resume
    print("\n--- Phase 2: Resuming with Documents ---")
    # Simulate doc upload
    docs = [{"filename": "police_report.md", "content": "Accident report...", "doc_type": "police_report"}]
    # We need all 8 docs to pass validation gate, or just mock the validation gate to pass.
    # For simplicity, let's just provide enough docs to pass validation in this test.
    from srcs.services.agents.intake import REQUIRED_DOCS
    full_docs = [{"filename": f"{dt}.md", "content": "mock content", "doc_type": dt} for dt in REQUIRED_DOCS]
    
    await graph.aupdate_state(config, {"documents": full_docs})
    
    async for event in graph.astream(None, config, stream_mode="updates"):
        for node, update in event.items():
            print(f"[Node: {node}]")
            if node == WorkflowNodes.DECISION_GATE: break

    # Phase 3: Human Override (Force Approve)
    print("\n--- Phase 3: Human Force Approve ---")
    state = await graph.aget_state(config)
    if state.next and state.next[0] == WorkflowNodes.DECISION_GATE:
        print(f"[HITL] Interrupted at {state.next[0]}.")
        
        override: HumanDecision = {
            "action": "force_approve",
            "reasoning": "Special case override by manager.",
            "operator_id": "Operator Jack",
            "timestamp": datetime.datetime.now().isoformat()
        }
        
        await graph.aupdate_state(config, {"human_decision": override, "human_audit_log": [override]})
        print("[HITL] Force approve injected. Resuming...")
        
        async for event in graph.astream(None, config, stream_mode="updates"):
            for node, update in event.items():
                print(f"[Node: {node}]")

    final_state = await graph.aget_state(config)
    print(f"\nFinal Node: {final_state.next if final_state.next else 'END'}")
    print(f"Status: {final_state.values.get('status')}")
    print(f"Audit Log Count: {len(final_state.values.get('human_audit_log', []))}")

async def run_escalation_test():
    print("\n\n=== Starting Escalation Test ===")
    
    # Start with docs but mock missing financial data in previous nodes
    from srcs.services.agents.intake import REQUIRED_DOCS
    full_docs = [{"filename": f"{dt}.md", "content": "mock content", "doc_type": dt} for dt in REQUIRED_DOCS]
    
    initial_state: ClaimWorkflowState = {
        "case_id": "ESC-TEST-001",
        "documents": full_docs,
        "processed_indices": [],
        "case_facts": {},
        "policy_results": {"excess_myr": None}, # CRITICAL MISSING
        "liability_results": {},
        "damage_results": {"verified_total": 1000.0},
        "fraud_results": {},
        "payout_results": {},
        "trace_log": [],
        "active_challenge": None,
        "status": "submitted",
        "human_decision": None,
        "human_audit_log": [],
        "current_agent": None,
        "latest_user_message": None
    }
    
    memory = MemorySaver()
    builder = build_workflow()
    graph = builder.compile(checkpointer=memory, interrupt_before=[WorkflowNodes.DECISION_GATE])
    config = {"configurable": {"thread_id": "esc_thread"}}
    
    print("\n--- Phase 1: Expecting Escalation ---")
    async for event in graph.astream(initial_state, config, stream_mode="updates"):
        for node, update in event.items():
            print(f"[Node: {node}]")
            if node == WorkflowNodes.DECISION_GATE: break

    state = await graph.aget_state(config)
    print(f"Current Status: {state.values.get('status')}")
    if state.values.get('status') == "escalated":
        print("[SUCCESS] Workflow escalated as expected.")
        
        # Phase 2: Resolve escalation
        print("\n--- Phase 2: Resolving Escalation ---")
        await graph.aupdate_state(config, {
            "policy_results": {"excess_myr": 500.0}, 
            "status": "submitted" # Reset status to allow router to proceed
        })
        
        async for event in graph.astream(None, config, stream_mode="updates"):
            for node, update in event.items():
                print(f"[Node: {node}]")
                
    final_state = await graph.aget_state(config)
    print(f"\nFinal Node: {final_state.next if final_state.next else 'END'}")
    print(f"Status: {final_state.values.get('status')}")

if __name__ == "__main__":
    # asyncio.run(run_integration_test())
    asyncio.run(run_hitl_test())
    asyncio.run(run_escalation_test())
