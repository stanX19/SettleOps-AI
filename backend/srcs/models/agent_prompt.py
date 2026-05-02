"""SQLAlchemy model for operator-customized agent prompts."""

from sqlalchemy import Column, String, Text, DateTime
from sqlalchemy.sql import func

from srcs.database import Base


class AgentPromptOverride(Base):
    __tablename__ = "agent_prompt_overrides"

    agent_id = Column(String, primary_key=True)
    custom_prompt = Column(Text, nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
