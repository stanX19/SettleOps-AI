"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/primitives/Card";
import { FileText, Image as ImageIcon, ChevronDown, ChevronRight, CheckCircle2, Wrench, FileQuestion } from "lucide-react";
import { Badge } from "@/components/primitives/Badge";
import { useCaseStore } from "@/stores/case-store";
import { CaseStatus } from "@/lib/types";

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
          {count > 0 && <Badge variant="secondary" className="ml-2 bg-neutral-background border border-neutral-border text-neutral-text-secondary">{count}</Badge>}
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
  const documents = useCaseStore(state => state.documents);
  const status = useCaseStore(state => state.status);
  const isSyncing = status === CaseStatus.RUNNING;

  const policeReport = documents.find(d => d.doc_type === "police_report");
  const adjusterReport = documents.find(d => d.doc_type === "adjuster_report"); // Note: backend REQUIRED_DOCS may not have this, keeping for backwards compat
  const policyPdf = documents.find(d => d.doc_type === "policy_covernote");
  const photos = documents.filter(d => d.doc_type === "car_photo_plate" || d.doc_type === "damage_closeup");
  const quotation = documents.find(d => d.doc_type === "workshop_quote");

  return (
    <div className="pl-6 pr-5 py-4 h-full overflow-y-auto bg-neutral-background custom-scrollbar">
      <div className="flex flex-col mb-6 space-y-1">
        <h2 className="text-lg font-semibold text-neutral-text-primary flex items-center">
          Case Assets
        </h2>
        <p className="text-xs text-neutral-text-secondary">Unstructured inputs arriving from Merimen</p>
      </div>

      <CollapsibleSection title="Official Reports" icon={<FileText className="w-4 h-4" />} count={policeReport || adjusterReport ? (policeReport ? 1 : 0) + (adjusterReport ? 1 : 0) : 0}>
        <div className="space-y-3">
          {policeReport && (
            <a 
              href={policeReport.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center p-3 rounded-md border border-neutral-border bg-neutral-background cursor-pointer hover:border-brand-primary transition-colors block"
            >
              <div className="w-8 h-10 bg-semantic-danger/10 text-semantic-danger flex items-center justify-center rounded truncate font-mono text-[10px] border border-semantic-danger/20 mr-3 shrink-0">PDF</div>
              <div className="flex-1 overflow-hidden">
                <div className="text-sm font-medium truncate text-neutral-text-primary">{policeReport.filename}</div>
                <div className="text-[11px] text-neutral-text-secondary flex items-center mt-0.5">
                  <CheckCircle2 className="w-3 h-3 text-semantic-success mr-1" />
                  {isSyncing ? "Analyzing..." : "Parsed by Intake"}
                </div>
              </div>
            </a>
          )}

          {adjusterReport && (
            <a 
              href={adjusterReport.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center p-3 rounded-md border border-neutral-border bg-neutral-background cursor-pointer hover:border-brand-primary transition-colors block"
            >
              <div className="w-8 h-10 bg-semantic-danger/10 text-semantic-danger flex items-center justify-center rounded truncate font-mono text-[10px] border border-semantic-danger/20 mr-3 shrink-0">PDF</div>
              <div className="flex-1 overflow-hidden">
                <div className="text-sm font-medium truncate text-neutral-text-primary">{adjusterReport.filename}</div>
                <div className="text-[11px] text-neutral-text-secondary flex items-center mt-0.5">
                  <CheckCircle2 className="w-3 h-3 text-semantic-success mr-1" />
                  {isSyncing ? "Analyzing..." : "Parsed by Intake"}
                </div>
              </div>
            </a>
          )}

          {!policeReport && !adjusterReport && (
            <div className="text-[10px] text-neutral-text-tertiary italic text-center py-2">No reports uploaded</div>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Policy Schedule" icon={<FileText className="w-4 h-4" />} count={policyPdf ? 1 : 0}>
        {policyPdf ? (
          <a 
            href={policyPdf.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center p-3 rounded-md border border-neutral-border bg-neutral-background cursor-pointer hover:border-brand-primary transition-colors group block"
          >
            <div className="w-8 h-10 bg-red-900/20 text-red-500 flex items-center justify-center rounded truncate font-mono text-[10px] border border-red-500/30 mr-3 shrink-0 group-hover:bg-red-900/30">PDF</div>
            <div className="flex-1 overflow-hidden">
              <div className="text-sm font-medium truncate text-neutral-text-primary">{policyPdf.filename}</div>
              <div className="text-[11px] text-neutral-text-secondary flex items-center mt-0.5">
                <CheckCircle2 className="w-3 h-3 text-semantic-success mr-1" /> Verified against API
              </div>
            </div>
          </a>
        ) : (
          <div className="text-[10px] text-neutral-text-tertiary italic text-center py-2">No policy document</div>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Documentation" icon={<ImageIcon className="w-4 h-4" />} count={photos.length}>
        {photos.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {photos.slice(0, 3).map((photo, i) => (
              <a 
                key={i} 
                href={photo.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="aspect-video bg-neutral-border rounded-md overflow-hidden relative group block"
              >
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-white text-[10px] font-medium truncate px-1">{photo.filename}</span>
                </div>
              </a>
            ))}
            {photos.length > 3 && (
              <div className="aspect-video bg-neutral-border rounded-md overflow-hidden relative group flex items-center justify-center text-xs text-neutral-text-tertiary">
                +{photos.length - 3} More
              </div>
            )}
          </div>
        ) : (
          <div className="text-[10px] text-neutral-text-tertiary italic text-center py-2">No photographs</div>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Quotations" icon={<Wrench className="w-4 h-4" />} count={quotation ? 1 : 0}>
        {quotation ? (
          <a 
            href={quotation.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center p-2 rounded-md border border-neutral-border bg-neutral-background cursor-pointer hover:border-brand-primary transition-colors group block"
          >
            <div className="w-7 h-9 bg-red-900/20 text-red-500 flex items-center justify-center rounded truncate font-mono text-[9px] border border-red-500/30 mr-2 shrink-0 group-hover:bg-red-900/30">PDF</div>
            <div className="flex-1 overflow-hidden">
              <div className="text-xs font-medium truncate text-neutral-text-primary">{quotation.filename}</div>
              <div className="text-[10px] text-neutral-text-secondary flex items-center mt-0.5"><CheckCircle2 className="w-2.5 h-2.5 text-semantic-success mr-1" /> Pricing Extracted</div>
            </div>
          </a>
        ) : (
          <div className="text-[10px] text-neutral-text-tertiary italic text-center py-2">No quotation</div>
        )}
      </CollapsibleSection>


      <CollapsibleSection title="Other Evidences" icon={<FileQuestion className="w-4 h-4" />} count={0}>
        <div className="text-[10px] text-neutral-text-tertiary italic text-center py-4">
          No additional evidence detected
        </div>
      </CollapsibleSection>
    </div>
  )
}
