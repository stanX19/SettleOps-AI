"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/primitives/Card";
import { FileText, Image as ImageIcon, MessageCircle, ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";
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
    <div className="p-4 h-full overflow-y-auto bg-neutral-background custom-scrollbar">
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
        <div className="flex flex-col space-y-2">
          <div className="text-xs font-semibold text-neutral-text-secondary uppercase">API Fetch Success</div>
          <div className="p-3 border-l-2 border-brand-primary bg-brand-primary-light/50 text-xs rounded-r-md">
            <span className="font-semibold text-neutral-text-primary block">EGI-MTR-2025-448812</span>
            <span className="text-neutral-text-secondary block mt-1">Etiqa Comprehensive Motor</span>
            <span className="text-neutral-text-secondary block">NCD 25% | Excess RM 400</span>
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

      <CollapsibleSection title="Driver Chat Log" icon={<MessageCircle className="w-4 h-4" />} defaultOpen={false}>
        <div className="space-y-3 bg-neutral-background p-3 rounded border border-neutral-border h-32 overflow-y-auto">
          <div className="flex flex-col items-start w-5/6">
            <span className="text-[10px] text-neutral-text-tertiary mb-1 ml-1">Tan Wei Ming (Claimant)</span>
            <div className="bg-neutral-surface p-2 rounded-lg rounded-tl-sm border border-neutral-border text-xs text-neutral-text-primary shadow-sm">
              He hit me from behind while I was waiting at the traffic light box.
            </div>
          </div>
          <div className="flex flex-col items-end w-5/6 self-end ml-auto">
            <span className="text-[10px] text-neutral-text-tertiary mb-1 mr-1">Hotline Agent</span>
            <div className="bg-brand-primary-light p-2 rounded-lg rounded-tr-sm border border-brand-primary/30 text-xs text-neutral-text-primary shadow-sm text-right">
              Noted encik. Have you filed the police report within 24hr?
            </div>
          </div>
        </div>
      </CollapsibleSection>
    </div>
  )
}
