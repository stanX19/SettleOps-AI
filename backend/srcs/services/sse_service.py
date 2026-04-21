"""SSE service — manages per-session event streams.

A single session (`session_id` — for claims, the `case_id`) can have multiple
live subscribers (e.g. two browser tabs, or snapshot-refresh reconnects). Each
subscriber owns its own `asyncio.Queue`, and `emit()` fans out to all of them.
Dropping a queue with `unsubscribe()` is idempotent; emitting to a session
with no subscribers is a silent no-op, per v5 §13.
"""
import asyncio
from enum import Enum
from typing import Any

from srcs.schemas.chat_dto import (
    SseEvent,
    SseNotifData,
    SseRepliesData,
    SseUpdateChecklistData,
    SseEditDocumentData,
    SseTTSResultData,
    SseIngestionProgressData,
    SseToolCallData,
    SseUIUpdateData,
)
from srcs.schemas.case_dto import (
    CaseSseEvent,
    SseWorkflowStartedData,
    SseAgentStatusChangedData,
    SseAgentOutputData,
    SseAgentMessageToAgentData,
    SseArtifactCreatedData,
    SseWorkflowCompletedData,
)


# Mapping from payload class → event enum (value used as the SSE `event:` name)
_EVENT_MAP: dict[type, Enum] = {
    # Chat events
    SseNotifData: SseEvent.NOTIF,
    SseRepliesData: SseEvent.REPLIES,
    SseUpdateChecklistData: SseEvent.UPDATE_CHECKLIST,
    SseEditDocumentData: SseEvent.EDIT_DOCUMENT,
    SseTTSResultData: SseEvent.TTS_RESULT,
    SseIngestionProgressData: SseEvent.INGESTION_PROGRESS,
    SseToolCallData: SseEvent.TOOL_CALL,
    SseUIUpdateData: SseEvent.UI_UPDATE,
    # Case (claims workflow) events
    SseWorkflowStartedData: CaseSseEvent.WORKFLOW_STARTED,
    SseAgentStatusChangedData: CaseSseEvent.AGENT_STATUS_CHANGED,
    SseAgentOutputData: CaseSseEvent.AGENT_OUTPUT,
    SseAgentMessageToAgentData: CaseSseEvent.AGENT_MESSAGE_TO_AGENT,
    SseArtifactCreatedData: CaseSseEvent.ARTIFACT_CREATED,
    SseWorkflowCompletedData: CaseSseEvent.WORKFLOW_COMPLETED,
}


class SseService:
    """Manages active SSE subscribers keyed by session_id.

    Supports multiple concurrent subscribers per session (broadcast).
    """

    # session_id → list of subscriber queues
    _subscribers: dict[str, list[asyncio.Queue]] = {}

    # -- Subscriber lifecycle --------------------------------------------

    @classmethod
    def subscribe(cls, session_id: str) -> asyncio.Queue:
        """Register a new subscriber for *session_id* and return its queue."""
        queue: asyncio.Queue = asyncio.Queue()
        cls._subscribers.setdefault(session_id, []).append(queue)
        return queue

    @classmethod
    def unsubscribe(cls, session_id: str, queue: asyncio.Queue) -> None:
        """Remove *queue* from the subscriber list; drop the session key if empty."""
        queues = cls._subscribers.get(session_id)
        if not queues:
            return
        try:
            queues.remove(queue)
        except ValueError:
            return
        if not queues:
            cls._subscribers.pop(session_id, None)

    @classmethod
    def has_subscribers(cls, session_id: str) -> bool:
        return bool(cls._subscribers.get(session_id))

    # -- Emit helpers -----------------------------------------------------

    @classmethod
    async def _broadcast(cls, session_id: str, event_name: str, data_json: str) -> None:
        queues = cls._subscribers.get(session_id)
        if not queues:
            return
        msg = {"event": event_name, "data": data_json}
        # Snapshot the list: a subscriber may unsubscribe concurrently.
        for q in list(queues):
            await q.put(msg)

    @classmethod
    async def emit(cls, session_id: str, payload: Any) -> None:
        """Auto-detect the event type from *payload* and broadcast to all subscribers.

        Silently drops when no subscriber is connected.
        """
        event_type = _EVENT_MAP.get(type(payload))
        if event_type is None:
            raise ValueError(f"Unknown SSE payload type: {type(payload).__name__}")
        await cls._broadcast(
            session_id,
            event_type.value,
            payload.model_dump_json(exclude_none=True),
        )
