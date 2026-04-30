"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Bot, ExternalLink, FileText, ImageIcon, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Citation, DocumentInfo } from "@/lib/types";
import { resolveDocUrl } from "@/lib/citation-utils";

interface CitationEvidenceModalProps {
  citation: Citation | null;
  documents: DocumentInfo[];
  onClose: () => void;
}

export function CitationEvidenceModal({
  citation,
  documents,
  onClose,
}: CitationEvidenceModalProps) {
  const open = citation !== null;
  const url = citation ? resolveDocUrl(citation.filename, documents) : null;
  const isImage = citation?.source_type === "image";
  const isPdf = citation?.filename.toLowerCase().endsWith(".pdf");
  const evidenceUrl =
    url && isPdf
      ? `${url}/evidence${citation?.excerpt ? `?excerpt=${encodeURIComponent(citation.excerpt)}` : ""}`
      : null;
  const evidenceMetaUrl =
    url && isPdf
      ? `${url}/evidence/meta${citation?.excerpt ? `?excerpt=${encodeURIComponent(citation.excerpt)}` : ""}`
      : null;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm animate-in fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 h-[88vh] w-[94vw] max-w-6xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg border border-neutral-border bg-neutral-background shadow-2xl animate-in fade-in zoom-in-95 focus:outline-none">
          {citation && (
            <>
              <div className="flex items-start justify-between gap-3 border-b border-neutral-border px-5 py-3">
                <div className="min-w-0">
                  <Dialog.Title className="truncate text-sm font-semibold text-neutral-text-primary">
                    {citation.filename}
                  </Dialog.Title>
                  <Dialog.Description className="mt-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-neutral-text-tertiary">
                    <Bot className="h-3 w-3" />
                    cited by {citation.node_id} - {citation.field_path}
                  </Dialog.Description>
                </div>
                <Dialog.Close
                  className="rounded-md p-1 text-neutral-text-tertiary transition-colors hover:bg-neutral-surface hover:text-neutral-text-primary"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </Dialog.Close>
              </div>

              <div className="grid h-[calc(88vh-57px)] gap-4 p-5 md:grid-cols-[minmax(0,1fr)_20rem]">
                <div className="min-h-0 overflow-hidden rounded-md border border-neutral-border bg-neutral-surface">
                  {!url ? (
                    <div className="flex h-full items-center justify-center px-6 py-12 text-center text-xs text-neutral-text-tertiary">
                      Source file not found in current documents.
                    </div>
                  ) : isImage ? (
                    <div className="flex h-full min-h-[22rem] items-center justify-center bg-neutral-background p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={citation.filename}
                        className="block max-h-full max-w-full object-contain"
                      />
                    </div>
                  ) : isPdf && evidenceUrl ? (
                    <PdfEvidenceImage
                      key={evidenceUrl}
                      src={evidenceUrl}
                      metaUrl={evidenceMetaUrl}
                      alt={`Highlighted evidence from ${citation.filename}`}
                    />
                  ) : (
                    <iframe
                      src={url}
                      title={citation.filename}
                      className="h-full w-full bg-white"
                    />
                  )}
                </div>

                <div className="flex min-h-0 flex-col gap-3 overflow-y-auto text-xs leading-relaxed text-neutral-text-primary">
                  <section className="rounded-md border border-neutral-border bg-neutral-surface p-3">
                    <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-text-tertiary">
                      {isImage ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                      Evidence Type
                    </div>
                    <p className="font-medium text-neutral-text-primary">
                      {isImage ? "Image citation" : isPdf ? "Full PDF citation" : "Document citation"}
                    </p>
                  </section>

                  {citation.excerpt && (
                    <section className="rounded-md border border-brand-primary/30 bg-brand-primary/10 p-3">
                      <h3 className="mb-1 text-[10px] font-bold uppercase tracking-widest text-brand-primary">
                        Cited excerpt
                      </h3>
                      <mark className="bg-brand-primary/25 px-1 text-neutral-text-primary">
                        {citation.excerpt}
                      </mark>
                    </section>
                  )}

                  <section>
                    <h3 className="mb-1 text-[10px] font-bold uppercase tracking-widest text-neutral-text-tertiary">
                      {isImage ? "What is visible" : "What this source says"}
                    </h3>
                    <p>{citation.comment}</p>
                  </section>
                  <section>
                    <h3 className="mb-1 text-[10px] font-bold uppercase tracking-widest text-neutral-text-tertiary">
                      Supports conclusion
                    </h3>
                    <p>{citation.conclusion}</p>
                  </section>
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-auto inline-flex items-center gap-1.5 self-start rounded-md border border-brand-primary/30 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-brand-primary transition-colors hover:bg-brand-primary/10"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open original
                    </a>
                  )}
                </div>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface PdfEvidenceMeta {
  page_height: number;
  target: { y0: number; y1: number } | null;
}

function PdfEvidenceImage({
  src,
  metaUrl,
  alt,
}: {
  src: string;
  metaUrl: string | null;
  alt: string;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [meta, setMeta] = useState<PdfEvidenceMeta | null>(null);
  const [isImageLoaded, setIsImageLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadMeta() {
      if (!metaUrl) return;
      try {
        const response = await fetch(metaUrl);
        if (!response.ok) return;
        const data = (await response.json()) as PdfEvidenceMeta;
        if (!cancelled) setMeta(data);
      } catch {
        // Preview still works without auto-scroll metadata.
      }
    }

    loadMeta();
    return () => {
      cancelled = true;
    };
  }, [metaUrl, src]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const img = imgRef.current;
    if (!scroller || !img || !isImageLoaded || !meta?.target || !meta.page_height) {
      return;
    }

    const targetCenter = (meta.target.y0 + meta.target.y1) / 2;
    const renderedY = (targetCenter / meta.page_height) * img.clientHeight;
    scroller.scrollTop = Math.max(0, renderedY - scroller.clientHeight / 2);
  }, [isImageLoaded, meta]);

  return (
    <div
      ref={scrollerRef}
      className="custom-scrollbar flex h-full items-start justify-center overflow-auto bg-neutral-950 p-4"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={src}
        ref={imgRef}
        src={src}
        alt={alt}
        onLoad={() => setIsImageLoaded(true)}
        className="w-full max-w-[920px] rounded-sm bg-white shadow-lg"
      />
    </div>
  );
}
