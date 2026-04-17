import traceback
import os
import asyncio
import random
import json
import re
from typing import Any, Optional

import requests
from dotenv import load_dotenv
from langchain_core.callbacks import (
    CallbackManagerForLLMRun,
    AsyncCallbackManagerForLLMRun,
)
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.runnables import RunnableWithFallbacks, Runnable
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, BaseMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel
from srcs.config import get_settings

# Mute Gemini "ALTS creds ignored. Not running on GCP and untrusted ALTS is not enabled."
os.environ['GRPC_VERBOSITY'] = 'NONE'

MessagesType = None | str | dict | BaseMessage | list[str | dict | BaseMessage]


# -----------------------------------------------------------------------------
# ChatMinimax — custom LangChain BaseChatModel wrapping MiniMax's API
# -----------------------------------------------------------------------------

class ChatMinimax(BaseChatModel):
    """LangChain chat model backed by MiniMax chatcompletion_v2.

    Drop-in replacement for ChatGoogleGenerativeAI inside RotatingLLM.
    Supports regular chat and tool calling (OpenAI-compatible format).
    """

    model: str = "MiniMax-M2.5"
    api_key: str = ""
    base_url: str = "https://api.minimax.io"
    temperature: float = 0.7
    max_tokens: int = 4096

    @property
    def _llm_type(self) -> str:
        return "minimax"

    def bind_tools(self, tools: Any, **kwargs: Any) -> Runnable:
        """Bind tools to the model."""
        from langchain_core.utils.function_calling import convert_to_openai_tool
        formatted_tools = [convert_to_openai_tool(tool) for tool in tools]
        return self.bind(tools=formatted_tools, **kwargs)

    @staticmethod
    def _convert_messages(messages: list[BaseMessage]) -> list[dict]:
        """Convert LangChain message objects to OpenAI-format dicts."""
        result: list[dict] = []
        for msg in messages:
            if isinstance(msg, SystemMessage):
                result.append({"role": "system", "content": msg.content})
            elif isinstance(msg, HumanMessage):
                result.append({"role": "user", "content": msg.content})
            elif isinstance(msg, AIMessage):
                d: dict[str, Any] = {"role": "assistant", "content": msg.content or ""}
                if msg.tool_calls:
                    d["tool_calls"] = [
                        {
                            "id": tc["id"],
                            "type": "function",
                            "function": {
                                "name": tc["name"],
                                "arguments": (
                                    json.dumps(tc["args"])
                                    if isinstance(tc["args"], dict)
                                    else tc["args"]
                                ),
                            },
                        }
                        for tc in msg.tool_calls
                    ]
                result.append(d)
            elif isinstance(msg, ToolMessage):
                result.append({
                    "role": "tool",
                    "content": msg.content,
                    "tool_call_id": msg.tool_call_id,
                })
            else:
                result.append({"role": "user", "content": str(msg.content)})
        return result

    @staticmethod
    def _parse_response(data: dict) -> AIMessage:
        """Parse MiniMax JSON response into an AIMessage."""
        choices = data.get("choices", [])
        if not choices:
            return AIMessage(content="")

        message = choices[0].get("message", {})
        content = message.get("content", "") or ""
        
        # Remove <think>...</think> tags which MiniMax sometimes includes
        content = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL).strip()
        
        tool_calls_data = message.get("tool_calls", [])

        if tool_calls_data:
            tool_calls = []
            for tc in tool_calls_data:
                func = tc.get("function", {})
                args_str = func.get("arguments", "{}")
                try:
                    args = json.loads(args_str) if isinstance(args_str, str) else args_str
                except json.JSONDecodeError:
                    args = {"raw": args_str}
                tool_calls.append({
                    "id": tc.get("id", ""),
                    "name": func.get("name", ""),
                    "args": args,
                })
            return AIMessage(content=content, tool_calls=tool_calls)

        return AIMessage(content=content)

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _build_payload(self, messages: list[BaseMessage], **kwargs: Any) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": self._convert_messages(messages),
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
        }
        if kwargs.get("tools"):
            payload["tools"] = kwargs["tools"]
        return payload

    def _call_api(self, payload: dict) -> dict:
        """Synchronous HTTP POST to MiniMax chatcompletion_v2."""
        resp = requests.post(
            f"{self.base_url}/v1/text/chatcompletion_v2",
            headers=self._headers(),
            json=payload,
            timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()

        base = data.get("base_resp", {})
        if base.get("status_code", 0) != 0:
            raise RuntimeError(
                f"MiniMax API error {base.get('status_code')}: "
                f"{base.get('status_msg', 'unknown')}"
            )
        return data

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: Optional[list[str]] = None,
        run_manager: Optional[CallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> ChatResult:
        payload = self._build_payload(messages, **kwargs)
        if stop:
            payload["stop"] = stop

        data = self._call_api(payload)
        ai_message = self._parse_response(data)
        usage = data.get("usage", {})

        return ChatResult(
            generations=[
                ChatGeneration(message=ai_message, generation_info={"usage": usage})
            ]
        )

    async def _agenerate(
        self,
        messages: list[BaseMessage],
        stop: Optional[list[str]] = None,
        run_manager: Optional[AsyncCallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> ChatResult:
        return await asyncio.to_thread(
            self._generate, messages, stop, None, **kwargs
        )


# -----------------------------------------------------------------------------
# LLMResponse / LLMConfig / RotatingLLM — unchanged public API
# -----------------------------------------------------------------------------

class LLMResponse(BaseModel):
    text: str
    model: str
    status: str
    json_data: dict | list | None = None

class LLMConfig:
    """Stores configuration for creating an LLM instance"""

    def __init__(self, provider: str, api_key: str, model: str):
        self.provider = provider
        self.api_key = api_key
        self.model = model

    def create_runnable(self, temperature: float = 0.7, model: str | None = None, **kwargs) -> Runnable:
        """Create a runnable with specified parameters"""
        use_model = model if model else self.model
        if self.provider == "gemini":
            return ChatGoogleGenerativeAI(
                model=use_model,
                google_api_key=self.api_key,
                temperature=temperature,
                **kwargs
            )
        elif self.provider == "minimax":
            return ChatMinimax(
                model=use_model,
                api_key=self.api_key,
                temperature=temperature,
                **kwargs
            )
        else:
            raise ValueError(f"Unknown provider: {self.provider}")

    def __str__(self):
        return f"{self.provider.capitalize()} ({self.model}) {{api=...{self.api_key[-10:]}}}"


class RotatingLLM:
    MAX_RETRIES = 2

    def __init__(self, llm_configs: list[LLMConfig], cooldown_seconds: int = 60):
        self.llm_configs: list[LLMConfig] = llm_configs
        self.cooldown_seconds = cooldown_seconds
        self._rotation_index = 0
        self._lock = asyncio.Lock()
        if self.llm_configs:
            random.shuffle(self.llm_configs)

    @staticmethod
    def _normalize_message(messages: str | dict | BaseMessage) -> BaseMessage:
        if isinstance(messages, str):
            return HumanMessage(content=messages)
        elif isinstance(messages, dict):
            role = messages.get("role", "user")
            text = messages.get("text", "")
            mappings = {
                "system": SystemMessage,
                "assistant": AIMessage,
                "tool": ToolMessage
            }
            return mappings.get(role, HumanMessage)(content=text)
        elif isinstance(messages, BaseMessage):
            return messages
        raise ValueError(f"Unsupported message type: {type(messages)}")

    @staticmethod
    def format_messages(
            messages: MessagesType
    ) -> list[BaseMessage] | None:
        if messages is None:
            return None
        if isinstance(messages, str | dict | BaseMessage):
            return [RotatingLLM._normalize_message(messages)]
        elif isinstance(messages, list):
            return [RotatingLLM._normalize_message(i) for i in messages]
        raise ValueError(f"Unsupported message type: {type(messages)}")

    async def _rotate(self) -> list[LLMConfig]:
        async with self._lock:
            if not self.llm_configs:
                return []
            self.llm_configs = self.llm_configs[1:] + self.llm_configs[:1]
            return self.llm_configs

    async def get_runnable(self, temperature: float = 0.7, model: str | None = None, **kwargs) -> RunnableWithFallbacks:
        ordered = await self._rotate()
        if not ordered:
            raise RuntimeError("No LLM configurations loaded from .env")
        ordered = ordered[:RotatingLLM.MAX_RETRIES + 1]  # +1 for main
        runnables = [config.create_runnable(temperature=temperature, model=model, **kwargs) for config in ordered]
        primary, *fallbacks = runnables
        return RunnableWithFallbacks(runnable=primary, fallbacks=fallbacks)

    async def get_runnable_with_tools(self, tools: list, temperature: float = 0.7, model: str | None = None, **kwargs) -> RunnableWithFallbacks:
        ordered = await self._rotate()
        if not ordered:
            raise RuntimeError("No LLM configurations loaded from .env")
        runnables = [config.create_runnable(temperature=temperature, model=model, **kwargs).bind_tools(tools) for config in ordered]
        primary, *fallbacks = runnables
        return RunnableWithFallbacks(runnable=primary, fallbacks=fallbacks)

    async def get_next_api_key(self, provider: str = "minimax") -> str:
        async with self._lock:
            key_list = list(filter(lambda x: x.provider == provider, await self._rotate()))
            if not key_list:
                raise ValueError(f"No API key found for provider: {provider}")
            return key_list[0].api_key

    @staticmethod
    def try_get_json(text: str):
        try:
            clean_text = re.sub(
                r'^\s*```json\s*([\s\S]*?)\s*```\s*$',
                r'\1',
                text.strip(),
            ).strip()
            return json.loads(clean_text)
        except json.JSONDecodeError:
            return None

    async def send_message_get_json(
            self,
            messages: str | list[BaseMessage] | dict[str, str],
            config: dict | None = None,
            retry: int = 3,
            temperature: float = 0.0,
            model: str | None = None,
            **llm_kwargs
    ) -> LLMResponse:
        result = None

        for i in range(retry):
            result = await self.send_message(messages, config, temperature=temperature, model=model, **llm_kwargs)
            parsed = RotatingLLM.try_get_json(result.text)
            if parsed is None:
                continue
            result.json_data = parsed
            return result

        if result is None:
            raise RuntimeError("Failed to get response from LLM")
            
        raise RuntimeError(f"Failed to parse json from LLM {result.model_dump_json()}")

    async def send_message(
            self,
            messages: str | list[BaseMessage] | dict[str, str],
            config: dict | None = None,
            temperature: float = 0.0,
            model: str | None = None,
            **llm_kwargs
    ) -> LLMResponse:
        msgs = self.format_messages(messages)
        runnable: Runnable = await self.get_runnable(temperature=temperature, model=model, **llm_kwargs)

        print(f"\n[ROTATING_LLM] === SENDING REQUEST ===")
        for idx, m in enumerate(msgs):
            content_str: str = str(m.content)
            if len(content_str) > 500:
                content_str = content_str[:250] + "\n... [TRUNCATED] ...\n" + content_str[-250:]

            if type(m) == HumanMessage:
                print(f"[ROTATING_LLM] Human [{idx}]: {content_str}")
            elif type(m) == SystemMessage:
                print(f"[ROTATING_LLM] System [{idx}]: {content_str}")
            elif type(m) == AIMessage:
                print(f"[ROTATING_LLM] AI [{idx}]: {content_str}")
            else:
                print(f"[ROTATING_LLM] {m.type} [{idx}]: {content_str}")

        for attempt in range(self.MAX_RETRIES):
            try:
                result = await runnable.ainvoke(msgs, config=config)
                content = result.content if hasattr(result, "content") else str(result)
                if isinstance(content, list):
                    text = "".join(
                        block["text"] for block in content
                        if isinstance(block, dict) and block.get("type") == "text"
                    )
                else:
                    text = content

                text_out: str = text
                if len(text_out) > 500:
                    text_out = text_out[:250] + "\n... [TRUNCATED] ...\n" + text_out[-250:]

                print(f"\n[ROTATING_LLM] === RESPONSE ===")
                print(f"[ROTATING_LLM] {text_out}\n")

                return LLMResponse(
                    text=text,
                    model=RotatingLLM._format_runnable(runnable),
                    status="ok"
                )

            except Exception as e:
                traceback.print_exc()
                if attempt == self.MAX_RETRIES - 1:
                    return LLMResponse(text=str(e), model="", status="fail")
                continue

    @staticmethod
    def create_instance_with_env():
        """Create RotatingLLM instance from environment variables"""
        llm_configs = []
        load_dotenv()

        for key in get_settings().GEMINI_API_KEY_LIST:
            if key and key.strip():
                llm_configs.append(LLMConfig(
                    provider="gemini",
                    api_key=key,
                    model=get_settings().GEMINI_MODEL_NAME
                ))

        if get_settings().MINIMAX_API_KEY and get_settings().MINIMAX_API_KEY.strip():
            llm_configs.append(LLMConfig(
                provider="minimax",
                api_key=get_settings().MINIMAX_API_KEY,
                model=get_settings().MINIMAX_TEXT_MODEL
            ))

        return RotatingLLM(llm_configs)

    @staticmethod
    def _format_runnable(runnable: Runnable) -> str:
        api_key = ""
        if isinstance(runnable, ChatGoogleGenerativeAI):
            api_key = str(runnable.google_api_key.get_secret_value())
        elif isinstance(runnable, ChatMinimax):
            api_key = runnable.api_key
        elif isinstance(runnable, RunnableWithFallbacks):
            return RotatingLLM._format_runnable(runnable.runnable)

        return f"{runnable.__class__.__name__} ({runnable.model}) {{api=...{api_key[-10:]}}}"

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

        # Example with additional parameters
        result3 = await rotating_llm.send_message(
            "Say hello",
            temperature=1.0,
            max_tokens=50
        )
        print("With max_tokens:", result3)


    import sys

    if sys.platform.startswith("win") and sys.version_info < (3, 14):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
