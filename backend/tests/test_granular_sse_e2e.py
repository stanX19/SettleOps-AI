import time
import threading
import json
import requests
import uvicorn
import asyncio
import os
import sys

print("DEBUG: Script started", flush=True)

# Ensure we can import from project root
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

print(f"DEBUG: sys.path appended. __file__: {__file__}", flush=True)

from tests.test_client import TestClient, Colors, ThreadFilter, TestSocket
from srcs.schemas.case_dto import AgentId, AgentStatus, CaseStatus

# ---------------------------------------------------------------------------
# Mock RotatingLLM to return deterministic JSON results for each node
# ---------------------------------------------------------------------------

async def mock_send_message_get_json(prompt, temperature=0.0, **kwargs):
    from srcs.services.agents.rotating_llm import LLMResponse
    
    # 1. Intake Tagging
    if "Categorize the following NEW documents" in prompt:
        data = {
            "0": "car_photo_plate",
            "1": "damage_closeup",
            "2": "driver_license",
            "3": "road_tax_reg",
            "4": "nric",
            "5": "policy_covernote",
            "6": "police_report",
            "7": "workshop_quote"
        }
        return LLMResponse(text=json.dumps(data), model="mock", status="ok", json_data=data)
    
    # 2. Policy Analysis
    if "Policy Specialist" in prompt:
        data = {"data": {"claim_type": "own_damage", "max_payout_myr": 10000, "excess_myr": 500, "depreciation_percent": 0.1}, "reasoning": "Mock policy analysis"}
        return LLMResponse(text=json.dumps(data), model="mock", status="ok", json_data=data)

    # 3. Liability Narrative
    if "Liability Adjuster" in prompt:
        data = {"data": {"incident_time": "10:00 AM", "location": "Kuala Lumpur", "description": "Rear-end impact"}, "reasoning": "Mock narrative"}
        return LLMResponse(text=json.dumps(data), model="mock", status="ok", json_data=data)

    # 4. Liability POI
    if "Visual Forensic Analyst" in prompt:
        data = {"data": {"poi_location": "rear", "damage_severity": "minor"}, "reasoning": "Mock POI analysis"}
        return LLMResponse(text=json.dumps(data), model="mock", status="ok", json_data=data)

    # 5. Damage Audit
    if "Damage Assessor" in prompt:
        data = {"data": {"verified_total": 1200.0, "suspicious_parts": []}, "reasoning": "Mock damage audit"}
        return LLMResponse(text=json.dumps(data), model="mock", status="ok", json_data=data)

    # 6. Fraud Assessment
    if "Fraud Investigator" in prompt:
        data = {"data": {"suspicion_score": 0.1, "red_flags": []}, "reasoning": "Mock fraud check"}
        return LLMResponse(text=json.dumps(data), model="mock", status="ok", json_data=data)

    # 7. Auditor
    if "Senior Insurance Auditor" in prompt:
        data = {"is_consistent": True, "findings": "None", "suggested_action": "approve", "target_cluster": "none"}
        return LLMResponse(text=json.dumps(data), model="mock", status="ok", json_data=data)

    return LLMResponse(text="{}", model="mock", status="ok", json_data={})

import srcs.services.agents.rotating_llm as _llm_mod
_llm_mod.rotating_llm.send_message_get_json = mock_send_message_get_json

from main import app

PORT = 8002

def start_server():
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="error")

