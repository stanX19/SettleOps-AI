"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/primitives/Card";
import { FileText, Image as ImageIcon, ChevronDown, ChevronRight, CheckCircle2, Wrench, Mail, Play, Mic, FileQuestion } from "lucide-react";
import { Badge } from "@/components/primitives/Badge";

function CollapsibleSection({ title, icon, count, children, defaultOpen = true }: any) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Card className="mb-4 overflow-hidden border-neutral-border shadow-none">
      <div
        className="px-4 py-3 bg-neutral-surface flex items-center justify-between cursor-pointer hover:bg-neutral-background transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center space-x-2">
          <div className="text-brand-primary">{icon}</div>
          <span className="font-semibold text-sm text-neutral-text-primary">{title}</span>
          {count && <Badge variant="secondary" className="ml-2 bg-neutral-background border border-neutral-border text-neutral-text-secondary">{count}</Badge>}
        </div>
        {isOpen ? <ChevronDown className="w-4 h-4 text-neutral-text-tertiary" /> : <ChevronRight className="w-4 h-4 text-neutral-text-tertiary" />}
      </div>
      {isOpen && (
        <div className="px-4 pb-4 bg-neutral-surface border-t border-neutral-border pt-4 max-h-[240px] overflow-y-auto custom-scrollbar">
          {children}
        </div>
      )}
    </Card>
  );
}

