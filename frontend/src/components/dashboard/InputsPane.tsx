"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/primitives/Card";
import { FileText, Image as ImageIcon, ChevronDown, ChevronRight, CheckCircle2, Wrench, FileQuestion, AlertCircle } from "lucide-react";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { useCaseStore } from "@/stores/case-store";
import { CaseStatus, BlackboardSection, AgentId, SseAgentOutput } from "@/lib/types";
import { api } from "@/lib/api";

const DocumentSkeleton = () => (
  <div className="relative overflow-hidden p-3 rounded-md bg-neutral-background border border-neutral-border/50">
    <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-neutral-text-primary/5 to-transparent dark:via-neutral-text-primary/10" />
    <div className="flex items-center space-x-3 mb-3">
      <div className="w-6 h-6 rounded bg-neutral-border/60 shrink-0" />
      <div className="h-2.5 bg-neutral-border/60 rounded w-1/3" />
    </div>
    <div className="space-y-2 mb-3">
      <div className="h-2 bg-neutral-border/40 rounded w-full" />
      <div className="h-2 bg-neutral-border/40 rounded w-4/5" />
    </div>
    <div className="flex justify-between items-center pt-2 border-t border-neutral-border/30">
      <div className="h-2 bg-neutral-border/40 rounded w-1/4" />
      <div className="h-2 bg-neutral-border/40 rounded w-1/5" />
    </div>
  </div>
);

function CollapsibleSection({ title, icon, count, children, defaultOpen = true }: any) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Card className="mb-4 overflow-hidden border-neutral-border shadow-none bg-neutral-background">
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-neutral-border/30 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center space-x-2">
          <div className="text-brand-primary">{icon}</div>
          <span className="font-semibold text-sm text-neutral-text-primary">{title}</span>
          {count > 0 && <Badge variant="secondary" className="ml-2 bg-neutral-surface border border-neutral-border text-neutral-text-secondary">{count}</Badge>}
        </div>
        {isOpen ? <ChevronDown className="w-4 h-4 text-neutral-text-tertiary" /> : <ChevronRight className="w-4 h-4 text-neutral-text-tertiary" />}
      </div>
      {isOpen && (
        <div className="px-4 pb-4 border-t border-neutral-border pt-4 max-h-[240px] overflow-y-auto custom-scrollbar">
          {children}
        </div>
      )}
    </Card>
  );
}

