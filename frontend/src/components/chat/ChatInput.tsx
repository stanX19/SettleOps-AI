"use client";

import { useRef, useEffect, KeyboardEvent } from "react";
import { Paperclip, ArrowUp, Loader2, FileText, Image as ImageIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DocKey, getSlot } from "./types";

interface ChatInputProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onAttachClick: () => void;
  stagedDocs?: Partial<Record<DocKey, File[]>>;
  onRemoveStagedFile?: (key: DocKey, fileIndex: number) => void;
  disabled?: boolean;
  isSubmitting?: boolean;
  placeholder?: string;
}

interface AttachmentPreview {
  key: DocKey;
  file: File;
  fileIndex: number;
}

function formatFileSize(size: number): string {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentPreviewCard({
  item,
  onRemove,
}: {
  item: AttachmentPreview;
  onRemove?: (key: DocKey, fileIndex: number) => void;
}) {
  const slot = getSlot(item.key);
  const isImage = item.file.type.startsWith("image/");

  return (
    <div className="group relative flex w-44 shrink-0 items-center gap-2 rounded-xl border border-neutral-border bg-neutral-surface p-1.5 pr-7 text-left shadow-sm">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-background">
        {isImage ? (
          <ImageIcon className="h-4 w-4 text-semantic-info" />
        ) : (
          <FileText className="h-4 w-4 text-semantic-danger" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-neutral-text-primary">
          {item.file.name}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-neutral-text-tertiary">
          {slot.label} · {formatFileSize(item.file.size)}
        </p>
      </div>

      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(item.key, item.fileIndex)}
          className="absolute right-1.5 top-1.5 rounded-full bg-neutral-surface p-1 text-neutral-text-secondary opacity-0 shadow-card transition-opacity hover:bg-neutral-border hover:text-neutral-text-primary focus:opacity-100 group-hover:opacity-100"
          aria-label={`Remove ${item.file.name}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onAttachClick,
  stagedDocs = {},
  onRemoveStagedFile,
  disabled = false,
  isSubmitting = false,
  placeholder = "Describe the incident or ask a question…",
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stagedFiles: AttachmentPreview[] = (Object.entries(stagedDocs) as [DocKey, File[]][])
    .flatMap(([key, files]) =>
      (files ?? []).map((file, fileIndex) => ({ key, file, fileIndex }))
    );

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const minHeight = 72;
    el.style.height = `${minHeight}px`;
    el.style.height = Math.min(Math.max(el.scrollHeight, minHeight), 192) + "px";
  }, [value]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && !isSubmitting && (value.trim() || stagedFiles.length > 0)) {
        onSend();
      }
    }
  }

  const canSend = !disabled && !isSubmitting && (value.trim().length > 0 || stagedFiles.length > 0);

  return (
    <div className="flex flex-col w-full gap-3">
      {stagedFiles.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-3 px-1 custom-scrollbar">
          {stagedFiles.map((item) => (
            <AttachmentPreviewCard
              key={`${item.key}-${item.file.name}-${item.fileIndex}`}
              item={item}
              onRemove={onRemoveStagedFile}
            />
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-neutral-border bg-neutral-surface/35 shadow-card transition-colors focus-within:border-brand-primary">

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled || isSubmitting}
        rows={3}
        className={cn(
          "min-h-[88px] w-full resize-none bg-transparent px-6 pt-6 pb-0 text-sm text-neutral-text-primary placeholder:text-neutral-text-tertiary",
          "focus:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-60",
          "max-h-48 overflow-y-auto"
        )}
      />
      <div className="flex items-center justify-between px-5 pb-5 pt-2">
        <button
          type="button"
          onClick={onAttachClick}
          disabled={disabled || isSubmitting}
          className="rounded-lg p-1.5 text-neutral-text-secondary hover:bg-neutral-background hover:text-neutral-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Attach documents"
        >
          <Paperclip className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          className={cn(
            "rounded-lg p-1.5 transition-colors",
            canSend
              ? "bg-brand-primary text-brand-on-primary hover:bg-brand-primary-hover"
              : "bg-neutral-border text-neutral-text-tertiary cursor-not-allowed"
          )}
          aria-label="Send message"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUp className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
    </div>
  );
}
