"use client";

import { useEffect } from "react";
import { BookOpen, FileText, ImageIcon, Bot, X, ExternalLink } from "lucide-react";
import { Citation, DocumentInfo } from "@/lib/types";
import {
  formatNodeLabel,
  groupCitationsByNode,
  resolveDocUrl,
} from "@/lib/citation-utils";

interface CitationPanelProps {
  /** Display title — typically the BlackboardSection label. */
  title: string;
  citations: Citation[];
  documents: DocumentInfo[];
  isOpen: boolean;
  onClose: () => void;
  /** Called when a citation's "View Evidence" button is clicked. */
  onViewEvidence: (citation: Citation) => void;
}

/**
 * Slide-in panel that lists every citation backing a blackboard section,
 * grouped by the agent (``node_id``) that produced them. Image citations
 * surface a "View Evidence" button that opens ``CitationEvidenceModal``.
 */
export function CitationPanel({
  title,
  citations,
  documents,
  isOpen,
  onClose,
  onViewEvidence,
}: CitationPanelProps) {
  // Close on Escape for keyboard accessibility.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const grouped = groupCitationsByNode(citations);

  return (
    <>
      {/* Backdrop — click to close */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside
        role={isOpen ? "dialog" : undefined}
        aria-label={isOpen ? `${title} citations` : undefined}
        aria-modal={isOpen ? "true" : undefined}
        aria-hidden={!isOpen}
        className={`fixed inset-y-0 right-0 z-50 flex w-[22rem] max-w-[100vw] flex-col border-l border-neutral-border bg-neutral-background shadow-2xl transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-start justify-between border-b border-neutral-border px-4 py-3">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-brand-primary">
              <BookOpen className="h-3 w-3" />
              Citations
            </div>
            <h2 className="mt-1 text-sm font-semibold text-neutral-text-primary">
              {title}
            </h2>
            <p className="mt-0.5 text-[10px] text-neutral-text-tertiary">
              {citations.length} source{citations.length === 1 ? "" : "s"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-neutral-text-tertiary transition-colors hover:bg-neutral-surface hover:text-neutral-text-primary"
            aria-label="Close citations panel"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="custom-scrollbar flex-1 overflow-y-auto px-4 py-3">
          {grouped.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-xs text-neutral-text-tertiary">
              <BookOpen className="mb-2 h-8 w-8 opacity-30" />
              No citations recorded for this section.
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {grouped.map(({ nodeId, citations: group }) => (
                <section key={nodeId}>
                  <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-text-tertiary">
                    <Bot className="h-3 w-3" />
                    {formatNodeLabel(nodeId)}
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {group.map((c, idx) => (
                      <CitationCard
                        key={`${nodeId}-${idx}`}
                        citation={c}
                        documents={documents}
                        onViewEvidence={onViewEvidence}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function CitationCard({
  citation,
  documents,
  onViewEvidence,
}: {
  citation: Citation;
  documents: DocumentInfo[];
  onViewEvidence: (citation: Citation) => void;
}) {
  if (citation.source_type === "image") {
    return <ImageCitationCard citation={citation} documents={documents} onViewEvidence={onViewEvidence} />;
  }
  if (citation.source_type === "agent_output") {
    return <AgentOutputCitationCard citation={citation} />;
  }
  return <TextCitationCard citation={citation} documents={documents} onViewEvidence={onViewEvidence} />;
}

function CardShell({
  icon,
  filename,
  fieldPath,
  children,
}: {
  icon: React.ReactNode;
  filename: React.ReactNode;
  fieldPath: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-neutral-border bg-neutral-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-neutral-text-primary">
          <span className="text-neutral-text-tertiary">{icon}</span>
          <span className="truncate">{filename}</span>
        </div>
        <span className="shrink-0 rounded-sm border border-neutral-border bg-neutral-background px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-neutral-text-tertiary">
          {fieldPath}
        </span>
      </div>
      <div className="mt-2 space-y-2 text-[11px] leading-relaxed text-neutral-text-primary">
        {children}
      </div>
    </div>
  );
}

function TextCitationCard({
  citation,
  documents,
  onViewEvidence,
}: {
  citation: Citation;
  documents: DocumentInfo[];
  onViewEvidence: (citation: Citation) => void;
}) {
  const url = resolveDocUrl(citation.filename, documents);
  return (
    <CardShell
      icon={<FileText className="h-3 w-3" />}
      filename={
        url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-primary hover:underline"
          >
            {citation.filename}
          </a>
        ) : (
          citation.filename
        )
      }
      fieldPath={citation.field_path}
    >
      {citation.excerpt && (
        <blockquote className="border-l-2 border-brand-primary/50 bg-neutral-background/50 px-2 py-1 italic text-neutral-text-secondary">
          “{citation.excerpt}”
        </blockquote>
      )}
      <div>
        <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-text-tertiary">
          Why it matters
        </span>
        <p>{citation.comment}</p>
      </div>
      <div>
        <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-text-tertiary">
          Supports
        </span>
        <p>{citation.conclusion}</p>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => onViewEvidence(citation)}
          disabled={!url}
          className="inline-flex items-center gap-1.5 rounded-md border border-brand-primary/30 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-brand-primary transition-colors hover:bg-brand-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <FileText className="h-3 w-3" />
          View Evidence
        </button>
      </div>
    </CardShell>
  );
}

function ImageCitationCard({
  citation,
  documents,
  onViewEvidence,
}: {
  citation: Citation;
  documents: DocumentInfo[];
  onViewEvidence: (citation: Citation) => void;
}) {
  const url = resolveDocUrl(citation.filename, documents);
  return (
    <CardShell
      icon={<ImageIcon className="h-3 w-3" />}
      filename={citation.filename}
      fieldPath={citation.field_path}
    >
      <div>
        <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-text-tertiary">
          What is visible
        </span>
        <p>{citation.comment}</p>
      </div>
      <div>
        <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-text-tertiary">
          Supports
        </span>
        <p>{citation.conclusion}</p>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => onViewEvidence(citation)}
          disabled={!url}
          className="inline-flex items-center gap-1.5 rounded-md border border-brand-primary/30 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-brand-primary transition-colors hover:bg-brand-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ImageIcon className="h-3 w-3" />
          View Evidence
        </button>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] text-neutral-text-tertiary transition-colors hover:text-brand-primary"
          >
            <ExternalLink className="h-3 w-3" />
            Original
          </a>
        )}
      </div>
    </CardShell>
  );
}

function AgentOutputCitationCard({ citation }: { citation: Citation }) {
  return (
    <CardShell
      icon={<Bot className="h-3 w-3" />}
      filename={<span className="italic text-neutral-text-secondary">{citation.filename}</span>}
      fieldPath={citation.field_path}
    >
      {citation.excerpt && (
        <blockquote className="border-l-2 border-indigo-500/50 bg-neutral-background/50 px-2 py-1 italic text-neutral-text-secondary">
          {citation.excerpt}
        </blockquote>
      )}
      <div>
        <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-text-tertiary">
          Why it matters
        </span>
        <p>{citation.comment}</p>
      </div>
      <div>
        <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-text-tertiary">
          Supports
        </span>
        <p>{citation.conclusion}</p>
      </div>
    </CardShell>
  );
}
