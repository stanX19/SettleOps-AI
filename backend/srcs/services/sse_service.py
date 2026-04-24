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


# Per-subscriber queue bound. The stream generator wakes every 15 s for a
# keepalive (see cases.py stream handler), so a healthy consumer drains each
# queue well under this cap. Reaching the cap means the client isn't reading
# at all — we disconnect that subscriber and let it recover via the snapshot
# endpoint documented in api_sse_plan.md §6 rather than unbounded memory use.
_MAX_QUEUE_SIZE: int = 256

# Sentinel published into a queue when the broadcaster is forcing a close.
# The stream generator recognises this key and exits cleanly.
CLOSE_EVENT_KEY: str = "__close__"


class SseService:
    """Manages active SSE subscribers keyed by session_id.

    Supports multiple concurrent subscribers per session (broadcast).
    """

    # session_id → list of subscriber queues
    _subscribers: dict[str, list[asyncio.Queue]] = {}

    # -- Subscriber lifecycle --------------------------------------------

    @classmethod
    def subscribe(cls, session_id: str) -> asyncio.Queue:
        """Register a new subscriber for *session_id* and return its queue.

        Queues are bounded (`_MAX_QUEUE_SIZE`). When the bound is hit during
        `_broadcast`, the subscriber is disconnected via a close sentinel
        rather than allowing unbounded memory growth for a stalled client.
        """
        queue: asyncio.Queue = asyncio.Queue(maxsize=_MAX_QUEUE_SIZE)
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
        print(f"DEBUG: [SSE] Broadcasting to {session_id}. Subscribers: {len(queues) if queues else 0}", flush=True)
        if not queues:
            return
        # Snapshot the list: a subscriber may unsubscribe concurrently.
        for q in list(queues):
            try:
                q.put_nowait({"event": event_name, "data": data_json})
            except asyncio.QueueFull:
                # Subscriber isn't draining. Disconnect rather than block the
                # broadcaster or grow memory unboundedly — the client can
                # recover via GET /cases/{id}. Free one slot for the close
                # sentinel so the stream generator wakes up and exits.
                try:
                    q.get_nowait()
                except asyncio.QueueEmpty:
                    pass
                try:
                    q.put_nowait({"event": CLOSE_EVENT_KEY, "data": ""})
                except asyncio.QueueFull:
                    pass
                cls.unsubscribe(session_id, q)

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
