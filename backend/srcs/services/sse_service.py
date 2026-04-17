"""SSE service — manages per-topic event streams."""
import asyncio
from typing import Union

from srcs.schemas.chat_dto import (
    SseEvent,
    SseNotifData,
    SseRepliesData,
    SseUpdateChecklistData,
    SseEditDocumentData,
    SseTTSResultData,
    SseIngestionProgressData,
    SseToolCallData,
    SseUIUpdateData
)

# Type alias for all supported SSE payloads
SsePayload = Union[
    SseNotifData,
    SseRepliesData,
    SseUpdateChecklistData,
    SseEditDocumentData,
    SseTTSResultData,
    SseIngestionProgressData,
    SseToolCallData,
    SseUIUpdateData,
]

# Mapping from payload class → event name
_EVENT_MAP: dict[type, SseEvent] = {
    SseNotifData: SseEvent.NOTIF,
    SseRepliesData: SseEvent.REPLIES,
    SseUpdateChecklistData: SseEvent.UPDATE_CHECKLIST,
    SseEditDocumentData: SseEvent.EDIT_DOCUMENT,
    SseTTSResultData: SseEvent.TTS_RESULT,
    SseIngestionProgressData: SseEvent.INGESTION_PROGRESS,
    SseToolCallData: SseEvent.TOOL_CALL,
    SseUIUpdateData: SseEvent.UI_UPDATE,
}


class SseService:
    """Manages active SSE streams keyed by session_id."""

    # session_id → asyncio.Queue of SSE messages
    _streams: dict[str, asyncio.Queue] = {}

    # -- Stream lifecycle -------------------------------------------------

    @classmethod
    def open(cls, session_id: str) -> asyncio.Queue:
        """Register (or reuse) a stream for *session_id* and return its queue."""
        if session_id not in cls._streams:
            cls._streams[session_id] = asyncio.Queue()
        return cls._streams[session_id]

    @classmethod
    def close(cls, session_id: str) -> None:
        """Remove the stream for *session_id*."""
        cls._streams.pop(session_id, None)

    @classmethod
    def is_open(cls, session_id: str) -> bool:
        return session_id in cls._streams

    # -- Emit helpers -----------------------------------------------------

    @classmethod
    async def _emit(cls, session_id: str, event: SseEvent, payload: SsePayload) -> None:
        """Push a raw event onto the stream queue."""
        queue = cls._streams.get(session_id)
        if queue is not None:
            await queue.put({
                "event": event.value,
                "data": payload.model_dump_json(exclude_none=True),
            })

    @classmethod
    async def emit(cls, session_id: str, payload: SsePayload) -> None:
        """Auto-detect the event type from *payload* and emit."""
        event_type = _EVENT_MAP.get(type(payload))
        if event_type is None:
            raise ValueError(f"Unknown SSE payload type: {type(payload).__name__}")
        await cls._emit(session_id, event_type, payload)