export function InputsPane() {
  return (
    <div className="pl-6 pr-5 py-4 h-full overflow-y-auto bg-neutral-background custom-scrollbar">
      <div className="flex flex-col mb-6 space-y-1">
        <h2 className="text-lg font-semibold text-neutral-text-primary flex items-center">
          Case Assets
        </h2>
        <p className="text-xs text-neutral-text-secondary">Unstructured inputs arriving from Merimen</p>
      </div>

      <CollapsibleSection title="Official Reports" icon={<FileText className="w-4 h-4" />} count={2}>
        <div className="space-y-3">
          <div className="flex items-center p-3 rounded-md border border-neutral-border bg-neutral-background cursor-pointer hover:border-brand-primary transition-colors">
            <div className="w-8 h-10 bg-semantic-danger/10 text-semantic-danger flex items-center justify-center rounded truncate font-mono text-[10px] border border-semantic-danger/20 mr-3 shrink-0">PDF</div>
            <div className="flex-1 overflow-hidden">
              <div className="text-sm font-medium truncate text-neutral-text-primary">Police_Report_WXY1234.pdf</div>
              <div className="text-[11px] text-neutral-text-secondary flex items-center mt-0.5"><CheckCircle2 className="w-3 h-3 text-semantic-success mr-1" /> Parsed by Intake</div>
            </div>
          </div>

          <div className="flex items-center p-3 rounded-md border border-neutral-border bg-neutral-background cursor-pointer hover:border-brand-primary transition-colors">
            <div className="w-8 h-10 bg-semantic-danger/10 text-semantic-danger flex items-center justify-center rounded truncate font-mono text-[10px] border border-semantic-danger/20 mr-3 shrink-0">PDF</div>
            <div className="flex-1 overflow-hidden">
              <div className="text-sm font-medium truncate text-neutral-text-primary">Adjuster_Report_Final.pdf</div>
              <div className="text-[11px] text-neutral-text-secondary flex items-center mt-0.5"><CheckCircle2 className="w-3 h-3 text-semantic-success mr-1" /> Parsed by Intake</div>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Policy Schedule" icon={<FileText className="w-4 h-4" />} count={1}>
        <div className="flex items-center p-3 rounded-md border border-neutral-border bg-neutral-background cursor-pointer hover:border-brand-primary transition-colors group">
          <div className="w-8 h-10 bg-red-900/20 text-red-500 flex items-center justify-center rounded truncate font-mono text-[10px] border border-red-500/30 mr-3 shrink-0 group-hover:bg-red-900/30">PDF</div>
          <div className="flex-1 overflow-hidden">
            <div className="text-sm font-medium truncate text-neutral-text-primary">Policy_Schedule_448812.pdf</div>
            <div className="text-[11px] text-neutral-text-secondary flex items-center mt-0.5">
              <CheckCircle2 className="w-3 h-3 text-semantic-success mr-1" /> Verified against API
            </div>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Documentation" icon={<ImageIcon className="w-4 h-4" />} count={4}>
        <div className="grid grid-cols-2 gap-2">
          <div className="aspect-video bg-neutral-border rounded-md overflow-hidden relative group">
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-white text-xs font-medium">Rear Bumper</span>
            </div>
          </div>
          <div className="aspect-video bg-neutral-border rounded-md overflow-hidden relative group">
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-white text-xs font-medium">TP Front</span>
            </div>
          </div>
          <div className="aspect-video bg-neutral-border rounded-md overflow-hidden relative group">
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-white text-xs font-medium">Scene Wide</span>
            </div>
          </div>
          <div className="aspect-video bg-neutral-border rounded-md overflow-hidden relative group flex items-center justify-center text-xs text-neutral-text-tertiary">
            +1 More
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Quotations" icon={<Wrench className="w-4 h-4" />} count={1}>
        <div className="flex items-center p-2 rounded-md border border-neutral-border bg-neutral-background cursor-pointer hover:border-brand-primary transition-colors group">
          <div className="w-7 h-9 bg-red-900/20 text-red-500 flex items-center justify-center rounded truncate font-mono text-[9px] border border-red-500/30 mr-2 shrink-0 group-hover:bg-red-900/30">PDF</div>
          <div className="flex-1 overflow-hidden">
            <div className="text-xs font-medium truncate text-neutral-text-primary">Estimate_WXY1234.pdf</div>
            <div className="text-[10px] text-neutral-text-secondary flex items-center mt-0.5"><CheckCircle2 className="w-2.5 h-2.5 text-semantic-success mr-1" /> Pricing Extracted</div>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Other Evidences" icon={<FileQuestion className="w-4 h-4" />} count={3}>
        <div className="space-y-1">
          {/* Email Evidence */}
          <div className="flex items-center p-2 rounded-md hover:bg-neutral-surface transition-colors cursor-pointer group">
            <div className="w-8 h-8 rounded bg-blue-500/10 flex items-center justify-center mr-3 shrink-0 group-hover:bg-blue-500/20 transition-colors">
              <Mail className="w-4 h-4 text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-neutral-text-primary truncate">Witness Statement (A. Chong)</div>
              <div className="text-[10px] text-neutral-text-tertiary">Email Correspondence</div>
            </div>
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500/50 ml-2"></div>
          </div>

          {/* Video Evidence */}
          <div className="flex items-center p-2 rounded-md hover:bg-neutral-surface transition-colors cursor-pointer group">
            <div className="w-8 h-8 rounded bg-emerald-500/10 flex items-center justify-center mr-3 shrink-0 group-hover:bg-emerald-500/20 transition-colors">
              <Play className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-neutral-text-primary truncate">Dashcam_Rear_001.mp4</div>
              <div className="text-[10px] text-neutral-text-tertiary">Video Asset</div>
            </div>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50 ml-2"></div>
          </div>

          {/* Voice Memo */}
          <div className="flex items-center p-2 rounded-md hover:bg-neutral-surface transition-colors cursor-pointer group">
            <div className="w-8 h-8 rounded bg-amber-500/10 flex items-center justify-center mr-3 shrink-0 group-hover:bg-amber-500/20 transition-colors">
              <Mic className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-neutral-text-primary truncate">Audio_Claim_Recording.wav</div>
              <div className="text-[10px] text-neutral-text-tertiary">Voice Log</div>
            </div>
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500/50 ml-2 shadow-[0_0_8px_rgba(245,158,11,0.3)]"></div>
          </div>
        </div>
      </CollapsibleSection>
    </div>
  )
}
