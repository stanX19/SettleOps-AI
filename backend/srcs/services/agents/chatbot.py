import traceback
from typing import Awaitable, Callable

from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, BaseMessage
from langchain.agents import create_agent
from langchain_core.tools import tool

from srcs.services.agents.rotating_llm import rotating_llm
from srcs.services.agents.web_search_service import WebSearchService

from srcs.services.agents.memory_manager import memory_manager

@tool
async def search_web(query: str, num_results: int = 3) -> str:
    """Search the web for the given query and return a summary of results."""
    results = await WebSearchService.search_and_get_all_content(query, num_results)
    if not results:
        return "No results found."
    
    summary = []
    for r in results:
        summary.append(f"Title: {r.url_data.metadata.title}\nURL: {r.url_data.url}\nContent Snippet: {r.content[:1000]}")
    return "\n\n---\n\n".join(summary)


class Chatbot:
    """LangGraph ReAct agent backed by RotatingLLM."""

    def __init__(
        self,
        tools: list | None = None,
        system_prompt: str | None = None,
    ) -> None:
        self.tools: list = tools if tools is not None else []
        self.system_prompt: str = system_prompt or memory_manager.load_system_prompt()

    # -- public API -------------------------------------------------------

    async def ask(
        self,
        user_prompt: str,
        document_text: str | None = None,
        chat_history: list[BaseMessage] | None = None,
        on_tool_call: Callable[[str, dict], Awaitable[None]] | None = None,
    ) -> str:
        messages = self._build_messages(user_prompt, document_text, chat_history)

        try:
            # For tools, we need to bind them
            llm = await rotating_llm.get_runnable_with_tools(tools=self.tools, temperature=0.4)
            agent = create_agent(model=llm, tools=self.tools)

            last_ai_message: BaseMessage | None = None
            async for event in agent.astream_events(
                {"messages": messages}, version="v2",
            ):
                kind = event.get("event", "")

                if kind == "on_chat_model_end":
                    if not on_tool_call: continue
                    output = event.get("data", {}).get("output")
                    if not isinstance(output, AIMessage): continue
                    if not output.tool_calls: continue
                    
                    for tc in output.tool_calls:
                        await on_tool_call(tc["name"], tc.get("args", {}))
                    continue

                if kind == "on_chain_end" and event.get("name") == "LangGraph":
                    output = event.get("data", {}).get("output", {})
                    final_msgs = output.get("messages", [])
                    if not final_msgs: continue
                    last_ai_message = final_msgs[-1]
                    continue

            if last_ai_message is None:
                return "I'm sorry, I couldn't generate a response."

            return self._extract_text(last_ai_message.content)

        except Exception as exc:
            traceback.print_exc()
            return f"An error occurred while processing your request: {exc}"

    # -- internals --------------------------------------------------------

    @staticmethod
    def _extract_text(content: str | list) -> str:
        """Extract plain text from LangChain message content."""
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts = [
                block.get("text", "")
                for block in content
                if isinstance(block, dict) and block.get("type") == "text"
            ]
            return "\n".join(parts) if parts else str(content)
        return str(content)

    def _build_messages(
        self,
        user_prompt: str,
        document_text: str | None,
        chat_history: list[BaseMessage] | None,
    ) -> list[BaseMessage]:
        """Assemble the full message list for the agent."""
        system_parts: list[str] = [self.system_prompt]
        if document_text:
            system_parts.append(
                f"\n\n--- MEMORY CONTEXT ---\n{document_text}\n--- END CONTEXT ---"
            )

        messages: list[BaseMessage] = [SystemMessage(content="\n".join(system_parts))]

        if chat_history:
            messages.extend(chat_history)

        messages.append(HumanMessage(content=user_prompt))
        return messages


# -- Module-level singleton ---------------------------------------------------
chatbot = Chatbot()

if __name__ == "__main__":
    import asyncio
    
    async def _test():
        print("--- Testing Chatbot ---")
        prompt = "What is the capital of France?"
        # Using memory manager generically to load context if needed
        context = memory_manager.load_context()
        
        async def on_call(name: str, args: dict) -> None:
            print(f"[ToolCall] {name}: {args}")
            
        print(f"User: {prompt}")
        response = await chatbot.ask(user_prompt=prompt, document_text=context, on_tool_call=on_call)
        print(f"Assistant:\\n{response}")
        
    import sys
    if sys.platform.startswith("win") and sys.version_info < (3, 14):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(_test())
