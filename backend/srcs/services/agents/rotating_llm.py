import enum
import traceback
import asyncio
import random
import json
import re
from typing import Any

from dotenv import load_dotenv
from langchain_core.callbacks import (
    CallbackManagerForLLMRun,
    AsyncCallbackManagerForLLMRun,
)
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.runnables import Runnable
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, BaseMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, ConfigDict

from srcs.config import get_settings
from srcs.logger import logger

# Type aliases
MessagesType = str | dict[str, Any] | BaseMessage | list[str | dict[str, Any] | BaseMessage] | None


class _Outcome(enum.Enum):
    """Outcomes of an LLM call for error classification and penalization."""
    SUCCESS = "success"
    RATE_LIMIT = "rate_limit"
    ERROR = "unknown_error"


# -----------------------------------------------------------------------------
# LLMResponse / LLMConfig / RotatingLLM — single-provider (ilmu) configuration
# -----------------------------------------------------------------------------

class LLMResponse(BaseModel):
    """Container for the response from an LLM."""
    text: str
    model: str
    status: str
    json_data: dict[str, Any] | list[Any] | None = None


class LLMConfig:
    """Stores configuration for creating an LLM instance."""

    def __init__(
            self,
            provider: str,
            api_key: str,
            model: str,
            base_url: str | None = None,
    ) -> None:
        self.provider: str = provider
        self.api_key: str = api_key
        self.model: str = model
        self.base_url: str | None = base_url

    def create_runnable(
            self,
            temperature: float = 0.7,
            model: str | None = None,
            **kwargs: Any
    ) -> Runnable:
        """Create a runnable with specified parameters.

        Args:
            temperature: Sampling temperature.
            model: Model name override.
            **kwargs: Extra parameters for the LLM.

        Returns:
            A LangChain Runnable.
        """
        use_model: str = model if model else self.model
        if self.provider == "ilmu":
            return ChatOpenAI(
                model=use_model,
                base_url=self.base_url,
                api_key=self.api_key,
                temperature=temperature,
                **kwargs
            )
        raise ValueError(f"Unknown provider: {self.provider}")

    def __str__(self) -> str:
        return f"{self.provider.capitalize()} ({self.model}) {{api=...{self.api_key[-10:]}}}"