def run_test():
    # 0. Preflight
    TestClient.preflight_check(PORT, interactive=False, auto_kill=True)
    
    print(f"{Colors.BLUE}Starting Server (port {PORT})...{Colors.END}", flush=True)
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()
    time.sleep(2)

    client = TestClient(f"http://127.0.0.1:{PORT}", actor_name="Tester")
    
    print(f"\n{Colors.BOLD}=== RUNNING GRANULAR SSE E2E TEST ==={Colors.END}\n")

    socket = None
    try:
        # 1. Create Case
        print(f"\n{Colors.BOLD}--- 1. Create Case ---{Colors.END}")
        case_res = client.post("/api/v1/cases/", description="Create new case", expected_status=201)
        case_id = case_res["case_id"]
        assert case_id.startswith("CLM-"), f"Invalid case_id: {case_id}"

        # 2. Connect SSE
        print(f"\n{Colors.BOLD}--- 2. Connect SSE ---{Colors.END}")
        socket = TestSocket(url=f"http://127.0.0.1:{PORT}/api/v1/cases/{case_id}/stream", actor_name="SSE")
        socket.connect()
        socket.listen() # Listen in background
        time.sleep(1)

        # 3. Upload Documents
        print(f"\n{Colors.BOLD}--- 3. Upload 8 Documents ---{Colors.END}")
        
        # Field mapping based on cases.py submit_case_documents
        # Required: police_report, policy_pdf, repair_quotation, photos (list)
        files = [
            ("police_report", ("police_report.txt", "Mock content for police_report", "application/pdf")),
            ("policy_pdf", ("policy_covernote.txt", "Mock content for policy_covernote", "application/pdf")),
            ("repair_quotation", ("workshop_quote.txt", "Mock content for workshop_quote", "application/pdf")),
            ("photos", ("car_photo_plate.jpg", "Mock content for car_photo_plate", "image/jpeg")),
            ("photos", ("damage_closeup.jpg", "Mock content for damage_closeup", "image/jpeg")),
            ("photos", ("driver_license.jpg", "Mock content for driver_license", "image/jpeg")),
            ("photos", ("road_tax_reg.jpg", "Mock content for road_tax_reg", "image/jpeg")),
            ("photos", ("nric.jpg", "Mock content for nric", "image/jpeg")),
        ]
        
        client.post(f"/api/v1/cases/{case_id}/documents", description="Upload 8 documents", files=files)
        print(f"{Colors.GREEN}[OK] Documents uploaded successfully.{Colors.END}")

        # 4. Wait for workflow to complete
        print(f"\n{Colors.BOLD}--- 4. Waiting for Workflow Events ---{Colors.END}")
        
        # We wait for workflow.completed
        timeout = 45 # Increased timeout
        start_time = time.time()
        completed_found = False
        last_event_count = 0
        
        while time.time() - start_time < timeout:
            current_events = socket.events_received
            if len(current_events) > last_event_count:
                # Print new events
                for e in current_events[last_event_count:]:
                    print(f"  [Event Captured] {e['event']} - status: {e.get('data', {}).get('status', 'N/A')}", flush=True)
                last_event_count = len(current_events)
            
            if any(e["event"] == "workflow.completed" for e in current_events):
                completed_found = True
                break
            time.sleep(1)
            if int(time.time() - start_time) % 5 == 0:
                print(f"  ... waiting ({int(time.time() - start_time)}s) - {len(current_events)} events so far", flush=True)
        
        assert completed_found, f"Timed out waiting for workflow.completed. Events received: {len(socket.events_received)}"

        # 5. Verify Events
        print(f"\n{Colors.BOLD}--- 5. Verifying Granular Events ---{Colors.END}")
        
        # a) Check workflow.started
        started_event = next(e for e in socket.events_received if e["event"] == "workflow.started")
        assert started_event["data"]["trigger"] == "submit"
        assert len(started_event["data"]["documents"]) == 8
        print(f"{Colors.GREEN}[OK] workflow.started received with correct trigger and doc count.{Colors.END}")

        # b) Check sub-task events for Liability
        # We expect liability_narrative_task and liability_poi_task
        status_events = [e for e in socket.events_received if e["event"] == "agent.status_changed"]
        liab_narrative_events = [e for e in status_events if e["data"].get("sub_task") == "liability_narrative_task"]
        
        if not liab_narrative_events:
            print(f"{Colors.RED}DEBUG: No events found for liability_narrative_task. All status events:{Colors.END}")
            for e in status_events:
                # Use str representation to avoid key errors if data is not as expected
                print(f"  - {e['data']}")
        
        assert any(e["data"]["status"] == "working" for e in liab_narrative_events), "Missing 'working' for liability_narrative_task"
        assert any(e["data"]["status"] == "completed" for e in liab_narrative_events), "Missing 'completed' for liability_narrative_task"
        print(f"{Colors.GREEN}[OK] Granular sub-task events found for liability_narrative_task.{Colors.END}")

        liab_poi_events = [e for e in socket.events_received if e["event"] == "agent.status_changed" and e["data"].get("sub_task") == "liability_poi_task"]
        assert any(e["data"]["status"] == "working" for e in liab_poi_events), "Missing 'working' for liability_poi_task"
        assert any(e["data"]["status"] == "completed" for e in liab_poi_events), "Missing 'completed' for liability_poi_task"
        print(f"{Colors.GREEN}[OK] Granular sub-task events found for liability_poi_task.{Colors.END}")

        # c) Check workflow.completed topology
        completed_event = next(e for e in socket.events_received if e["event"] == "workflow.completed")
        assert "topology" in completed_event["data"]
        assert "liability" in completed_event["data"]["topology"]
        assert "liability_narrative_task" in completed_event["data"]["topology"]["liability"]
        print(f"{Colors.GREEN}[OK] workflow.completed includes dynamic topology.{Colors.END}")

        # 6. Verify Snapshot
        print(f"\n{Colors.BOLD}--- 6. Verify Snapshot Topology ---{Colors.END}")
        snap = client.get(f"/api/v1/cases/{case_id}", description="Get case snapshot")
        assert "topology" in snap
        assert snap["topology"]["liability"] == ["liability_narrative_task", "liability_poi_task"]
        
        # Check granular agent states
        liab_state = snap["agents"].get("liability")
        assert "sub_tasks" in liab_state
        assert liab_state["sub_tasks"]["liability_narrative_task"]["status"] == "completed"
        print(f"{Colors.GREEN}[OK] Snapshot contains topology and granular sub-task states.{Colors.END}")

        print(f"\n{Colors.GREEN}{Colors.BOLD}ALL GRANULAR SSE TESTS PASSED!{Colors.END}")

    except Exception as e:
        print(f"\n{Colors.RED}{Colors.BOLD}TEST FAILED: {e}{Colors.END}")
        import traceback
        traceback.print_exc()
    finally:
        if socket and socket.response:
            socket.response.close()

if __name__ == "__main__":
    run_test()
