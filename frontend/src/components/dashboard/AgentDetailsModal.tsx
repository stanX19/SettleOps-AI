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
      case AgentStatus.WORKING: return <Activity className="w-4 h-4 animate-pulse text-blue-400" />;
      case AgentStatus.COMPLETED: return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      case AgentStatus.ERROR: return <AlertCircle className="w-4 h-4 text-red-400" />;
      default: return <Clock className="w-4 h-4 text-slate-400" />;
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className="bg-slate-900 border border-slate-800 rounded-lg shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 rounded-lg">
              <Brain className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 capitalize flex items-center gap-2">
                {titleOverride ?? (subtaskName
                  ? `${agentId} → ${subtaskName.replace(/_/g, ' ')}`
                  : `${agentId} Agent`)}
                <Badge variant={getStatusVariant(displayInfo.status)} className="capitalize flex items-center gap-1">
                  {getStatusIcon(displayInfo.status)}
                  {displayInfo.status}
                </Badge>
              </h2>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-800 rounded-md transition-colors text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh] custom-scrollbar">
          {/* Purpose — always from parent agent */}
          <div className="space-y-1">
            <p className="text-sm text-slate-400">
              {agentInfo.purpose || "Autonomous processing unit in the claims workflow."}
            </p>
          </div>

          {/* System Prompt — always from parent agent */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
              System Instruction
            </h4>
            <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 text-sm italic text-slate-300 font-mono leading-relaxed shadow-inner">
              "{agentInfo.system_prompt || "Confidential agent instructions."}"
            </div>
          </div>

          {/* Logs — from subtask if selected, otherwise from parent */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              Execution Trace
            </h4>
            <div className="rounded-lg bg-slate-950 border border-slate-800 p-4 font-mono text-[11px] overflow-y-auto custom-scrollbar shadow-inner max-h-64">
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
                    <span className="text-emerald-500">_</span>
                  </div>
                </div>
              ) : (
                <div className="text-slate-700 italic">No logs available for current session.</div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex justify-end gap-3">
          <Button
            variant="secondary"
            onClick={onClose}
            className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            Close
          </Button>
          <Button
            onClick={() => {
              onSelectForChat(agentId);
              onClose();
            }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white border-none shadow-lg shadow-indigo-500/20"
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
        <span className="text-slate-700 flex-shrink-0 mt-0.5">[{index + 1}]</span>
        <span className="text-slate-400 flex-1 leading-relaxed">{entry.text}</span>
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
            className={`flex-shrink-0 mt-0.5 rounded p-0.5 transition-colors ${
              expanded
                ? "text-brand-primary bg-brand-primary/10"
                : "text-slate-600 hover:text-brand-primary hover:bg-brand-primary/10"
            }`}
          >
            <BookOpen className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Inline citation detail — compact mode (no excerpt, no View Evidence button) */}
      {expanded && citation && (
        <div className="ml-7 mt-0.5 rounded border border-neutral-border/60 bg-slate-900 overflow-hidden">
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
