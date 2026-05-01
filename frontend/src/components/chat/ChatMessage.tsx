"use client";

import { FileText, Image as ImageIcon, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatMessage as ChatMessageType, DocKey, getSlot } from "./types";
import { MarkdownRenderer } from "./MarkdownRenderer";



interface ChatMessageProps {
  message: ChatMessageType;
  onUploadForDoc?: (key: DocKey) => void;
}

export function ChatMessageBubble({ message, onUploadForDoc }: ChatMessageProps) {
  const isBot = message.role === "bot";

  return (
    <div className={cn("flex gap-3", isBot ? "justify-start" : "justify-end")}>
      {/* Bot avatar */}
      {isBot && (
        <div className="shrink-0 mt-1 h-8 w-8">
          <img src="/logo_black.svg" alt="SettleOps AI" className="h-full w-full object-contain dark:hidden" />
          <img src="/logo_white.svg" alt="SettleOps AI" className="h-full w-full object-contain hidden dark:block" />
        </div>
      )}

      <div className={cn("flex flex-col gap-2 max-w-[72%]", isBot ? "items-start" : "items-end")}>
        {/* User attachments sit above the sent text, matching ChatGPT-style file prompts. */}
        {!isBot && message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2">
            {message.attachments.flatMap((att) =>
              att.files.map((file, index) => {
                const slot = getSlot(att.key);
                const isImage = file.type.startsWith("image/");
                return (
                  <div
                    key={`${att.key}-${file.name}-${index}`}
                    className="flex w-44 items-center gap-2 rounded-xl border border-neutral-border bg-neutral-surface px-2 py-1.5 text-left shadow-sm"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-background">
                      {isImage ? (
                        <ImageIcon className="h-4 w-4 text-semantic-info" />
                      ) : (
                        <FileText className="h-4 w-4 text-semantic-danger" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-neutral-text-primary">
                        {file.name}
                      </p>
                      <p className="truncate text-[11px] text-neutral-text-tertiary">
                        {slot.label}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Bubble */}
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2 text-sm leading-snug",
            isBot
              ? "bg-neutral-surface border border-neutral-border text-neutral-text-primary rounded-tl-sm"
              : "bg-brand-primary text-brand-on-primary rounded-tr-sm"
          )}
        >
          <MarkdownRenderer
            content={message.text}
            className={cn(isBot ? "text-neutral-text-primary" : "text-brand-on-primary prose-strong:text-brand-on-primary prose-p:text-brand-on-primary")}
          />
        </div>

        {/* Bot inline upload prompts for missing docs */}
        {isBot && message.missingDocs && message.missingDocs.length > 0 && onUploadForDoc && (
          <div className="flex flex-wrap gap-2 mt-1">
            {message.missingDocs.map((key) => {
              const slot = getSlot(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onUploadForDoc(key as DocKey)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-brand-primary-light bg-brand-primary-light px-3 py-1.5 text-xs font-medium text-neutral-text-primary hover:bg-brand-primary/20 transition-colors"
                >
                  <Paperclip className="h-3 w-3" />
                  <span>Upload {slot.label}</span>
                  {!slot.required && (
                    <span className="text-neutral-text-tertiary">(optional)</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function BotTypingIndicator() {
  return (
    <div className="flex gap-3 justify-start">
      <div className="shrink-0 mt-1 h-8 w-8">
        <img src="/logo_black.svg" alt="SettleOps AI" className="h-full w-full object-contain dark:hidden" />
        <img src="/logo_white.svg" alt="SettleOps AI" className="h-full w-full object-contain hidden dark:block" />
      </div>
      <div className="flex gap-1 items-center h-8 mt-1 px-2">
        <span className="h-1.5 w-1.5 rounded-full bg-neutral-text-tertiary animate-bounce [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-neutral-text-tertiary animate-bounce [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-neutral-text-tertiary animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  );
}
