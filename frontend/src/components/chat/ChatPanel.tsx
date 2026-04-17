import { useState, useRef, useEffect, useCallback } from "react";
import { X, Sparkles, Trash2, ChevronDown, Search, Loader2 } from "lucide-react";
import { useChatStore, sendChatMessage, chatStore, type StreamingLog } from "../../hooks/useChat.ts";
import { MessageBubble } from "./MessageBubble.tsx";
import { ChatInput } from "./ChatInput.tsx";

function ThoughtBlock({ log }: { log: StreamingLog }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getIcon = () => {
    switch (log.role) {
      case 'search': return <Search size={14} className="text-gray-400" />;
      case 'tool': return <Sparkles size={14} className="text-gray-400" />;
      default: return <ChevronDown size={14} className={`text-gray-400 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />;
    }
  };

  const getTitle = () => {
    if (log.role === 'thought') return "Thought";
    if (log.role === 'search') return "Searched";
    return "Action";
  };

  return (
    <div className="flex flex-col gap-1.5 px-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-[13px] font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors cursor-pointer group"
      >
        <div className="flex items-center justify-center w-5 h-5">
          {getIcon()}
        </div>
        <span>{getTitle()}</span>
      </button>

      {isExpanded && (
        <div className="ml-7 border-l-2 border-gray-100 dark:border-gray-700 pl-4 py-1">
          <p className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-300 font-medium whitespace-pre-wrap">{log.message}</p>
        </div>
      )}
    </div>
  );
}

export function ChatPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamingLogs = useChatStore((s) => s.streamingLogs);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const observer = new MutationObserver(() => {
      setTimeout(() => {
        if (scrollEl) {
          scrollEl.scrollTop = scrollEl.scrollHeight;
        }
      }, 0);
    });

    observer.observe(scrollEl, { childList: true, subtree: true, characterData: true });
    scrollEl.scrollTop = scrollEl.scrollHeight;

    return () => observer.disconnect();
  }, [isOpen]);

  const handleSend = useCallback((message: string) => {
    sendChatMessage(message);
  }, []);

  const clearChat = () => {
    chatStore.clear();
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed right-6 bottom-6 z-50 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-blue-600 text-white shadow-xl transition-transform hover:scale-105 active:scale-95"
        title="Open chat"
      >
        <Sparkles size={24} />
      </button>
    );
  }

  return (
    <div className="flex flex-col w-96 h-full border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden shrink-0">
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <Sparkles size={20} className="text-blue-500" />
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">AI Assistant</h2>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={clearChat}
            className="cursor-pointer text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
            title="Clear Chat"
          >
            <Trash2 size={16} />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="cursor-pointer text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
            title="Collapse"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {messages.length === 0 && (
        <div className="px-8 pb-4 pt-10 text-center text-xs text-gray-400">
          I'm connected and ready to help. I also have memory!
        </div>
      )}

      <div ref={scrollRef} className="flex flex-1 flex-col gap-6 overflow-y-auto p-4 scrollbar-hide">
        {messages.map((msg) => {
          if (!msg) return null;
          return <MessageBubble key={msg.id} message={msg} />;
        })}

        {isStreaming && (
          <div className="flex flex-col gap-4">
            {streamingLogs.map((log) => {
              if (!log) return null;
              return <ThoughtBlock key={log.id} log={log} />;
            })}
            <div className="flex justify-start px-2">
              <div className="flex items-center gap-2 text-gray-400">
                <Loader2 size={14} className="animate-spin text-blue-500" />
                <span className="text-[13px] font-medium text-gray-500">Generating response...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <ChatInput onSend={handleSend} isStreaming={isStreaming} />
    </div>
  );
}
