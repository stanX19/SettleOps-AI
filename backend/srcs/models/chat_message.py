"""ChatMessage ORM model."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, DateTime, Column
from srcs.database import Base


class ChatMessage(Base):
    """A single chat message (user or assistant) within a topic."""

    __tablename__ = "chat_history"

    message_id = Column(String, primary_key=True, default=lambda: uuid.uuid4().hex)
    topic_id = Column(String, index=True, nullable=False)
    role = Column(String, nullable=False)  # "user" | "assistant"
    message = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
