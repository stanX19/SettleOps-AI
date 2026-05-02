"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  X,
  Loader2,
  FileText,
  ExternalLink,
  Download,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/primitives/Button";
import { getBackendUrl } from "@/lib/utils";

interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string | null;
  filename: string | null;
}

type FileKind = "pdf" | "image" | "json" | "text" | "unsupported";

function getExt(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() || "";
}

function getFileKind(filename: string): FileKind {
  const ext = getExt(filename);
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp"].includes(ext)) return "image";
  if (ext === "json") return "json";
  if (["txt", "log", "md", "csv"].includes(ext)) return "text";
  return "unsupported";
}

/**
 * Generic file viewer dialog. Renders PDFs in an iframe via Blob URL (avoids
 * CORS / X-Frame-Options issues), images natively, JSON pretty-printed, and
 * plain text in a monospace block. Falls back to a download CTA for anything
 * unsupported (e.g. archives, office docs).
 */
export function FilePreviewModal({ isOpen, onClose, url, filename }: FilePreviewModalProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kind: FileKind = filename ? getFileKind(filename) : "unsupported";
  const previewUrl = useMemo(() => (url ? getBackendUrl(url) : null), [url]);

  // Lock background scroll while open and listen for ESC.
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  // Fetch file content into a Blob URL (PDFs/images) or text string (JSON/text).
  useEffect(() => {
    if (!isOpen || !previewUrl || !filename) {
      return;
    }

    let cancelled = false;
    let createdUrl: string | null = null;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);

    const load = async () => {
      await Promise.resolve();
      if (cancelled) return;
      setIsLoading(true);
      setError(null);
      setBlobUrl(null);
      setTextContent(null);

      try {
        const res = await fetch(previewUrl, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Failed to load file (HTTP ${res.status})`);

        if (kind === "json" || kind === "text") {
          const text = await res.text();
          if (cancelled) return;
          if (kind === "json") {
            try {
              setTextContent(JSON.stringify(JSON.parse(text), null, 2));
            } catch {
              setTextContent(text);
            }
          } else {
            setTextContent(text);
          }
        } else {
          const blob = await res.blob();
          if (cancelled) return;
          // Force correct MIME for PDFs so iframe renders inline reliably.
          const finalBlob =
            kind === "pdf" && blob.type !== "application/pdf"
              ? new Blob([blob], { type: "application/pdf" })
              : blob;
          createdUrl = URL.createObjectURL(finalBlob);
          setBlobUrl(createdUrl);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("FilePreviewModal: failed to load file", err);
          setError(
            err instanceof DOMException && err.name === "AbortError"
              ? "Preview request timed out. The backend did not finish sending the file."
              : err instanceof Error
                ? err.message
                : "Failed to load file"
          );
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (!cancelled) setIsLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      controller.abort();
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [isOpen, previewUrl, filename, kind]);

  if (!isOpen || !previewUrl || !filename) return null;

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-neutral-surface border border-neutral-border rounded-lg shadow-2xl w-full max-w-5xl flex flex-col h-[90vh] max-h-[920px] overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-neutral-border flex items-center justify-between bg-neutral-background/30 shrink-0">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-8 h-8 shrink-0 rounded-md bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center">
              <FileText className="w-4 h-4 text-brand-primary" />
            </div>
            <div className="min-w-0 flex flex-col">
              <h2 className="text-sm font-semibold text-neutral-text-primary truncate" title={filename}>
                {filename}
              </h2>
              <p className="text-[10px] text-neutral-text-tertiary uppercase tracking-wider font-medium">
                {getExt(filename) || "file"} preview
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 ml-3">
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 hover:bg-neutral-border/40 rounded-md transition-colors text-neutral-text-tertiary hover:text-brand-primary"
              title="Open in new tab"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <a
              href={previewUrl}
              download={filename}
              className="p-2 hover:bg-neutral-border/40 rounded-md transition-colors text-neutral-text-tertiary hover:text-brand-primary"
              title="Download"
            >
              <Download className="w-4 h-4" />
            </a>
            <button
              onClick={onClose}
              className="p-2 hover:bg-neutral-border/40 rounded-md transition-colors text-neutral-text-tertiary"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden bg-neutral-background relative">
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3 pointer-events-none">
              <Loader2 className="w-7 h-7 text-brand-primary animate-spin" />
              <p className="text-xs text-neutral-text-tertiary animate-pulse font-medium">
                Loading preview…
              </p>
            </div>
          )}

          {error && !isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3 px-6 text-center">
              <div className="w-12 h-12 rounded-full bg-semantic-danger/10 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-semantic-danger" />
              </div>
              <p className="text-sm font-semibold text-neutral-text-primary">Could not load preview</p>
              <p className="text-xs text-neutral-text-tertiary max-w-sm">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(previewUrl, "_blank", "noopener,noreferrer")}
                className="mt-2"
              >
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Open in new tab
              </Button>
            </div>
          )}

          {!isLoading && !error && (
            <>
              {kind === "pdf" && blobUrl && (
                <iframe
                  src={blobUrl}
                  className="w-full h-full border-none"
                  title={filename}
                />
              )}

              {kind === "image" && blobUrl && (
                <div className="w-full h-full flex items-center justify-center overflow-auto p-4">
                  <img
                    src={blobUrl}
                    alt={filename}
                    className="max-w-full max-h-full object-contain rounded-md shadow-md"
                  />
                </div>
              )}

              {kind === "json" && textContent !== null && (
                <pre className="w-full h-full overflow-auto p-4 text-xs font-mono text-neutral-text-primary bg-neutral-surface whitespace-pre-wrap wrap-break-word">
                  {textContent}
                </pre>
              )}

              {kind === "text" && textContent !== null && (
                <pre className="w-full h-full overflow-auto p-4 text-xs font-mono text-neutral-text-primary bg-neutral-surface whitespace-pre-wrap wrap-break-word">
                  {textContent}
                </pre>
              )}

              {kind === "unsupported" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3 px-6 text-center">
                  <div className="w-14 h-14 rounded-full bg-neutral-border/30 flex items-center justify-center">
                    <FileText className="w-7 h-7 text-neutral-text-tertiary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-neutral-text-primary">
                      Preview not supported
                    </p>
                    <p className="text-xs text-neutral-text-tertiary mt-1">
                      This file type cannot be rendered inline. Download it to view locally.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(previewUrl, "_blank", "noopener,noreferrer")}
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" /> Download File
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
