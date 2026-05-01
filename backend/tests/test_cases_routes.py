import asyncio

from srcs.routes.cases import get_document_text
from srcs.schemas.case_dto import CaseStatus
from srcs.services.case_store import CaseState, CaseStore


def test_chat_transcript_text_reads_plain_file(tmp_path):
    transcript = tmp_path / "chat_transcript.txt"
    transcript.write_text("Customer: hello\nAgent: hi", encoding="utf-8")
    state = CaseState(
        case_id="CLM-2026-00001",
        submitted_at="2026-05-01T00:00:00+00:00",
        status=CaseStatus.SUBMITTED,
        chat_transcript=str(transcript),
    )
    CaseStore._reset()
    CaseStore.add(state)

    result = asyncio.run(get_document_text(state.case_id, "chat_transcript"))

    assert result["filename"] == "chat_transcript.txt"
    assert result["text"] == "Customer: hello\nAgent: hi"
    assert result["method"] == "direct_file"
    assert result["error"] is None
