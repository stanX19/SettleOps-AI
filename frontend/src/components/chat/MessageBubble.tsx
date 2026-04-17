import type { ChatMessage } from "../../hooks/useChat.ts";
import { MarkdownRenderer } from "./MarkdownRenderer.tsx";
import { TtsPlayer } from "./TtsPlayer.tsx";

interface Props {
  message: ChatMessage;
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  return (
    <div className={`flex flex-col gap-2 ${isUser ? "items-end" : "items-start"}`}>
      {message.content && (
        <div
          className={`text-[15px] leading-relaxed shadow-sm ${
            isUser
            ? "max-w-[85%] bg-blue-600 text-white rounded-2xl rounded-tr-sm px-5 py-2.5 whitespace-pre-wrap"
            : isSystem
              ? "max-w-[90%] border border-amber-300 bg-amber-50 text-amber-800 px-4 py-2.5 rounded-2xl whitespace-pre-wrap"
              : "w-full max-w-[95%] bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-800 dark:text-gray-200 rounded-2xl rounded-tl-sm px-5 py-3 whitespace-pre-wrap"
            }`}
        >
          {isUser ? message.content : <MarkdownRenderer content={message.content} />}
        </div>
      )}
      
      {message.audioUrl && (
         <div className="max-w-[85%] mt-1">
            <TtsPlayer audioUrl={message.audioUrl} />
         </div>
      )}
    </div>
  );
}
