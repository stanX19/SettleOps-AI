import unittest
from unittest.mock import MagicMock, patch
import asyncio
import sys
import os

# Add backend to sys.path if needed
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from srcs.services.agents.auditor import auditor_node, decision_router
from srcs.services.agents.refiner import refiner_node
from srcs.schemas.state import ClaimWorkflowState, WorkflowNodes, MAX_ITERATIONS

class TestEngineer3(unittest.IsolatedAsyncioTestCase):
    
    async def test_auditor_node_consistent(self):
        """Test auditor node when data is consistent."""
        mock_response = MagicMock()
        mock_response.json_data = {
            "is_consistent": True,
            "findings": "All good",
            "suggested_action": "approve",
            "target_cluster": "none"
        }
        
        with patch("srcs.services.agents.auditor.rotating_llm.send_message_get_json", return_value=mock_response):
            state: ClaimWorkflowState = {
                "case_facts": {},
                "policy_results": {},
                "liability_results": {},
                "damage_results": {},
                "payout_results": {},
                "trace_log": [],
                "status": "analyzing"
            }
            result = await auditor_node(state)
            self.assertEqual(result["status"], "awaiting_approval")
            self.assertIn("Audit complete", result["trace_log"][0])

    async def test_auditor_node_inconsistent(self):
        """Test auditor node when discrepancies are found."""
        mock_response = MagicMock()
        mock_response.json_data = {
            "is_consistent": False,
            "findings": "Damage mismatch",
            "suggested_action": "challenge",
            "target_cluster": "damage"
        }
        
        with patch("srcs.services.agents.auditor.rotating_llm.send_message_get_json", return_value=mock_response):
            state: ClaimWorkflowState = {
                "case_facts": {},
                "policy_results": {},
                "liability_results": {},
                "damage_results": {},
                "payout_results": {},
                "trace_log": [],
                "status": "analyzing"
            }
            result = await auditor_node(state)
            self.assertEqual(result["status"], "inconsistent")
            self.assertIn("Damage mismatch", result["trace_log"][0])

    def test_decision_router_challenge(self):
        """Verify router prioritizes active challenges for surgical reruns."""
        state: ClaimWorkflowState = {
            "active_challenge": {"target_cluster": "damage", "feedback": "too high", "iteration": 1},
            "status": "inconsistent"
        }
        route = decision_router(state)
        self.assertEqual(route, WorkflowNodes.DAMAGE_CLUSTER)

    def test_decision_router_refinement(self):
        """Verify router sends inconsistent states without active challenges to the refiner."""
        state: ClaimWorkflowState = {
            "active_challenge": None,
            "status": "inconsistent"
        }
        route = decision_router(state)
        self.assertEqual(route, WorkflowNodes.REFINER)

    def test_decision_router_approval(self):
        """Verify router proceeds to report generator when all is well."""
        state: ClaimWorkflowState = {
            "active_challenge": None,
            "status": "awaiting_approval"
        }
        route = decision_router(state)
        self.assertEqual(route, WorkflowNodes.REPORT_GENERATOR)

    def test_decision_router_circuit_breaker(self):
        """Verify router breaks the loop if iterations exceed MAX_ITERATIONS."""
        state: ClaimWorkflowState = {
            "active_challenge": {"target_cluster": "damage", "feedback": "too high", "iteration": MAX_ITERATIONS + 1},
            "status": "inconsistent"
        }
        route = decision_router(state)
        self.assertEqual(route, WorkflowNodes.REPORT_GENERATOR)

    async def test_refiner_node_success(self):
        """Test mapping human feedback to a structured challenge."""
        mock_response = MagicMock()
        mock_response.json_data = {
            "target_cluster": "damage",
            "feedback": "Correct the labor hours based on workshop quote"
        }
        
        with patch("srcs.services.agents.refiner.rotating_llm.send_message_get_json", return_value=mock_response):
            state: ClaimWorkflowState = {
                "latest_user_message": "Labor hours are wrong",
                "active_challenge": None,
                "trace_log": []
            }
            result = await refiner_node(state)
            self.assertEqual(result["active_challenge"]["target_cluster"], "damage")
            self.assertEqual(result["active_challenge"]["iteration"], 1)
            self.assertIn("Correct the labor hours", result["active_challenge"]["feedback"])

    async def test_refiner_node_empty(self):
        """Test refiner node with no user input."""
        state: ClaimWorkflowState = {
            "latest_user_message": None,
            "active_challenge": None,
            "trace_log": []
        }
        result = await refiner_node(state)
        self.assertIn("No user message", result["trace_log"][0])

if __name__ == "__main__":
    unittest.main()
