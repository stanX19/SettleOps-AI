"use client";

import React, { useState } from "react";
import {
  FileText, Image as ImageIcon, ChevronDown, ChevronRight,
  CheckCircle2, Wrench, FileQuestion, AlertCircle, ExternalLink,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { useCaseStore } from "@/stores/case-store";
import { CaseStatus, BlackboardSection } from "@/lib/types";
import { api } from "@/lib/api";

// ─── Constants ────────────────────────────────────────────────────────────────

const EXT_COLORS: Record<string, { bg: string; text: string }> = {
  pdf:  { bg: "bg-red-500/10",  text: "text-red-500" },
  jpg:  { bg: "bg-blue-500/10", text: "text-blue-400" },
  jpeg: { bg: "bg-blue-500/10", text: "text-blue-400" },
  png:  { bg: "bg-blue-500/10", text: "text-blue-400" },
  webp: { bg: "bg-blue-500/10", text: "text-blue-400" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getExt(filename: string) {
  return filename.split(".").pop()?.toLowerCase() || "file";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FileTypeBadge({ filename }: { filename: string }) {
  const ext = getExt(filename);
  const colors = EXT_COLORS[ext] || { bg: "bg-neutral-border/20", text: "text-neutral-text-tertiary" };
  return (
    <div className={`w-9 h-9 shrink-0 rounded-md flex items-center justify-center font-mono font-bold text-[9px] uppercase tracking-wide ${colors.bg} ${colors.text}`}>
      {ext.slice(0, 4)}
    </div>
  );
}

function TagPill({ label }: { label: string }) {
  if (!label || label === "unknown") return null;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
      {label.replace(/_/g, " ")}
    </span>
  );
}

function TagList({ tags }: { tags: string[] }) {
  const validTags = tags.filter(t => t && t !== "unknown");
  if (validTags.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {validTags.map(tag => <TagPill key={tag} label={tag} />)}
    </div>
  );
}

function FileChip({ url, filename, status, tags }: {
  url: string;
  filename: string;
  status: React.ReactNode;
  tags: string[];
}) {
  return (
    <div className="rounded-md border border-neutral-border/60 bg-white dark:bg-neutral-background">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 p-3 hover:bg-neutral-border/10 transition-colors group"
      >
        <FileTypeBadge filename={filename} />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-neutral-text-primary truncate group-hover:text-brand-primary transition-colors">
            {filename}
          </div>
          <div className="flex items-center gap-1 mt-0.5 text-[11px] text-neutral-text-secondary">
            {status}
          </div>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-neutral-text-tertiary opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
      </a>
      {tags.filter(t => t && t !== "unknown").length > 0 && (
        <div className="px-3 pb-2.5 border-t border-neutral-border/40 pt-2">
          <TagList tags={tags} />
        </div>
      )}
    </div>
  );
}

const DocumentSkeleton = () => (
  <div className="relative overflow-hidden p-3 rounded-md bg-white border border-neutral-border/50">
    <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-linear-to-r from-transparent via-neutral-text-primary/5 to-transparent" />
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-md bg-neutral-border/60 shrink-0 animate-pulse" />
      <div className="space-y-1.5 flex-1">
        <div className="h-2.5 bg-neutral-border/60 rounded w-2/3 animate-pulse" />
        <div className="h-2 bg-neutral-border/40 rounded w-1/3 animate-pulse" />
      </div>
    </div>
  </div>
);

function CollapsibleSection({ title, icon, count, children, defaultOpen = true }: any) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="bg-neutral-surface border border-neutral-border rounded-md shadow-card mb-4">
      <div
        className="bg-neutral-background px-3 py-2 border-b border-neutral-border flex items-center justify-between cursor-pointer hover:bg-neutral-border/30 transition-colors rounded-t-md"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center space-x-2">
          <div className="text-brand-primary opacity-80">{icon}</div>
          <span className="font-semibold text-sm text-neutral-text-primary">{title}</span>
          {count > 0 && (
            <Badge variant="secondary" className="ml-2 bg-neutral-surface border border-neutral-border text-neutral-text-secondary">
              {count}
            </Badge>
          )}
        </div>
        {isOpen
          ? <ChevronDown className="w-4 h-4 text-neutral-text-tertiary" />
          : <ChevronRight className="w-4 h-4 text-neutral-text-tertiary" />
        }
      </div>
      {isOpen && <div className="p-3">{children}</div>}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function InputsPane() {
  const router = useRouter();
  const documents  = useCaseStore(state => state.documents);
  const status     = useCaseStore(state => state.status);
  const blackboard = useCaseStore(state => state.blackboard);
  const isSyncing      = status === CaseStatus.RUNNING;
  const isAwaitingDocs = status === CaseStatus.AWAITING_DOCS;

  const caseFacts  = blackboard[BlackboardSection.CASE_FACTS] || {};
  const missingDocs = caseFacts.missing_documents || [];

  const policeReport   = documents.find(d => d.doc_type === "police_report");
  const adjusterReport = documents.find(d => d.doc_type === "adjuster_report");
  const policyPdf      = documents.find(d => d.doc_type === "policy_covernote");
  const photos         = documents.filter(d => d.doc_type === "car_photo_plate" || d.doc_type === "damage_closeup");
  const quotation      = documents.find(d => d.doc_type === "workshop_quote");
  const others         = documents.filter(d =>
    !["police_report", "adjuster_report", "policy_covernote", "car_photo_plate", "damage_closeup", "workshop_quote"].includes(d.doc_type)
  );

  const statusParsed   = <><CheckCircle2 className="w-3 h-3 text-semantic-success" />{isSyncing ? "Analyzing…" : "Parsed by Intake"}</>;
  const statusVerified = <><CheckCircle2 className="w-3 h-3 text-semantic-success" />Verified against API</>;
  const statusPricing  = <><CheckCircle2 className="w-3 h-3 text-semantic-success" />Pricing Extracted</>;
  const statusUntagged = <span className="text-neutral-text-tertiary italic">Untagged upload</span>;

  return (
    <div className="pl-6 pr-5 py-4 h-full overflow-y-auto bg-neutral-surface custom-scrollbar">
      <div className="flex flex-col mb-6 space-y-1">
        <h2 className="text-lg font-semibold text-neutral-text-primary">Case Assets</h2>
        <p className="text-xs text-neutral-text-secondary">Categorized evidence attached to this claim</p>
      </div>

      {isAwaitingDocs && (
        <div className="mb-6 p-4 bg-red-50/80 dark:bg-red-500/10 border border-red-200/80 dark:border-red-500/20 rounded-xl animate-in fade-in slide-in-from-top-2 duration-300 shadow-sm">
          <div className="flex items-center gap-2 mb-2.5 text-red-600 dark:text-red-400">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <h3 className="font-bold text-sm tracking-wide uppercase">
              Missing Required Documents
            </h3>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 mb-3.5 leading-relaxed">
            The Intake Agent has paused the workflow because the following evidence is missing or could not be identified:
          </p>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {missingDocs.map((doc: string) => (
              <span key={doc} className="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-semibold bg-red-100/50 dark:bg-red-500/20 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-500/30">
                {doc.replace(/_/g, " ")}
              </span>
            ))}
          </div>
          <button
            className="w-full bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white text-[11px] font-bold tracking-wider py-2.5 rounded-lg transition-all shadow-sm active:scale-[0.98]"
            onClick={() => router.push('/manage-hub')}
          >
            Upload
          </button>
        </div>
      )}

      <CollapsibleSection
        title="Official Reports"
        icon={<FileText className="w-4 h-4" />}
        count={(policeReport ? 1 : 0) + (adjusterReport ? 1 : 0)}
      >
        <div className="space-y-2">
          {policeReport && (
            <FileChip url={policeReport.url} filename={policeReport.filename} status={statusParsed} tags={policeReport.tags || [policeReport.doc_type]} />
          )}
          {adjusterReport && (
            <FileChip url={adjusterReport.url} filename={adjusterReport.filename} status={statusParsed} tags={adjusterReport.tags || [adjusterReport.doc_type]} />
          )}
          {!policeReport && !adjusterReport && (
            isSyncing ? <DocumentSkeleton /> : <div className="text-xs text-neutral-text-tertiary italic text-center py-2">No reports uploaded</div>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Policy Schedule" icon={<FileText className="w-4 h-4" />} count={policyPdf ? 1 : 0}>
        {policyPdf
          ? <FileChip url={policyPdf.url} filename={policyPdf.filename} status={statusVerified} tags={policyPdf.tags || [policyPdf.doc_type]} />
          : (isSyncing ? <DocumentSkeleton /> : <div className="text-xs text-neutral-text-tertiary italic text-center py-2">No policy document</div>)
        }
      </CollapsibleSection>

      <CollapsibleSection title="Documentation" icon={<ImageIcon className="w-4 h-4" />} count={photos.length}>
        {photos.length > 0 ? (
          <div className="space-y-2">
            {photos.map((photo, i) => (
              <FileChip key={i} url={photo.url} filename={photo.filename} status={statusParsed} tags={photo.tags || [photo.doc_type]} />
            ))}
          </div>
        ) : (isSyncing ? <DocumentSkeleton /> : <div className="text-xs text-neutral-text-tertiary italic text-center py-2">No photographs</div>)}
      </CollapsibleSection>

      <CollapsibleSection title="Quotations" icon={<Wrench className="w-4 h-4" />} count={quotation ? 1 : 0}>
        {quotation
          ? <FileChip url={quotation.url} filename={quotation.filename} status={statusPricing} tags={quotation.tags || [quotation.doc_type]} />
          : (isSyncing ? <DocumentSkeleton /> : <div className="text-xs text-neutral-text-tertiary italic text-center py-2">No quotation</div>)
        }
      </CollapsibleSection>

      <CollapsibleSection title="Other Evidences" icon={<FileQuestion className="w-4 h-4" />} count={others.length}>
        {others.length > 0 ? (
          <div className="space-y-2">
            {others.map((doc, i) => (
              <FileChip key={i} url={doc.url} filename={doc.filename} status={statusUntagged} tags={doc.tags || []} />
            ))}
          </div>
        ) : (isSyncing ? <DocumentSkeleton /> : <div className="text-xs text-neutral-text-tertiary italic text-center py-4">No additional evidence detected</div>)}
      </CollapsibleSection>
    </div>
  );
}
