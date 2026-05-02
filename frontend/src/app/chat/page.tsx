"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  ChatMessage,
  DocKey,
  UploadedDocs,
  getSlot,
} from "@/components/chat/types";
import { ChatMessageBubble, BotTypingIndicator } from "@/components/chat/ChatMessage";
import { ChatInput } from "@/components/chat/ChatInput";
import { ArrowDown } from "lucide-react";

// -- Bot helpers ----------------------------------------------------------

function makeBotMessage(text: string, extras?: Partial<ChatMessage>): ChatMessage {
  return { id: crypto.randomUUID(), role: "bot", text, ...extras };
}

function buildMissingDocsMessage(missing: string[]): ChatMessage {
  const labels = missing.map((k) => `- ${getSlot(k).label}`).join("\n");
  return makeBotMessage(
    `I still need the following document${missing.length > 1 ? "s" : ""} before I can create your case:\n\n${labels}\n\nAttach the missing file${missing.length > 1 ? "s" : ""}, then press Send again.`,
    { missingDocs: missing }
  );
}

function buildAckMessage(count: number): string {
  return count === 1
    ? `Got it - 1 document received`
    : `Received ${count} documents`;
}

const WELCOME_MESSAGE: ChatMessage = makeBotMessage(
  "Hello! I'm here to help you create a new insurance claim.\n\nAttach your documents, describe the incident, and press Send. I'll check what is missing after that."
);

// -- Welcome hero (shown in centered layout before first message) ----------

function WelcomeHero() {
  return (
    <div
      className="flex w-full flex-col items-center gap-2 text-center"
      style={{ maxWidth: "32rem" }}
    >
      <div className="h-32 w-32">
        <img src="/logo_black.svg" alt="SettleOps AI" className="h-full w-full object-contain dark:hidden" />
        <img src="/logo_white.svg" alt="SettleOps AI" className="h-full w-full object-contain hidden dark:block" />
      </div>
      <h1 className="text-3xl font-semibold text-neutral-text-primary">Start a new claim</h1>
      <p className="w-full text-balance text-base leading-6 text-neutral-text-secondary">
        Upload your documents and describe the incident.
      </p>
    </div>
  );
}

// -- Input footer (shared between both layouts) ---------------------------

function InputFooter({
  inputText,
  setInputText,
  staged,
  onRemoveStagedFile,
  onSend,
  onAttachClick,
  isDisabled,
  isSubmitting,
}: {
  inputText: string;
  setInputText: (v: string) => void;
  staged: Partial<Record<DocKey, File[]>>;
  onRemoveStagedFile: (key: DocKey, fileIndex: number) => void;
  onSend: () => void;
  onAttachClick: () => void;
  isDisabled: boolean;
  isSubmitting: boolean;
}) {
  return (
    <div className="w-full">
      <ChatInput
        value={inputText}
        onChange={setInputText}
        onSend={onSend}
        onAttachClick={onAttachClick}
        stagedDocs={staged}
        onRemoveStagedFile={onRemoveStagedFile}
        disabled={isDisabled}
        isSubmitting={isSubmitting}
      />
      <p className="mt-2 text-center text-xs text-neutral-text-tertiary">
        Press Enter to send · Shift+Enter for new line · Paperclip to attach documents
      </p>
    </div>
  );
}

// -- Main page ------------------------------------------------------------

