'use client';

import React from 'react';
import { 
  Brain, 
  Terminal, 
  ShieldCheck, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  MessageSquare,
  Activity,
  X
} from "lucide-react";
import { Button } from "@/components/primitives/Button";
import { Badge } from "@/components/primitives/Badge";
import { AgentId, AgentStatus, AgentStateInfo } from "@/lib/types";

interface AgentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentId: AgentId | null;
  agentInfo: AgentStateInfo | null;
  onSelectForChat: (id: AgentId) => void;
}

export function AgentDetailsModal({ 
  isOpen, 
  onClose, 
  agentId, 
  agentInfo,
  onSelectForChat
}: AgentDetailsModalProps) {
  if (!isOpen || !agentId || !agentInfo) return null;

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
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 rounded-lg">
              <Brain className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 capitalize flex items-center gap-2">
                {agentId} Agent
                <Badge variant={getStatusVariant(agentInfo.status)} className="capitalize flex items-center gap-1">
                  {getStatusIcon(agentInfo.status)}
                  {agentInfo.status}
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
          {/* Purpose */}
          <div className="space-y-1">
            <p className="text-sm text-slate-400">
              {agentInfo.purpose || "Autonomous processing unit in the claims workflow."}
            </p>
          </div>

          {/* System Prompt Section */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
              System Instruction
            </h4>
            <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 text-sm italic text-slate-300 font-mono leading-relaxed shadow-inner">
              "{agentInfo.system_prompt || "Confidential agent instructions."}"
            </div>
          </div>

          {/* Logs Section */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              Execution Trace
            </h4>
            <div className="h-64 rounded-lg bg-slate-950 border border-slate-800 p-4 font-mono text-[11px] overflow-y-auto custom-scrollbar shadow-inner">
              {agentInfo.logs && agentInfo.logs.length > 0 ? (
                <div className="space-y-1.5">
                  {agentInfo.logs.map((log, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="text-slate-700 flex-shrink-0">[{i+1}]</span>
                      <span className="text-slate-400">{log}</span>
                    </div>
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
