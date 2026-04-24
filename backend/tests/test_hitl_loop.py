import asyncio
import unittest
from unittest.mock import MagicMock, patch
import os
import sys
from pathlib import Path

# Add the project backend to sys.path
backend_root = str(Path(__file__).resolve().parents[1] / "project" / "backend")
if backend_root not in sys.path:
    sys.path.append(backend_root)

from srcs.schemas.case_dto import CaseStatus, AgentId, AgentStatus
from srcs.services.case_store import CaseStore, CaseState, now_iso
from srcs.services.case_service import resume_workflow_with_sse

class TestHitlLoop(unittest.IsolatedAsyncioTestCase):
    async def test_approve_case_resumption_and_audit(self):
        """Verify that approving a case triggers resumption and logs Operator Jack."""
        # 1. Setup mock case in ESCALATED status
        case_id = "CLM-2026-00001"
        state = CaseState(
            case_id=case_id,
            submitted_at=now_iso(),
            status=CaseStatus.ESCALATED
        )
        CaseStore.add(state)
        
        # Mock the engine's resumption function
        with patch("srcs.services.case_service.resume_workflow_with_sse_engine") as mock_resume:
            # Create a mock that returns a coroutine
            async def mock_res(*args, **kwargs):
                return None
            mock_resume.side_effect = mock_res
            
            # 2. Call service layer resumption
            await resume_workflow_with_sse(
                case_id,
                operator_name="Operator Jack",
                action="approve",
                reason="Manual override",
                force_approve=True
            )
            
            # 3. Verify audit log
            self.assertEqual(len(state.human_audit_log), 1)
            self.assertEqual(state.human_audit_log[0]["operator"], "Operator Jack")
            self.assertEqual(state.human_audit_log[0]["action"], "approve")
            self.assertEqual(state.human_audit_log[0]["reason"], "Manual override")
            
            # 4. Verify engine was called with correct updates
            mock_resume.assert_called_once()
            updates = mock_resume.call_args[0][1]
            self.assertTrue(updates["force_approve"])
            self.assertEqual(updates["human_decision_reason"], "Manual override")
            self.assertEqual(updates["human_audit_log"], state.human_audit_log)

    async def test_ingestion_resumption(self):
        """Verify that document upload triggers resumption from AWAITING_DOCS."""
        case_id = "CLM-2026-00002"
        state = CaseState(
            case_id=case_id,
            submitted_at=now_iso(),
            status=CaseStatus.AWAITING_DOCS
        )
        CaseStore.add(state)
        
        with patch("srcs.services.case_service.resume_workflow_with_sse_engine") as mock_resume:
            async def mock_res(*args, **kwargs):
                return None
            mock_resume.side_effect = mock_res
            
            await resume_workflow_with_sse(
                case_id,
                operator_name="Operator Jack",
                action="upload_docs"
            )
            
            self.assertTrue(mock_resume.called)
            updates = mock_resume.call_args[0][1]
            self.assertEqual(updates["status"], "running")

if __name__ == "__main__":
    unittest.main()
