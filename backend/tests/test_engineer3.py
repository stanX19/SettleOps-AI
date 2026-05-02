import unittest
from unittest.mock import MagicMock, patch
import asyncio
import sys
import os

# Add backend to sys.path if needed
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from srcs.services.agents.auditor import auditor_node, decision_router
from srcs.services.agents.validator import cluster_validator_task
from srcs.services.agents.refiner import refiner_node
from srcs.schemas.state import ClaimWorkflowState, WorkflowNodes, MAX_ITERATIONS
from srcs.utils.cluster_factory import VALIDATOR_SUBTASK_NAME, create_cluster_subgraph

class TestEngineer3(unittest.IsolatedAsyncioTestCase):
    
    async def test_auditor_node_consistent(self):
        """Test auditor node as final aggregator when validation passed."""
        mock_response = MagicMock()
        mock_response.json_data = {
            "data": {
                "summary": "All good",
                "final_recommendation": "approve",
                "validation_status": "valid",
                "unresolved_issues": [],
                "human_review_notes": "Ready for approval",
            }
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
            self.assertEqual(result["auditor_results"]["validation_status"], "valid")
            self.assertIn("Final synthesis complete", result["trace_log"][0])

    async def test_auditor_node_inconsistent(self):
        """Test auditor node preserves unresolved validator issues."""
        mock_response = MagicMock()
        mock_response.json_data = {
            "data": {
                "summary": "Issues remain",
                "final_recommendation": "escalate",
                "validation_status": "issues_found",
                "unresolved_issues": ["Damage mismatch"],
                "human_review_notes": "Review damage",
            }
        }
        
        with patch("srcs.services.agents.auditor.rotating_llm.send_message_get_json", return_value=mock_response):
            state: ClaimWorkflowState = {
                "case_facts": {},
                "policy_results": {},
                "liability_results": {},
                "damage_results": {
                    "_validation": {
                        "is_valid": False,
                        "mistakes": [{"issue": "Damage mismatch"}],
                        "feedback": "Damage mismatch",
                    }
                },
                "payout_results": {},
                "trace_log": [],
                "status": "analyzing"
            }
            result = await auditor_node(state)
            self.assertEqual(result["status"], "inconsistent")
            self.assertIn("Damage mismatch", result["auditor_results"]["unresolved_issues"])

    async def test_cluster_validator_task_returns_validation_payload(self):
        """Cluster validator inspects cluster results and returns normalized validation."""
        mock_response = MagicMock()
        mock_response.json_data = {
            "data": {
                "is_valid": False,
                "mistakes": [{"field_path": "verified_total", "issue": "Unsupported", "evidence": "Mismatch", "severity": "high"}],
                "feedback": "Recheck the repair total against the citation.",
                "suggested_action": "challenge",
            },
            "reasoning": "Found damage issue",
        }

        with patch("srcs.services.agents.validator.rotating_llm.send_message_get_json", return_value=mock_response):
            state = {
                "case_id": "CLM-TEST",
                "case_facts": {},
                "documents": [],
                "active_challenge": None,
                "results": {"verified_total": 1200},
                "citations": {"damage_quote_audit_task": [{"excerpt": "verified_total: 900"}]},
                "trace_log": [],
            }
            validation, reasoning = await cluster_validator_task("damage", state)
            self.assertFalse(validation["is_valid"])
            self.assertEqual(validation["suggested_action"], "challenge")
            self.assertIn("Recheck", validation["feedback"])
            self.assertEqual(reasoning, "Found damage issue")

    def test_cluster_subgraph_contains_validator_between_tasks_and_aggregator(self):
        """Each cluster graph has a local validator node before its aggregator."""
        async def dummy_task(state, feedback=None):
            return {"data": {"ok": True}, "reasoning": "ok", "citations": []}

        builder = create_cluster_subgraph("policy", [dummy_task])
        self.assertIn(VALIDATOR_SUBTASK_NAME, builder.nodes)
        self.assertIn("aggregator", builder.nodes)

    def test_rotating_llm_json_parser_extracts_fenced_json_after_prose(self):
        """Validator responses often include prose before a fenced JSON block."""
        from srcs.services.agents.rotating_llm import RotatingLLM

        text = """
        I found a mistake.

        ```json
        {"data": {"is_valid": false, "mistakes": []}, "reasoning": "checked"}
        ```
        """

        parsed = RotatingLLM.try_get_json(text)
        self.assertFalse(parsed["data"]["is_valid"])

    async def test_cluster_task_error_does_not_overwrite_domain_results(self):
        """A failed sibling task should not replace useful cluster fields with status=error."""
        async def good_task(state, feedback=None):
            return {
                "data": {"verified_total": 4876.0},
                "reasoning": "quote total extracted",
                "citations": [
                    {
                        "filename": "quote.pdf",
                        "source_type": "text",
                        "excerpt": "Total: RM4,876.00",
                        "comment": "Final quotation total.",
                        "conclusion": "Supports verified_total.",
                        "node_id": "good_task",
                        "field_path": "verified_total",
                    }
                ],
            }

        async def bad_task(state, feedback=None):
            return {
                "data": {"pricing_verdict": "acceptable"},
                "reasoning": "missing citations",
                "citations": [],
            }

        async def validator_stub(cluster_id, state, feedback=None):
            return {"is_valid": True, "mistakes": [], "feedback": "", "suggested_action": "approve"}, "ok"

        graph = create_cluster_subgraph("damage", [good_task, bad_task]).compile()
        state = {
            "case_id": "CLM-TEST",
            "documents": [
                {
                    "filename": "quote.pdf",
                    "source_type": "document",
                    "content": "Total: RM4,876.00",
                }
            ],
            "case_facts": {},
            "active_challenge": None,
            "results": {},
            "citations": {},
            "trace_log": [],
        }

        with patch(
            "srcs.utils.cluster_factory.cluster_validator_task",
            side_effect=validator_stub,
        ):
            result = await graph.ainvoke(state)

        self.assertEqual(result["results"]["verified_total"], 4876.0)
        self.assertNotEqual(result["results"].get("status"), "error")
        self.assertIn("_citation_warning_bad_task", result["results"])

    def test_decision_router_challenge(self):
        """Verify router prioritizes active challenges for surgical reruns."""
        state: ClaimWorkflowState = {
            "active_challenge": {"target_cluster": "damage", "feedback": "too high", "iteration": 1},
            "status": "inconsistent"
        }
        route = decision_router(state)
        self.assertEqual(route, WorkflowNodes.DAMAGE_CLUSTER)

    def test_decision_router_refinement(self):
        """Verify router keeps inconsistent states at the human decision gate."""
        state: ClaimWorkflowState = {
            "active_challenge": None,
            "status": "inconsistent"
        }
        route = decision_router(state)
        self.assertEqual(route, WorkflowNodes.DECISION_GATE)

    def test_decision_router_approval(self):
        """Verify router waits at decision gate until human approval."""
        state: ClaimWorkflowState = {
            "active_challenge": None,
            "status": "awaiting_approval"
        }
        route = decision_router(state)
        self.assertEqual(route, WorkflowNodes.DECISION_GATE)

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
