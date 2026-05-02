"use client";

import { useEffect, useState } from "react";
import { BookOpen, FileText, ImageIcon, Bot, X, ChevronDown } from "lucide-react";
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
 * grouped by the agent (``node_id``) that produced them. Each citation is
 * a compact collapsible row — click to expand evidence details.
 */
export function CitationPanel({
  title,
  citations,
  documents,
  isOpen,
  onClose,
  onViewEvidence,
}: CitationPanelProps) {
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
      {/* Backdrop */}
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
            <div className="flex flex-col gap-4">
              {grouped.map(({ nodeId, citations: group }) => (
                <NodeGroup
                  key={nodeId}
                  nodeId={nodeId}
                  citations={group}
                  documents={documents}
                  onViewEvidence={onViewEvidence}
                />
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function NodeGroup({
  nodeId,
  citations,
  documents,
  onViewEvidence,
}: {
  nodeId: string;
  citations: Citation[];
  documents: DocumentInfo[];
  onViewEvidence: (c: Citation) => void;
}) {
  return (
    <section>
      {/* Group header */}
      <div className="mb-1.5 flex items-center justify-between px-0.5">
        <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-neutral-text-tertiary">
          <Bot className="h-3 w-3" />
          {formatNodeLabel(nodeId)}
        </div>
        <span className="text-[9px] text-neutral-text-tertiary tabular-nums">
          {citations.length} citation{citations.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Compact citation list */}
      <ul className="rounded-md border border-neutral-border bg-neutral-surface overflow-hidden">
        {citations.map((c, idx) => (
          <CitationRow
            key={`${nodeId}-${idx}`}
            citation={c}
            documents={documents}
            onViewEvidence={onViewEvidence}
            isLast={idx === citations.length - 1}
          />
        ))}
      </ul>
    </section>
  );
}

function CitationRow({
  citation,
  documents,
  onViewEvidence,
  isLast,
}: {
  citation: Citation;
  documents: DocumentInfo[];
  onViewEvidence: (c: Citation) => void;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const url = resolveDocUrl(citation.filename, documents);

  const Icon =
    citation.source_type === "image"
      ? ImageIcon
      : citation.source_type === "agent_output"
      ? Bot
      : FileText;

  // Strip the uploaded_N_ prefix for a cleaner display name in the expanded detail
  const shortName = citation.filename.replace(/^uploaded_\d+_/, "");

  return (
    <li className={!isLast ? "border-b border-neutral-border/50" : undefined}>
      {/* Collapsed row — shows what the citation is about, not the filename */}
      <button
        className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-neutral-background/60 transition-colors"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <Icon className="h-3 w-3 shrink-0 text-neutral-text-tertiary mt-0.5" />

        <div className="min-w-0 flex-1">
          {/* Primary: what this citation is about */}
          <p className="text-[10px] text-neutral-text-primary leading-snug line-clamp-2">
            {citation.comment}
          </p>
          {/* Secondary: which output field it backs */}
          <span className="mt-0.5 inline-block rounded border border-neutral-border/70 bg-neutral-background px-1 font-mono text-[8px] uppercase tracking-wider text-neutral-text-tertiary">
            {citation.field_path}
          </span>
        </div>

        <ChevronDown
          className={`h-3 w-3 shrink-0 text-neutral-text-tertiary transition-transform duration-150 ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Expanded detail — source + verbatim quote + conclusion */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-neutral-border/30 bg-neutral-background/40">
          {/* Source file */}
          <div className="pt-2 flex items-center gap-1.5 text-[9px] text-neutral-text-tertiary">
            <Icon className="h-2.5 w-2.5 shrink-0" />
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate hover:text-brand-primary transition-colors"
              >
                {shortName}
              </a>
            ) : (
              <span className="truncate">{shortName}</span>
            )}
          </div>

          {/* Verbatim excerpt */}
          {citation.excerpt && (
            <blockquote className="border-l-2 border-brand-primary/40 bg-neutral-surface/60 px-2 py-1 italic text-[10px] text-neutral-text-secondary">
              "{citation.excerpt}"
            </blockquote>
          )}

          {/* Conclusion */}
          <p className="text-[10px] leading-relaxed text-neutral-text-secondary">
            <span className="font-bold uppercase tracking-wider text-[8px] text-neutral-text-tertiary mr-1">
              Supports:
            </span>
            {citation.conclusion}
          </p>

          {/* View Evidence */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewEvidence(citation);
            }}
            disabled={!url && citation.source_type !== "image"}
            className="inline-flex items-center gap-1 rounded border border-brand-primary/30 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-brand-primary transition-colors hover:bg-brand-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon className="h-2.5 w-2.5" />
            View Evidence
          </button>
        </div>
      )}
    </li>
  );
}
