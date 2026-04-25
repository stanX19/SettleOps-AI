"""Chat service – message persistence, history retrieval, and agent orchestration."""
import asyncio

from langchain_core.messages import HumanMessage, AIMessage, BaseMessage
from sqlalchemy.orm import Session

from srcs.models.chat_message import ChatMessage
from srcs.schemas.chat_dto import SseNotifData, SseRepliesData, SseToolCallData
from srcs.services.sse_service import SseService
from srcs.services.agents.chatbot import chatbot
from srcs.services.case_store import CaseStore


class ChatService:
    """Reusable chat-history operations + agent orchestration."""

    # -- Agent orchestration ----------------------------------------------

    @staticmethod
    async def send_message(
        db: Session, topic_id: str, message: str,
    ) -> ChatMessage:
        """Persist a user message and kick off the agent reply in the background.

        Returns the persisted user ``ChatMessage`` immediately.
        The agent reply is emitted via SSE once ready.
        """
        user_msg = ChatService.add_message(db, topic_id, "user", message)

        asyncio.create_task(
            ChatService._run_agent_and_stream(
                topic_id=topic_id,
                user_prompt=message,
                exclude_message_id=user_msg.message_id,
            )
        )

        return user_msg

    # -- Persistence helpers ----------------------------------------------

    @staticmethod
    def add_message(
        db: Session, topic_id: str, role: str, message: str
    ) -> ChatMessage:
        """Persist a single chat message."""
        msg = ChatMessage(topic_id=topic_id, role=role, message=message)
        db.add(msg)
        db.flush()      # populates server-side defaults (message_id, created_at)
        db.commit()
        return msg

    @staticmethod
    def get_history(
        db: Session, topic_id: str, limit: int = 50
    ) -> list[ChatMessage]:
        """Return chat history for a topic, oldest-first, capped by *limit*."""
        rows = db.query(ChatMessage).filter(ChatMessage.topic_id == topic_id).order_by(ChatMessage.created_at.desc()).limit(limit).all()
        return rows[::-1]

    @staticmethod
    def clear_history(db: Session, topic_id: str) -> int:
        """Delete all messages for a topic. Returns number of deleted rows."""
        result = db.query(ChatMessage).filter(ChatMessage.topic_id == topic_id).delete()
        db.commit()
        return result

    # -- Private helpers --------------------------------------------------

    @staticmethod
    def _build_lc_history(
        db: Session, topic_id: str, exclude_id: str | None = None,
    ) -> list[BaseMessage] | None:
        """Build LangChain-format chat history, optionally skipping one message."""
        rows = ChatService.get_history(db, topic_id, limit=50)
        history: list[BaseMessage] = []
        for row in rows:
            if row.message_id == exclude_id:
                continue
            if row.role == "user":
                history.append(HumanMessage(content=row.message))
            else:
                history.append(AIMessage(content=row.message))
        return history or None

    @staticmethod
    async def _run_agent_and_stream(
        topic_id: str,
        user_prompt: str,
        exclude_message_id: str,
    ) -> None:
        """Background coroutine: build history, call agent, persist reply, emit SSE."""
        from srcs.database import SessionLocal
        from srcs.services.agents.memory_manager import memory_manager

        session_id = topic_id  # topic_id == SSE session_id

        await SseService.emit(session_id, SseNotifData(message="Processing your message…"))

        try:
            # Use a fresh session so we see all previously committed data
            with SessionLocal() as db:
                chat_history = ChatService._build_lc_history(
                    db, topic_id, exclude_id=exclude_message_id,
                )
                
            # Case Context Logic:
            # If topic_id exists in CaseStore, provide the blackboard as context.
            case_state = CaseStore.get(topic_id)
            if case_state:
                blackboard_str = "\n".join([
                    f"### {section.value.upper()}\n{str(data)}"
                    for section, data in case_state.blackboard.items()
                    if data
                ])
                context_text = f"You are the AI Claims Strategist for Case {topic_id}.\n\nCURRENT CLAIM STATUS (Blackboard):\n{blackboard_str}"
            else:
                context_text = memory_manager.load_context()

            async def _on_tool_call(tool_name: str, arguments: dict) -> None:
                await SseService.emit(
                    session_id,
                    SseToolCallData(tool_name=tool_name, arguments=arguments),
                )

            answer: str = await chatbot.ask(
                user_prompt=user_prompt,
                document_text=context_text,
                chat_history=chat_history,
                on_tool_call=_on_tool_call,
            )

            with SessionLocal() as db:
                assistant_msg = ChatService.add_message(db, topic_id, "assistant", answer)
                reply_message_id = assistant_msg.message_id

            await SseService.emit(
                session_id,
                SseRepliesData(message_id=reply_message_id, text=answer),
            )
            
            from srcs.services.speech_service import SpeechService
            SpeechService.enqueue_tts_and_emit(session_id, answer)

        except Exception as exc:
            await SseService.emit(session_id, SseNotifData(message=f"Error: {exc}"))
