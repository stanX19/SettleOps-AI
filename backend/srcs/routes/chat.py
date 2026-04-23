"""Chat routes — send messages, stream responses via SSE, and manage history."""
import asyncio

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from srcs.database import get_db
from srcs.schemas.chat_dto import ChatRequest, ChatMessageResponse, ChatAcceptedResponse
from srcs.services.chat_service import ChatService
from srcs.services.sse_service import CLOSE_EVENT_KEY, SseService

router: APIRouter = APIRouter(prefix="/api/v1/chat", tags=["chat"])


# -- SSE stream endpoint -----------------------------------------------------

@router.get("/stream/{session_id}")
async def sse_stream(session_id: str):
    """Open a Server-Sent Events stream for *session_id* (= topic_id).

    The client should connect here **before** sending a POST to ``/api/v1/chat/``.
    Events are pushed by background tasks (agent reply, TTS, etc.).
    """
    queue = SseService.subscribe(session_id)

    async def _event_generator():
        yield ": ping\ndata: \n\n"
        try:
            while True:
                msg = await queue.get()
                # Broadcaster disconnected this subscriber (queue full).
                # Exit cleanly; client can reconnect and re-fetch state.
                if msg.get("event") == CLOSE_EVENT_KEY:
                    break
                yield f"event: {msg['event']}\ndata: {msg['data']}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            SseService.unsubscribe(session_id, queue)

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# -- Send a chat message (returns immediately, streams reply via SSE) ---------

@router.post("/", response_model=ChatAcceptedResponse)
async def send_message(
    body: ChatRequest,
    db: Session = Depends(get_db),
) -> ChatAcceptedResponse:
    """Accept a user message and kick off the agent in the background.

    Returns ``{ status: "success", user_message }`` immediately.
    The agent reply is delivered over the SSE stream.
    """
    user_msg = await ChatService.send_message(db, body.topic_id, body.message)

    return ChatAcceptedResponse(
        user_message=ChatMessageResponse.model_validate(user_msg),
    )


# -- History endpoints --------------------------------------------------------

@router.get("/history", response_model=list[ChatMessageResponse])
async def get_history(
    topic_id: str,
    db: Session = Depends(get_db),
) -> list[ChatMessageResponse]:
    """Return chat history for a topic."""
    messages = ChatService.get_history(db, topic_id)
    return [ChatMessageResponse.model_validate(m) for m in messages]


@router.delete("/history")
async def clear_history(
    topic_id: str,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """Delete all chat messages for a topic."""
    deleted: int = ChatService.clear_history(db, topic_id)
    return {"message": f"Cleared {deleted} messages"}
