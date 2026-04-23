"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  ChatMessage,
  DocKey,
  UploadedDocs,
  getMissingRequired,
  getSlot,
} from "@/components/chat/types";
import { ChatMessageBubble, BotTypingIndicator } from "@/components/chat/ChatMessage";
import { ChatInput } from "@/components/chat/ChatInput";

type SingleFileDocKey = Exclude<DocKey, "photos">;
const PDF_DOC_ORDER: SingleFileDocKey[] = ["police_report", "policy_pdf", "repair_quotation", "adjuster_report"];
const LOGO_SRC = "/logo.png";

// -- Bot helpers ----------------------------------------------------------

function makeBotMessage(text: string, extras?: Partial<ChatMessage>): ChatMessage {
  return { id: crypto.randomUUID(), role: "bot", text, ...extras };
}

function buildMissingDocsMessage(missing: DocKey[]): ChatMessage {
  const labels = missing.map((k) => `- ${getSlot(k).label}`).join("\n");
  return makeBotMessage(
    `I still need the following document${missing.length > 1 ? "s" : ""} before I can create your case:\n\n${labels}\n\nUse the paperclip to attach the missing file${missing.length > 1 ? "s" : ""}, then press Send again.`,
    { missingDocs: missing }
  );
}

function buildAckMessage(uploaded: DocKey[]): string {
  return uploaded.length === 1
    ? `Got it - ${getSlot(uploaded[0]).label} received`
    : `Received ${uploaded.length} documents`;
}

const WELCOME_MESSAGE: ChatMessage = makeBotMessage(
  "Hello! I'm here to help you create a new insurance claim.\n\nAttach your documents with the paperclip, describe the incident, and press Send. I'll check what is missing after that."
);

// -- Welcome hero (shown in centered layout before first message) ----------

function WelcomeHero() {
  return (
    <div
      className="flex w-full flex-col items-center gap-2 text-center"
      style={{ maxWidth: "32rem" }}
    >
      <div className="h-32 w-32">
        <img src={LOGO_SRC} alt="SettleOps AI" className="h-full w-full object-contain" />
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
  const [docs, setDocs] = useState<UploadedDocs>({ photos: [] });
  const [inputText, setInputText] = useState("");
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stagedDocs, setStagedDocs] = useState<Partial<Record<DocKey, File[]>>>({});

  const threadRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasUserMessages = messages.some((m) => m.role === "user");

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages, isBotTyping]);

  const addBotReply = useCallback((msg: ChatMessage) => {
    setIsBotTyping(true);
    setTimeout(() => {
      setIsBotTyping(false);
      setMessages((prev) => [...prev, msg]);
    }, 600);
  }, []);

  function hasUploadedDoc(key: SingleFileDocKey, staged: Partial<Record<DocKey, File[]>>) {
    return Boolean(staged[key]?.length || docs[key]);
  }

  function guessPdfDocKey(file: File, staged: Partial<Record<DocKey, File[]>>): SingleFileDocKey {
    const name = file.name.toLowerCase();
    if (name.includes("police")) return "police_report";
    if (name.includes("policy") || name.includes("insurance")) return "policy_pdf";
    if (
      name.includes("repair") ||
      name.includes("quotation") ||
      name.includes("quote") ||
      name.includes("workshop") ||
      name.includes("estimate")
    ) return "repair_quotation";
    if (name.includes("adjuster") || name.includes("adjustor") || name.includes("loss")) return "adjuster_report";

    return PDF_DOC_ORDER.find((key) => !hasUploadedDoc(key, staged)) ?? "adjuster_report";
  }

  function handleSelectedFiles(files: File[]) {
    if (files.length === 0) return;

    setStagedDocs((prev) => {
      const next: Partial<Record<DocKey, File[]>> = { ...prev };

      for (const file of files) {
        if (file.type.startsWith("image/")) {
          next.photos = [...(next.photos ?? []), file];
          continue;
        }

        const key = guessPdfDocKey(file, next);
        next[key] = [file];
      }

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

      if (key === "photos") {
        const remaining = files.filter((_, index) => index !== fileIndex);
        if (remaining.length > 0) next.photos = remaining;
        else delete next.photos;
      } else {
        delete next[key];
      }

      return next;
    });
  }

  function commitStagedDocs(staged: Partial<Record<DocKey, File[]>>): DocKey[] {
    const uploaded: DocKey[] = [];
    setDocs((prev) => {
      const next = { ...prev };
      for (const [k, files] of Object.entries(staged) as [DocKey, File[]][]) {
        if (!files?.length) continue;
        if (k === "photos") next.photos = [...prev.photos, ...files];
        else next[k as SingleFileDocKey] = files[0];
        uploaded.push(k);
      }
      return next;
    });
    return uploaded;
  }

  async function handleSend() {
    const text = inputText.trim();
    const hasStagedFiles = Object.values(stagedDocs).some((f) => f && f.length > 0);
    if (!text && !hasStagedFiles) return;

    const attachments = (Object.entries(stagedDocs) as [DocKey, File[]][])
      .filter(([, f]) => f && f.length > 0)
      .map(([key, files]) => ({ key, files }));

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: text || "📎 Documents attached",
      attachments,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputText("");

    const uploadedKeys = commitStagedDocs(stagedDocs);
    const snapshot = { ...docs };
    for (const [k, files] of Object.entries(stagedDocs) as [DocKey, File[]][]) {
      if (!files?.length) continue;
      if (k === "photos") snapshot.photos = [...docs.photos, ...files];
      else snapshot[k as SingleFileDocKey] = files[0];
    }
    setStagedDocs({});

    const missing = getMissingRequired(snapshot);

    if (missing.length === 0) {
      addBotReply(makeBotMessage(
        uploadedKeys.length > 0
          ? `${buildAckMessage(uploadedKeys)}\n\nAll required documents are here. Creating your case now…`
          : "All required documents are present. Creating your case now…"
      ));
      setIsSubmitting(true);
      try {
        const result = await api.createCase({
          police_report: snapshot.police_report!,
          policy_pdf: snapshot.policy_pdf!,
          repair_quotation: snapshot.repair_quotation!,
          photos: snapshot.photos,
          adjuster_report: snapshot.adjuster_report,
        });
        setMessages((prev) => [...prev, makeBotMessage(`Case ${result.case_id} created! Redirecting to your workflow…`)]);
        setTimeout(() => router.push(`/workflow/${result.case_id}`), 1200);
      } catch (err: unknown) {
        setIsSubmitting(false);
        const message = err instanceof Error ? err.message : "Unknown error";
        addBotReply(makeBotMessage(`Sorry, I couldn't create the case: ${message}. Please try again.`));
      }
    } else {
      if (uploadedKeys.length > 0) {
        addBotReply(makeBotMessage(`${buildAckMessage(uploadedKeys)}\n\nStill need a few more documents:`, { missingDocs: missing }));
      } else if (text) {
        addBotReply(buildMissingDocsMessage(missing));
      }
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
          <div ref={threadRef} className="flex-1 overflow-y-auto px-4 py-6 custom-scrollbar">
            <div
              className="mx-auto flex w-full min-w-0 flex-col gap-6"
              style={{ maxWidth: "42rem" }}
            >
              {messages.map((msg) => (
                <ChatMessageBubble key={msg.id} message={msg} onUploadForDoc={() => openFilePicker()} />
              ))}
              {isBotTyping && <BotTypingIndicator />}
            </div>
          </div>

          {/* Sticky input bar at bottom */}
          <div className="bg-transparent px-4 py-4">
            <div className="mx-auto w-full min-w-0" style={{ maxWidth: "42rem" }}>
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
