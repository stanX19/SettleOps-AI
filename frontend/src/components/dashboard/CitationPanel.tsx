"use client";

import { useEffect, useState } from "react";
import { BookOpen, FileText, ImageIcon, Bot, X, ChevronDown, KeyRound, ShieldCheck } from "lucide-react";
import { Citation, CitationSummary, DocumentInfo } from "@/lib/types";
import { isCitationSummary, getSupportingCount, resolveDocUrl } from "@/lib/citation-utils";

interface CitationPanelProps {
  title: string;
  summary: CitationSummary | null | undefined;
  documents: DocumentInfo[];
  isOpen: boolean;
  onClose: () => void;
  onViewEvidence: (citation: Citation) => void;
}

export function CitationPanel({
  title,
  summary,
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

  // Gracefully handle missing or legacy data
  const safeSummary: CitationSummary = isCitationSummary(summary)
    ? summary
    : { key_evidence: [], supporting_groups: [], audit_cross_check: [], hidden_duplicates_count: 0 };

  const keyCount = safeSummary.key_evidence.length;
  const supportingCount = getSupportingCount(safeSummary);
  const auditCount = safeSummary.audit_cross_check.length;
  const totalVisible = keyCount + supportingCount + auditCount;

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        role={isOpen ? "dialog" : undefined}
        aria-label={isOpen ? `${title} citations` : undefined}
        aria-modal={isOpen ? "true" : undefined}
        aria-hidden={!isOpen}
        className={`fixed inset-y-0 right-0 z-50 flex w-[22rem] max-w-[100vw] flex-col border-l border-neutral-border bg-neutral-background shadow-2xl transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <header className="flex items-start justify-between border-b border-neutral-border px-4 py-3">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-brand-primary">
              <BookOpen className="h-3 w-3" />
              Citations
            </div>
            <h2 className="mt-1 text-sm font-semibold text-neutral-text-primary">{title}</h2>
            <p className="mt-0.5 text-[10px] text-neutral-text-tertiary">
              {keyCount > 0 && <span className="text-brand-primary font-semibold">{keyCount} key</span>}
              {keyCount > 0 && supportingCount > 0 && <span className="mx-1 opacity-40">·</span>}
              {supportingCount > 0 && <span>{supportingCount} supporting</span>}
              {auditCount > 0 && (
                <span className="ml-1 opacity-60">· {auditCount} audit</span>
              )}
              {totalVisible === 0 && "No citations"}
              {safeSummary.hidden_duplicates_count > 0 && (
                <span className="ml-1 opacity-40">
                  ({safeSummary.hidden_duplicates_count} duplicate{safeSummary.hidden_duplicates_count !== 1 ? "s" : ""} collapsed)
                </span>
              )}
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
          {totalVisible === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-xs text-neutral-text-tertiary">
              <BookOpen className="mb-2 h-8 w-8 opacity-30" />
              No citations recorded for this section.
            </div>
          ) : (
            <div className="flex flex-col gap-4">

              {/* Tier 1: Key Evidence — always fully visible */}
              {safeSummary.key_evidence.length > 0 && (
                <KeyEvidenceGroup
                  citations={safeSummary.key_evidence}
                  documents={documents}
                  onViewEvidence={onViewEvidence}
                />
              )}

              {/* Tier 2: Supporting Evidence — collapsed by default */}
              {safeSummary.supporting_groups.map(({ topic, citations }) =>
                citations.length > 0 ? (
                  <CollapsibleCitationGroup
                    key={topic}
                    title={topic}
                    citations={citations}
                    documents={documents}
                    onViewEvidence={onViewEvidence}
                    defaultOpen={false}
                  />
                ) : null
              )}

              {/* Tier 3: Audit Cross-check — collapsed, low visual weight */}
              {safeSummary.audit_cross_check.length > 0 && (
                <CollapsibleCitationGroup
                  title="Audit Cross-check"
                  citations={safeSummary.audit_cross_check}
                  documents={documents}
                  onViewEvidence={onViewEvidence}
                  defaultOpen={false}
                  dimmed
                  icon={<ShieldCheck className="h-3 w-3" />}
                />
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

// -- Key Evidence group: always open, prominent left border -------------------

function KeyEvidenceGroup({
  citations,
  documents,
  onViewEvidence,
}: {
  citations: Citation[];
  documents: DocumentInfo[];
  onViewEvidence: (c: Citation) => void;
}) {
  return (
    <section>
      <div className="mb-1.5 flex items-center gap-1.5 px-0.5 text-[9px] font-bold uppercase tracking-widest text-brand-primary">
        <KeyRound className="h-3 w-3" />
        Key Evidence
      </div>
      <ul className="rounded-md border border-brand-primary/30 bg-neutral-surface overflow-hidden">
        {citations.map((c, idx) => (
          <CitationRow
            key={`key-${idx}`}
            citation={c}
            documents={documents}
            onViewEvidence={onViewEvidence}
            isLast={idx === citations.length - 1}
            showFieldPath
          />
        ))}
      </ul>
    </section>
  );
}

// -- Collapsible group for supporting + audit tiers ---------------------------

function CollapsibleCitationGroup({
  title,
  citations,
  documents,
  onViewEvidence,
  defaultOpen,
  dimmed = false,
  icon,
}: {
  title: string;
  citations: Citation[];
  documents: DocumentInfo[];
  onViewEvidence: (c: Citation) => void;
  defaultOpen: boolean;
  dimmed?: boolean;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [showAll, setShowAll] = useState(false);
  const PAGE = 3;
  const visible = showAll ? citations : citations.slice(0, PAGE);
  const hidden = citations.length - visible.length;

  return (
    <section>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between px-0.5 mb-1.5 text-left ${
          dimmed ? "opacity-60 hover:opacity-100" : ""
        } transition-opacity`}
      >
        <div className={`flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest ${dimmed ? "text-neutral-text-tertiary" : "text-neutral-text-secondary"}`}>
          {icon ?? <Bot className="h-3 w-3" />}
          {title}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-neutral-text-tertiary tabular-nums">
            {citations.length}
          </span>
          <ChevronDown
            className={`h-3 w-3 text-neutral-text-tertiary transition-transform duration-150 ${
              open ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {open && (
        <ul className="rounded-md border border-neutral-border bg-neutral-surface overflow-hidden">
          {visible.map((c, idx) => (
            <CitationRow
              key={`${title}-${idx}`}
              citation={c}
              documents={documents}
              onViewEvidence={onViewEvidence}
              isLast={idx === visible.length - 1 && hidden === 0}
            />
          ))}
          {hidden > 0 && (
            <li>
              <button
                onClick={() => setShowAll(true)}
                className="w-full px-2.5 py-2 text-left text-[9px] font-bold uppercase tracking-widest text-brand-primary hover:bg-neutral-background/60 transition-colors"
              >
                Show {hidden} more
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

// -- Individual citation row --------------------------------------------------

export function CitationRow({
  citation,
  documents,
  onViewEvidence,
  isLast,
  showFieldPath = false,
  compact = false,
}: {
  citation: Citation;
  documents: DocumentInfo[];
  onViewEvidence: (c: Citation) => void;
  isLast: boolean;
  showFieldPath?: boolean;
  /** Compact mode: hides the heavier View Evidence button for use in tight spaces. */
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const url = resolveDocUrl(citation.filename, documents);

  const Icon =
    citation.source_type === "image"
      ? ImageIcon
      : citation.source_type === "agent_output"
      ? Bot
      : FileText;

  const shortName = citation.filename.replace(/^uploaded_\d+_/, "");

  return (
    <li className={!isLast ? "border-b border-neutral-border/50" : undefined}>
      {/* Collapsed row */}
      <button
        className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-neutral-background/60 transition-colors"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <Icon className="h-3 w-3 shrink-0 text-neutral-text-tertiary mt-0.5" />
        <div className="min-w-0 flex-1">
          {/* Conclusion is more useful at a glance than raw comment */}
          <p className="text-[10px] text-neutral-text-primary leading-snug line-clamp-2">
            {citation.conclusion}
          </p>
          {showFieldPath && (
            <span className="mt-0.5 inline-block rounded border border-neutral-border/70 bg-neutral-background px-1 font-mono text-[8px] uppercase tracking-wider text-neutral-text-tertiary">
              {citation.field_path}
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-3 w-3 shrink-0 text-neutral-text-tertiary transition-transform duration-150 ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-neutral-border/30 bg-neutral-background/40">
          {/* Source + field_path badge (detail only) */}
          <div className="pt-2 flex items-center justify-between gap-1.5 text-[9px] text-neutral-text-tertiary">
            <div className="flex items-center gap-1.5 min-w-0">
              <Icon className="h-2.5 w-2.5 shrink-0" />
              {url ? (
                <a href={url} target="_blank" rel="noopener noreferrer" className="truncate hover:text-brand-primary transition-colors">
                  {shortName}
                </a>
              ) : (
                <span className="truncate">{shortName}</span>
              )}
            </div>
            <span className="shrink-0 rounded border border-neutral-border/70 bg-neutral-background px-1 font-mono text-[8px] uppercase tracking-wider">
              {citation.field_path}
            </span>
          </div>

          {/* Verbatim excerpt — hidden in compact mode */}
          {citation.excerpt && (
            <blockquote className="border-l-2 border-brand-primary/40 bg-neutral-surface/60 px-2 py-1 italic text-[10px] text-neutral-text-secondary">
              "{citation.excerpt}"
            </blockquote>
          )}

          {/* What this evidence shows */}
          <p className="text-[10px] leading-relaxed text-neutral-text-secondary">
            <span className="font-bold uppercase tracking-wider text-[8px] text-neutral-text-tertiary mr-1">Evidence:</span>
            {citation.comment}
          </p>

          {/* View Evidence button — hidden in compact mode */}
          {!compact && (
            <button
              onClick={(e) => { e.stopPropagation(); onViewEvidence(citation); }}
              disabled={!url && citation.source_type !== "image"}
              className="inline-flex items-center gap-1 rounded border border-brand-primary/30 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-brand-primary transition-colors hover:bg-brand-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Icon className="h-2.5 w-2.5" />
              View Evidence
            </button>
          )}
        </div>
      )}
    </li>
  );
}