class RotatingRunnable(BaseChatModel):
    """Proxy chat model that delegates calls to RotatingLLM._invoke_core.

    This ensures all calls (including those from LangGraph agents) pass through
    the rotation, counting, and retry logic.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    rotating_llm: Any
    temperature: float = 0.7
    model: str | None = None
    extra_kwargs: dict[str, Any] = {}

    @property
    def _llm_type(self) -> str:
        return "rotating_proxy"

    def _generate(
            self,
            messages: list[BaseMessage],
            stop: list[str] | None = None,
            run_manager: CallbackManagerForLLMRun | None = None,
            **kwargs: Any
    ) -> ChatResult:
        raise NotImplementedError("Use async interface (_agenerate)")

    async def _agenerate(
            self,
            messages: list[BaseMessage],
            stop: list[str] | None = None,
            run_manager: AsyncCallbackManagerForLLMRun | None = None,
            **kwargs: Any
    ) -> ChatResult:
        merged: dict[str, Any] = {**self.extra_kwargs, **kwargs}
        if stop:
            merged["stop"] = stop

        result, _ = await self.rotating_llm._invoke_core(
            messages, self.temperature, self.model, **merged
        )
        return ChatResult(generations=[ChatGeneration(message=result)])

    def bind_tools(self, tools: Any, **kwargs: Any) -> Runnable:
        """Bind tools to the proxy model."""
        from langchain_core.utils.function_calling import convert_to_openai_tool
        formatted: list[dict[str, Any]] = [convert_to_openai_tool(t) for t in tools]
        return self.bind(tools=formatted, **kwargs)


class RotatingLLM:
    MAX_RETRIES = 2

    _PENALTIES: dict[_Outcome, int] = {
        _Outcome.SUCCESS: 1,
        _Outcome.RATE_LIMIT: 20,
        _Outcome.ERROR: 1000,
    }

    def __init__(
            self,
            llm_configs: list[LLMConfig],
            cooldown_seconds: int = 60
    ) -> None:
        """Initialize RotatingLLM with a pool of configurations.

        Args:
            llm_configs: List of LLM configurations to rotate.
            cooldown_seconds: Wait time (seconds) after rate limit (not used in current logic).
        """
        self.llm_configs: list[LLMConfig] = llm_configs
        self.cooldown_seconds: int = cooldown_seconds
        self._lock: asyncio.Lock = asyncio.Lock()
        self._call_counts: dict[str, int] = {c.api_key: 0 for c in llm_configs}
        random.shuffle(self.llm_configs)

    @staticmethod
    def _normalize_message(messages: str | dict[str, Any] | BaseMessage) -> BaseMessage:
        """Convert various message formats to LangChain BaseMessage.

        Args:
            messages: Input message in str, dict, or BaseMessage format.

        Returns:
            The normalized BaseMessage.

        Raises:
            ValueError: If input message type is unsupported.
        """
        if isinstance(messages, str):
            return HumanMessage(content=messages)
        elif isinstance(messages, dict):
            role: str = messages.get("role", "user")
            text: str = messages.get("text", "")
            mapping: dict[str, type[BaseMessage]] = {
                "system": SystemMessage,
                "assistant": AIMessage,
                "tool": ToolMessage
            }
            return mapping.get(role, HumanMessage)(content=text)
        elif isinstance(messages, BaseMessage):
            return messages
        raise ValueError(f"Unsupported message type: {type(messages)}")

    @staticmethod
    def format_messages(messages: MessagesType) -> list[BaseMessage] | None:
        """Format input into a list of LangChain BaseMessages."""
        if messages is None:
            return None
        if isinstance(messages, (str, dict, BaseMessage)):
            return [RotatingLLM._normalize_message(messages)]
        elif isinstance(messages, list):
            return [RotatingLLM._normalize_message(i) for i in messages]
        raise ValueError(f"Unsupported message type: {type(messages)}")

    def _log_request(self, messages: list[BaseMessage]) -> None:
        """Log the request messages if DEBUG is enabled."""
        logger.debug("[RotatingLLM] === SENDING REQUEST ===")
        for idx, msg in enumerate(messages):
            content: str = str(msg.content)
            if len(content) > 500:
                prefix = content[:250]
                suffix = content[-250:]
                content = f"{prefix}\n... [TRUNCATED {len(content)-500} chars] ...\n{suffix}"

            role: str = getattr(msg, 'type', 'unknown')
            logger.debug("[RotatingLLM] %s [%d]: %s", role.capitalize(), idx, content)

    def _log_health(self) -> None:
        """Log a formatted health summary of all API keys."""
        counts: list[int] = list(self._call_counts.values())
        min_count: int = min(counts) if counts else 0
        threshold_error: int = RotatingLLM._PENALTIES[_Outcome.ERROR]
        threshold_limit: int = int(RotatingLLM._PENALTIES[_Outcome.RATE_LIMIT] * 0.8)

        logger.info("[ROTATING_LLM] USAGE SUMMARY:")
        for config in self.llm_configs:
            count: int = self._call_counts[config.api_key]
            diff: int = count - min_count
            is_penalized: bool = diff >= threshold_error
            is_limited: bool = diff >= threshold_limit

            icon: str = "[X]" if is_penalized else "[!]" if is_limited else "[OK]"
            status: str = " (PENALIZED)" if is_penalized else ""

            logger.info("  %s %-7s (..%s) : [ %-6d ]%s",
                        icon, config.provider, config.api_key[-4:], count, status)

    async def _invoke_core(
            self,
            messages: list[BaseMessage],
            temperature: float,
            model: str | None,
            **kwargs: Any
    ) -> tuple[AIMessage, LLMConfig]:
        """Single chokepoint for picking key, calling LLM, and recording outcome.

        Args:
            messages: List of messages to send.
            temperature: Sampling temperature.
            model: Model name override.
            **kwargs: Additional LLM parameters.

        Returns:
            Tuple of (AI response message, config used).

        Raises:
            Exception: The last exception encountered if all retries fail.
        """
        last_exc: Exception | None = None
        self._log_request(messages)

        for attempt in range(self.MAX_RETRIES + 1):
            config: LLMConfig = await self._pick_config()
            runnable: Runnable = config.create_runnable(temperature=temperature, model=model)

            logger.info("[RotatingLLM] Calling %s attempt=%d/%d key=...%s",
                        config.provider, attempt + 1, self.MAX_RETRIES + 1, config.api_key[-4:])

            try:
                result: AIMessage = await runnable.ainvoke(messages, **kwargs)
                async with self._lock:
                    self._call_counts[config.api_key] += self._PENALTIES[_Outcome.SUCCESS]

                logger.info("[RotatingLLM] OK key=...%s\n%s", config.api_key[-4:], result.content)
                self._log_health()
                return result, config

            except Exception as exc:
                outcome: _Outcome = self._classify_error(exc)
                penalty: int = self._PENALTIES[outcome]
                if penalty > 0:
                    async with self._lock:
                        self._call_counts[config.api_key] += penalty

                logger.warning("[RotatingLLM] FAIL %s: %s | key=...%s",
                               outcome.value, type(exc).__name__, config.api_key[-4:])
                self._log_health()
                last_exc = exc

        raise last_exc

    @staticmethod
    def _classify_error(exc: Exception) -> _Outcome:
        """Classify exceptions into rate limit or unknown error.

        Args:
            exc: Exception to classify.

        Returns:
            The classified outcome.
        """
        status: int = getattr(getattr(exc, 'response', None), 'status_code', 0)
        if status == 429 or "429" in str(exc):
            return _Outcome.RATE_LIMIT

        return _Outcome.ERROR

    async def _pick_config(self) -> LLMConfig:
        """Pick the configuration with the lowest call count.

        Returns:
            The LLM configuration with the lowest count.
        """
        async with self._lock:
            return min(self.llm_configs, key=lambda c: self._call_counts[c.api_key])

    @staticmethod
    def _extract_text(content: str | list[str | dict[str, Any]]) -> str:
        """Extract text from various content formats.

        Args:
            content: Raw content string or list of content blocks.

        Returns:
            The extracted text.
        """
        if isinstance(content, str):
            return content
        if not isinstance(content, list):
            return str(content)

        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
                continue
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text", ""))

        return "".join(parts) if parts else str(content)

    async def get_runnable(
            self,
            temperature: float = 0.7,
            model: str | None = None,
            **kwargs: Any
    ) -> Runnable:
        """Get a proxy runnable that routes calls through the rotation pool.

        Args:
            temperature: Sampling temperature.
            model: Model name override.
            **kwargs: Extra parameters for the LLM.

        Returns:
            A RotatingRunnable instance.
        """
        return RotatingRunnable(
            rotating_llm=self,
            temperature=temperature,
            model=model,
            extra_kwargs=kwargs
        )

    async def get_runnable_with_tools(
            self,
            tools: list[Any],
            temperature: float = 0.7,
            model: str | None = None,
            **kwargs: Any
    ) -> Runnable:
        """Get a proxy runnable with tools bound.

        Args:
            tools: List of tools to bind.
            temperature: Sampling temperature.
            model: Model name override.
            **kwargs: Extra parameters for the LLM.

        Returns:
            A bound proxy runnable.
        """
        runnable: Runnable = await self.get_runnable(
            temperature=temperature, model=model, **kwargs
        )
        return runnable.bind_tools(tools)

    @staticmethod
    def strip_code_block(text: str):
        clean_text = re.sub(
            r'^\s*```.*\s*([\s\S]*?)\s*```\s*$',
            r'\1',
            text.strip(),
        ).strip()
        return clean_text

    @staticmethod
    def try_get_json(text: str):
        try:
            return json.loads(RotatingLLM.strip_code_block(text))
        except json.JSONDecodeError:
            return None

    async def send_message_get_json(
            self,
            messages: MessagesType,
            config: dict[str, Any] | None = None,
            retry: int = 3,
            temperature: float = 0.0,
            model: str | None = None,
            **llm_kwargs: Any
    ) -> LLMResponse:
        """
        Sends a message to the rotating LLM pool and gets the result with parsed json

        Args:
            messages: Input messages.
            config: LangChain config (e.g. callbacks).
            retry: Number of JSON parsing retries.
            temperature: Temperature for LLM generation
            model: Specific model to use, overriding config
            **llm_kwargs: Extra LLM parameters.

        Returns:
            The LLMResponse with json_data populated if successful.

        Raises:
            RuntimeError: If all retries fail or parsing fails.
        """
        result: LLMResponse | None = None
        for _ in range(retry):
            result = await self.send_message(
                messages, config, temperature=temperature, model=model, **llm_kwargs
            )
            parsed: Any = RotatingLLM.try_get_json(result.text)
            if parsed is not None:
                result.json_data = parsed
                return result

        if result is None:
            raise RuntimeError("Failed to get response from LLM")

        raise RuntimeError(f"Failed to parse JSON from LLM: {result.model_dump_json()}")

    async def send_message(
            self,
            messages: MessagesType,
            config: dict[str, Any] | None = None,
            temperature: float = 0.0,
            model: str | None = None,
            **llm_kwargs: Any
    ) -> LLMResponse:
        """
        Sends a message to the rotating LLM pool and gets the result

        Args:
            messages: Input messages.
            config: ainvoke's config
            temperature: Temperature for LLM generation
            model: Specific model to use, overriding config
            **llm_kwargs: Extra LLM parameters.

        Returns:
            The LLMResponse object.
        """
        msgs: list[BaseMessage] | None = self.format_messages(messages)
        if msgs is None:
            return LLMResponse(text="", model="", status="fail")

        try:
            result, used_config = await self._invoke_core(
                msgs, temperature, model, **llm_kwargs
            )
            text: str = self._extract_text(result.content)
            return LLMResponse(text=text, model=str(used_config), status="ok")

        except Exception as exc:
            logger.error("[RotatingLLM] All retries exhausted: \n%s", traceback.format_exc())
            return LLMResponse(text=str(exc), model="", status="fail")

    @staticmethod
    def create_instance_with_env():
        """Create RotatingLLM instance from environment variables."""
        load_dotenv()
        settings = get_settings()

        llm_configs: list[LLMConfig] = []
        if settings.ILMU_API_KEY and settings.ILMU_API_KEY.strip():
            llm_configs.append(LLMConfig(
                provider="ilmu",
                api_key=settings.ILMU_API_KEY,
                model=settings.ILMU_MODEL_NAME,
                base_url=settings.ILMU_BASE_URL,
            ))

        return RotatingLLM(llm_configs)

    def __str__(self):
        configs_str = ",\n  ".join([str(config) for config in self.llm_configs])
        return f"{self.__class__.__name__} ({len(self.llm_configs)})[\n  {configs_str}\n]"


rotating_llm = RotatingLLM.create_instance_with_env()

__all__ = ["rotating_llm"]

if __name__ == "__main__":
    async def main():
        # Example with default temperature (0.7)
        result1 = await rotating_llm.send_message_get_json("Return a JSON: {\"hello\": \"world\"}", temperature=0.7)
        print("Default temperature:", result1)

        # Example with custom temperature
        result2 = await rotating_llm.send_message_get_json(
            "Return a JSON: {\"hello\": \"world\"}",
            temperature=0.2
        )
        print("Custom temperature:", result2)

        # Example through proxy runnable
        runnable = await rotating_llm.get_runnable()
        result3 = await runnable.ainvoke("Say hello")
        print("With runnable:", result3)


    import sys

    if sys.platform.startswith("win") and sys.version_info < (3, 14):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