export function InputsPane() {
  const caseId = useCaseStore(state => state.case_id);
  const documents = useCaseStore(state => state.documents);
  const status = useCaseStore(state => state.status);
  const blackboard = useCaseStore(state => state.blackboard);
  const isSyncing = status === CaseStatus.RUNNING;
  const isAwaitingDocs = status === CaseStatus.AWAITING_DOCS;

  const caseFacts = blackboard[BlackboardSection.CASE_FACTS] || {};
  const missingDocs = caseFacts.missing_documents || [];

  const handleTagChange = async (docIndex: number, newTag: string) => {
    if (!caseId) return;
    
    // Get current case facts or default
    const currentFacts = blackboard[BlackboardSection.CASE_FACTS] || {};
    const currentTags = currentFacts.tagged_documents || {};
    
    const newTags = { ...currentTags, [docIndex.toString()]: newTag };
    const updatedFacts = { ...currentFacts, tagged_documents: newTags };
    
    try {
      await api.updateBlackboardSection(caseId, BlackboardSection.CASE_FACTS, updatedFacts);
      // Update local store immediately for snappiness
      useCaseStore.getState().handleAgentOutput({
        agent: AgentId.INTAKE,
        case_id: caseId,
        timestamp: new Date().toISOString(),
        section: BlackboardSection.CASE_FACTS,
        data: updatedFacts
      } as SseAgentOutput);
    } catch (err) {
      console.error("Failed to update tag:", err);
    }
  };

  const REQUIRED_DOCS = [
    "car_photo_plate",
    "damage_closeup",
    "driver_license",
    "road_tax_reg",
    "nric",
    "policy_covernote",
    "police_report",
    "workshop_quote",
  ];

  const TagSelector = ({ docIndex, currentTags }: { docIndex?: number, currentTags: string[] }) => {
    if (docIndex === undefined) return null;
    const primaryTag = currentTags[0] || "unknown";
    return (
      <div className="flex flex-col space-y-1">
        <select 
          value={primaryTag} 
          onChange={(e) => handleTagChange(docIndex, e.target.value)}
          className="mt-1 text-[10px] bg-neutral-surface border border-neutral-border rounded px-1 py-0.5 text-neutral-text-secondary focus:border-brand-primary outline-none"
        >
          <option value="unknown">Tag as...</option>
          {REQUIRED_DOCS.map(tag => (
            <option key={tag} value={tag}>{tag.replace(/_/g, ' ')}</option>
          ))}
        </select>
        {currentTags.length > 1 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {currentTags.slice(1).map(tag => (
              <span key={tag} className="text-[8px] bg-brand-primary/10 text-brand-primary px-1 rounded border border-brand-primary/20">
                + {tag.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  const policeReport = documents.find(d => d.doc_type === "police_report");
  const adjusterReport = documents.find(d => d.doc_type === "adjuster_report");
  const policyPdf = documents.find(d => d.doc_type === "policy_covernote");
  const photos = documents.filter(d => d.doc_type === "car_photo_plate" || d.doc_type === "damage_closeup");
  const quotation = documents.find(d => d.doc_type === "workshop_quote");
  const others = documents.filter(d => !["police_report", "adjuster_report", "policy_covernote", "car_photo_plate", "damage_closeup", "workshop_quote"].includes(d.doc_type));

  return (
    <div className="pl-6 pr-5 py-4 h-full overflow-y-auto bg-neutral-surface custom-scrollbar">
      <div className="flex flex-col mb-6 space-y-1">
        <h2 className="text-lg font-semibold text-neutral-text-primary flex items-center">
          Case Assets
        </h2>
        <p className="text-xs text-neutral-text-secondary">Unstructured inputs arriving from Merimen</p>
      </div>

      {isAwaitingDocs && (
        <div className="mb-6 p-4 bg-semantic-danger/10 border border-semantic-danger/20 rounded-lg animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center space-x-2 text-semantic-danger mb-2">
            <AlertCircle className="w-5 h-5" />
            <span className="font-bold text-sm uppercase tracking-tight">Missing Required Documents</span>
          </div>
          <p className="text-xs text-neutral-text-secondary mb-3">
            The Intake Agent has paused the workflow because the following evidence is missing or could not be identified:
          </p>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {missingDocs.map((doc: string) => (
              <Badge key={doc} variant="outline" className="border-semantic-danger/30 text-semantic-danger bg-semantic-danger/5">
                {doc.replace(/_/g, ' ')}
              </Badge>
            ))}
          </div>
          <Button 
            size="sm" 
            className="w-full bg-semantic-danger hover:bg-semantic-danger/90 text-white text-[11px] font-bold uppercase tracking-widest"
            onClick={() => useCaseStore.getState().setBlackboardMode('chat')}
          >
            Ask AI why documents were rejected
          </Button>
        </div>
      )}

      <CollapsibleSection title="Official Reports" icon={<FileText className="w-4 h-4" />} count={(policeReport ? 1 : 0) + (adjusterReport ? 1 : 0)}>
        <div className="space-y-3">
          {policeReport && (
            <div className="group">
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
              <TagSelector docIndex={policeReport.index} currentTags={policeReport.tags || [policeReport.doc_type]} />
            </div>
          )}

          {adjusterReport && (
            <div className="group">
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
              <TagSelector docIndex={adjusterReport.index} currentTags={adjusterReport.tags || [adjusterReport.doc_type]} />
            </div>
          )}

          {!policeReport && !adjusterReport && (
            isSyncing ? <DocumentSkeleton /> : <div className="text-[10px] text-neutral-text-tertiary italic text-center py-2">No reports uploaded</div>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Policy Schedule" icon={<FileText className="w-4 h-4" />} count={policyPdf ? 1 : 0}>
        {policyPdf ? (
          <div className="group">
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
            <TagSelector docIndex={policyPdf.index} currentTags={policyPdf.tags || [policyPdf.doc_type]} />
          </div>
        ) : (
          isSyncing ? <DocumentSkeleton /> : <div className="text-[10px] text-neutral-text-tertiary italic text-center py-2">No policy document</div>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Documentation" icon={<ImageIcon className="w-4 h-4" />} count={photos.length}>
        {photos.length > 0 ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {photos.slice(0, 4).map((photo, i) => (
                <div key={i} className="flex flex-col">
                  <a 
                    href={photo.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="aspect-video bg-neutral-border rounded-md overflow-hidden relative group block"
                  >
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-white text-[10px] font-medium truncate px-1">{photo.filename}</span>
                    </div>
                  </a>
                  <TagSelector docIndex={photo.index} currentTags={photo.tags || [photo.doc_type]} />
                </div>
              ))}
            </div>
            {photos.length > 4 && (
              <div className="text-[10px] text-neutral-text-tertiary text-center">
                +{photos.length - 4} more photos in Manage Hub
              </div>
            )}
          </div>
        ) : (
          isSyncing ? <DocumentSkeleton /> : <div className="text-[10px] text-neutral-text-tertiary italic text-center py-2">No photographs</div>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Quotations" icon={<Wrench className="w-4 h-4" />} count={quotation ? 1 : 0}>
        {quotation ? (
          <div className="group">
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
            <TagSelector docIndex={quotation.index} currentTags={quotation.tags || [quotation.doc_type]} />
          </div>
        ) : (
          isSyncing ? <DocumentSkeleton /> : <div className="text-[10px] text-neutral-text-tertiary italic text-center py-2">No quotation</div>
        )}
      </CollapsibleSection>


      <CollapsibleSection title="Other Evidences" icon={<FileQuestion className="w-4 h-4" />} count={others.length}>
        {others.length > 0 ? (
          <div className="space-y-3">
            {others.map((doc, i) => (
              <div key={i} className="group border-b border-neutral-border pb-3 last:border-0 last:pb-0">
                <a 
                  href={doc.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center p-2 rounded-md border border-neutral-border bg-neutral-background cursor-pointer hover:border-brand-primary transition-colors block"
                >
                  <div className="w-7 h-9 bg-neutral-border/20 text-neutral-text-tertiary flex items-center justify-center rounded truncate font-mono text-[9px] border border-neutral-border mr-2 shrink-0">{doc.filename.split('.').pop()?.toUpperCase()}</div>
                  <div className="flex-1 overflow-hidden">
                    <div className="text-xs font-medium truncate text-neutral-text-primary">{doc.filename}</div>
                    <div className="text-[10px] text-neutral-text-secondary italic">Untagged / Raw Upload</div>
                  </div>
                </a>
                <TagSelector docIndex={doc.index} currentTags={doc.tags || [doc.doc_type]} />
              </div>
            ))}
          </div>
        ) : (
          isSyncing ? <DocumentSkeleton /> : (
            <div className="text-[10px] text-neutral-text-tertiary italic text-center py-4">
              No additional evidence detected
            </div>
          )
        )}
      </CollapsibleSection>
    </div>
  );
}
