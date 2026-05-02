'use client';

import React, { useState } from 'react';
import {
  Brain,
  Terminal,
  ShieldCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Activity,
  X,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/primitives/Button";
import { Badge } from "@/components/primitives/Badge";
import { AgentId, AgentStatus, AgentStateInfo, Citation, CitationSummary, DocumentInfo, LogEntry } from "@/lib/types";
import { CitationRow } from "@/components/dashboard/CitationPanel";
import {
  findCitationByFieldPath,
  findCitationById,
  findCitationMentionedInText,
  findFirstCitationByNodeId,
} from "@/lib/citation-utils";

interface AgentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentId: AgentId | null;
  agentInfo: AgentStateInfo | null;
  /** When set, show this subtask's status/logs while keeping parent purpose/system_prompt. */
  subtaskName?: string;
  titleOverride?: string;
  /** CitationSummary for the section this agent owns — enables citation-linked log rows. */
  citations?: CitationSummary | null;
  /** Documents list needed by CitationRow to resolve file URLs. */
  documents?: DocumentInfo[];
  onViewEvidence?: (citation: Citation) => void;
  onSelectForChat: (id: AgentId) => void;
}

export function AgentDetailsModal({
  isOpen,
  onClose,
  agentId,
  agentInfo,
  subtaskName,
  titleOverride,
  citations,
  documents = [],
  onViewEvidence,
  onSelectForChat
}: AgentDetailsModalProps) {
  if (!isOpen || !agentId || !agentInfo) return null;

  // When a subtask node was clicked, show subtask-level status/logs; fall back to parent.
  const displayInfo: AgentStateInfo =
    subtaskName && agentInfo.sub_tasks?.[subtaskName]
      ? agentInfo.sub_tasks[subtaskName]
      : agentInfo;
  const traceEntries: LogEntry[] =
    displayInfo.log_entries && displayInfo.log_entries.length > 0
      ? displayInfo.log_entries
      : (displayInfo.logs ?? []).map((text) => ({ text }));

  const getStatusIcon = (status: AgentStatus) => {
    switch (status) {
      case AgentStatus.WORKING: return <Activity className="w-4 h-4 animate-pulse text-brand-primary" />;
      case AgentStatus.COMPLETED: return <CheckCircle2 className="w-4 h-4 text-semantic-success" />;
      case AgentStatus.ERROR: return <AlertCircle className="w-4 h-4 text-semantic-danger" />;
      default: return <Clock className="w-4 h-4 text-neutral-text-tertiary" />;
    }
  };

  const getStatusVariant = (status: AgentStatus) => {
    switch (status) {
      case AgentStatus.WORKING: return "default";
      case AgentStatus.COMPLETED: return "success";
      case AgentStatus.ERROR: return "distructive";
      default: return "secondary";
    }
  };

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className="bg-neutral-surface border border-neutral-border rounded-lg shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="p-4 border-b border-neutral-border flex items-center justify-between bg-neutral-background/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-primary/10 rounded-lg">
              <Brain className="w-5 h-5 text-brand-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-neutral-text-primary capitalize flex items-center gap-2">
                {titleOverride ?? (subtaskName
                  ? `${agentId} → ${subtaskName.replace(/_/g, ' ')}`
                  : `${agentId} Agent`)}
                <Badge variant={getStatusVariant(displayInfo.status)} className="capitalize flex items-center gap-1">
                  {displayInfo.status}
                </Badge>
              </h2>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-neutral-border rounded-md transition-colors text-neutral-text-tertiary">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh] custom-scrollbar bg-neutral-background">
          {/* Purpose — always from parent agent */}
          <div className="space-y-1">
            <p className="text-sm text-neutral-text-secondary">
              {agentInfo.purpose || "Autonomous processing unit in the claims workflow."}
            </p>
          </div>

          {/* System Prompt — always from parent agent */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-neutral-text-tertiary uppercase tracking-widest flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-brand-primary" />
              System Instruction
            </h4>
            <div className="p-4 rounded-lg bg-neutral-surface border border-neutral-border text-sm italic text-neutral-text-secondary font-mono leading-relaxed shadow-inner">
              &quot;{agentInfo.system_prompt || "Confidential agent instructions."}&quot;
            </div>
          </div>

          {/* Logs — from subtask if selected, otherwise from parent */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-neutral-text-tertiary uppercase tracking-widest flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-semantic-success" />
              Execution Trace
            </h4>
            <div className="rounded-lg bg-neutral-surface border border-neutral-border p-4 font-mono text-sm overflow-y-auto custom-scrollbar shadow-inner max-h-64">
              {traceEntries.length > 0 ? (
                <div className="space-y-1">
                  {traceEntries.map((entry, i) => (
                    <LogRow
                      key={i}
                      index={i}
                      entry={entry}
                      citations={citations}
                      documents={documents}
                      subtaskName={subtaskName}
                      onViewEvidence={onViewEvidence}
                    />
                  ))}
                  <div className="h-2" />
                  <div className="animate-pulse flex gap-2">
                    <span className="text-semantic-success">_</span>
                  </div>
                </div>
              ) : (
                <div className="text-neutral-text-tertiary italic">No logs available for current session.</div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-border bg-white flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-neutral-border text-neutral-text-primary hover:bg-neutral-surface"
          >
            Close
          </Button>
          <Button
            onClick={() => {
              onSelectForChat(agentId);
              onClose();
            }}
            className="bg-brand-primary text-black hover:bg-brand-primary-hover font-semibold shadow-sm"
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            Discuss Findings
          </Button>
        </div>
      </div>
    </div>
  );
}

function resolveLogCitation(
  entry: LogEntry,
  summary: CitationSummary,
  subtaskName?: string,
): Citation | null {
  if (entry.citation_id) {
    const byId = findCitationById(entry.citation_id, summary);
    if (byId) return byId;
  }

  if (entry.citation_ref) {
    const byRef = findCitationByFieldPath(entry.citation_ref, summary);
    if (byRef) return byRef;
  }

  const byText = findCitationMentionedInText(entry.text, summary);
  if (byText) return byText;

  if (subtaskName) {
    return findFirstCitationByNodeId(subtaskName, summary);
  }

  return null;
}

// -- Citation-aware log row ---------------------------------------------------

function LogRow({
  index,
  entry,
  citations,
  documents,
  subtaskName,
  onViewEvidence,
}: {
  index: number;
  entry: LogEntry;
  citations?: CitationSummary | null;
  documents: DocumentInfo[];
  subtaskName?: string;
  onViewEvidence?: (citation: Citation) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const citation: Citation | null = citations
    ? resolveLogCitation(entry, citations, subtaskName)
    : null;

  const hasCitation = citation !== null;

  return (
    <div className="space-y-1">
      <div className="flex gap-3 items-start">
        <span className="text-neutral-text-tertiary shrink-0 mt-0.5">[{index + 1}]</span>
        <span className="text-neutral-text-primary flex-1 leading-relaxed">{entry.text}</span>
        {hasCitation && (
          <button
            onClick={() => {
              if (citation && onViewEvidence) {
                onViewEvidence(citation);
                return;
              }
              setExpanded((e) => !e);
            }}
            title="View supporting citation"
            className={`shrink-0 mt-0.5 rounded p-1 transition-colors ${
              expanded
                ? "text-brand-primary bg-brand-primary/10"
                : "text-neutral-text-tertiary hover:text-brand-primary hover:bg-brand-primary/10"
            }`}
          >
            <BookOpen className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Inline citation detail — compact mode (no excerpt, no View Evidence button) */}
      {expanded && citation && (
        <div className="ml-7 mt-0.5 rounded border border-neutral-border/60 bg-neutral-background overflow-hidden">
          <CitationRow
            citation={citation}
            documents={documents}
            onViewEvidence={() => {}}
            isLast
            compact
          />
        </div>
      )}
    </div>
  );
}
