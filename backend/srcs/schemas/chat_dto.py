"""Chat DTOs and SSE event schemas."""
from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel


# -- SSE event types ----------------------------------------------------------

class SseEvent(str, Enum):
    """Server-Sent Event types."""
    NOTIF = "Notif"
    REPLIES = "Replies"
    UPDATE_CHECKLIST = "UpdateChecklist"
    EDIT_DOCUMENT = "EditDocument"
    TTS_RESULT = "TTSResult"
    INGESTION_PROGRESS = "IngestionProgress"
    TOOL_CALL = "ToolCall"
    UI_UPDATE = "UIUpdate"


# -- SSE payload models -------------------------------------------------------

class SseNotifData(BaseModel):
    """Notification payload (e.g. processing status)."""
    message: str


class SseRepliesData(BaseModel):
    """Assistant reply delivered over SSE."""
    message_id: Optional[str] = None
    text: str
    audio_url: Optional[str] = None


class SseUpdateChecklistData(BaseModel):
    """Checklist update event payload (future use)."""
    checklist_id: str
    items: list[dict]


class SseEditDocumentData(BaseModel):
    """Document edit event payload (future use)."""
    document_id: str
    content: str


class SseTTSResultData(BaseModel):
    """TTS generation result event payload."""
    text: str
    audio_url: str


class SseIngestionProgressData(BaseModel):
    """Ingestion pipeline progress event payload."""
    topic_id: str
    stage: str
    message: str


class SseToolCallData(BaseModel):
    """Tool invocation event — emitted when the agent calls a tool."""
    tool_name: str
    arguments: dict


class SseUIUpdateData(BaseModel):
    """UI Update event."""
    # Placeholders for future use
    pass

# -- REST request / response models ------------------------------------------

class ChatRequest(BaseModel):
    """Request body for sending a chat message."""
    topic_id: str
    message: str
    agent_id: Optional[str] = None


class ChatMessageResponse(BaseModel):
    """Single chat message in a history list."""
    message_id: str
    role: str
    message: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatAcceptedResponse(BaseModel):
    """Returned immediately when a chat message is accepted for processing.

    The actual agent reply will be delivered over the SSE stream.
    """
    status: str = "success"
    user_message: ChatMessageResponse


class AgentReplyResponse(BaseModel):
    """Response returned after the agent answers (kept for non-SSE callers)."""
    user_message: ChatMessageResponse
    assistant_message: ChatMessageResponse