export default function ChatPage() {
  const router = useRouter();

  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [docs, setDocs] = useState<UploadedDocs>({ files: [] });
  const [inputText, setInputText] = useState("");
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stagedDocs, setStagedDocs] = useState<Partial<Record<DocKey, File[]>>>({});
  const [showScrollButton, setShowScrollButton] = useState(false);

  const threadRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasUserMessages = messages.some((m) => m.role === "user");

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, isBotTyping]);

  const handleScroll = useCallback(() => {
    if (!threadRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = threadRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShowScrollButton(!isAtBottom);
  }, []);

  const scrollToBottom = () => {
    if (threadRef.current) {
      threadRef.current.scrollTo({
        top: threadRef.current.scrollHeight,
        behavior: "smooth"
      });
    }
  };

  const addBotReply = useCallback((msg: ChatMessage) => {
    setIsBotTyping(true);
    setTimeout(() => {
      setIsBotTyping(false);
      setMessages((prev) => [...prev, msg]);
    }, 600);
  }, []);

  function handleSelectedFiles(files: File[]) {
    if (files.length === 0) return;

    setStagedDocs((prev) => {
      const next: Partial<Record<DocKey, File[]>> = { ...prev };
      // All files are tagged as unknown for generic upload
      next.unknown = [...(next.unknown ?? []), ...files];
      return next;
    });
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function removeStagedFile(key: DocKey, fileIndex: number) {
    setStagedDocs((prev) => {
      const next = { ...prev };
      const files = next[key];
      if (!files) return next;

      const remaining = files.filter((_, index) => index !== fileIndex);
      if (remaining.length > 0) next[key] = remaining;
      else delete next[key];

      return next;
    });
  }

  async function handleSend() {
    const text = inputText.trim();
    const allStagedFiles = Object.values(stagedDocs).flat().filter(Boolean) as File[];

    if (!text && allStagedFiles.length === 0) return;

    const attachments = (Object.entries(stagedDocs) as [DocKey, File[]][])
      .filter(([, f]) => f && f.length > 0)
      .map(([key, files]) => ({ key, files }));

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: text || "Documents attached",
      attachments,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputText("");

    const newDocs = [...docs.files, ...allStagedFiles];
    setDocs({ files: newDocs });
    setStagedDocs({});

    // Dynamic Agentic Intake: Always attempt to create case if we have at least one doc
    if (newDocs.length > 0) {
      addBotReply(makeBotMessage(
        allStagedFiles.length > 0
          ? `${buildAckMessage(allStagedFiles.length)}\n\nInitiating agentic ingestion...`
          : "Analyzing your claim details..."
      ));

      setIsSubmitting(true);
      try {
        const result = await api.createCase(newDocs);
        setMessages((prev) => [...prev, makeBotMessage(`Case ${result.case_id} created! Redirecting to your workflow…`)]);
        setTimeout(() => router.push(`/workflow/${result.case_id}`), 1200);
      } catch (err: unknown) {
        setIsSubmitting(false);
        const message = err instanceof Error ? err.message : "Unknown error";
        addBotReply(makeBotMessage(`Sorry, I couldn't create the case: ${message}. Please try again.`));
      }
    } else {
      addBotReply(makeBotMessage("Please attach your documents so I can start the claim process."));
    }
  }

  const inputFooterProps = {
    inputText,
    setInputText,
    staged: stagedDocs,
    onRemoveStagedFile: removeStagedFile,
    onSend: handleSend,
    onAttachClick: openFilePicker,
    isDisabled: isSubmitting,
    isSubmitting,
  };

  return (
    <>
      {/* ── CENTERED LAYOUT (no messages yet) ── */}
      {!hasUserMessages && (
        <div className="grid h-full place-items-center bg-neutral-background px-4 py-8">
          <div
            className="flex w-full min-w-0 -translate-y-6 flex-col items-center gap-8"
            style={{ maxWidth: "42rem" }}
          >
            <WelcomeHero />
            <InputFooter {...inputFooterProps} />
          </div>
        </div>
      )}

      {/* ── CHAT LAYOUT (after first message) ── */}
      {hasUserMessages && (
        <div className="flex flex-col h-full bg-neutral-background">
          {/* Scrollable thread */}
          <div
            ref={threadRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto px-4 py-6 custom-scrollbar"
          >
            <div
              className="mx-auto flex w-full min-w-0 flex-col gap-4"
              style={{ maxWidth: "42rem" }}
            >
              {messages.map((msg) => (
                <ChatMessageBubble key={msg.id} message={msg} onUploadForDoc={() => openFilePicker()} />
              ))}
              {isBotTyping && <BotTypingIndicator />}
            </div>
          </div>

          {/* Sticky input bar at bottom */}
          <div className="bg-transparent px-4 py-4 relative">
            <div className="mx-auto w-full min-w-0" style={{ maxWidth: "42rem" }}>
              {/* Scroll to bottom button */}
              {showScrollButton && (
                <button
                  onClick={scrollToBottom}
                  className="absolute -top-10 left-1/2 -translate-x-1/2 p-2 rounded-full bg-neutral-surface/90 backdrop-blur-md shadow-lg border border-neutral-border text-neutral-text-secondary hover:text-brand-primary hover:bg-neutral-background hover:-translate-y-0.5 hover:shadow-xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 z-30"
                  aria-label="Scroll to bottom"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
              )}
              <InputFooter {...inputFooterProps} />
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        multiple
        className="hidden"
        onChange={(event) => {
          handleSelectedFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
    </>
  );
}
