"use client";

import React, { use, useState, useRef } from "react";
import {
  FileText,
  Upload,
  ChevronLeft,
  Play,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  ShieldCheck
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/primitives/Button";
import { CaseStatus } from "@/lib/types";

interface PageProps {
  params: Promise<{ caseId: string }>;
}

interface UploadedFile {
  id: string;
  name: string;
  size: string;
  date: string;
}

export default function ManageCasePage({ params }: PageProps) {
  const { caseId } = use(params);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [status, setStatus] = useState<CaseStatus>(CaseStatus.RUNNING); // Default to Ongoing
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;

    const newFiles: UploadedFile[] = Array.from(fileList).map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      size: (file.size / 1024 / 1024).toFixed(2) + " MB",
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    }));

    setFiles(prev => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  return (
    <div className="flex flex-col h-full w-full bg-neutral-background p-8 overflow-hidden">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".pdf"
        multiple
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-8 flex-shrink-0">
        <div className="flex items-center space-x-4">
          <Link href={`/workflow/${caseId}`} className="p-2 hover:bg-neutral-surface rounded-md transition-colors text-neutral-text-secondary">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="flex flex-col">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-neutral-text-primary">Workflow Management</h1>
              <StatusBadge status={status} />
            </div>
            <div className="mt-1 flex items-center space-x-2">
              <span className="text-xs font-mono text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded uppercase">{caseId}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <Button variant="outline" className="flex items-center space-x-2 bg-neutral-surface border-neutral-border text-neutral-text-primary hover:bg-neutral-background transition-all">
            <Play className="w-4 h-4 fill-current" />
            <span>Start Workflow</span>
          </Button>
          <Button onClick={handleUploadClick} className="flex items-center space-x-2">
            <Upload className="w-4 h-4" />
            <span>Upload New Evidence</span>
          </Button>
        </div>
      </div>

      {/* Grid Layout - Filling remaining height */}
      <div className="grid grid-cols-12 gap-8 flex-1 min-h-0">

        {/* Left Column: Evidence Hub */}
        <div className="col-span-12 lg:col-span-8 flex flex-col min-h-0">

          {/* Document Management Hub */}
          <div className="bg-neutral-surface border border-neutral-border rounded-lg shadow-sm flex flex-col h-full overflow-hidden">
            <div className="p-6 border-b border-neutral-border flex items-center justify-between flex-shrink-0">
              <div className="flex items-center space-x-2">
                <FileText className="w-5 h-5 text-brand-primary" />
                <h2 className="text-lg font-semibold text-neutral-text-primary">Document Evidence Slots</h2>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-neutral-text-tertiary mr-2">
                  {files.length} DOCUMENT{files.length !== 1 ? 'S' : ''} UPLOADED
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {files.length > 0 ? (
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-neutral-surface z-10">
                    <tr className="bg-neutral-background/30">
                      <th className="px-6 py-3 text-xs font-semibold text-neutral-text-tertiary uppercase tracking-wider w-3/5">Document Name</th>
                      <th className="px-6 py-3 text-xs font-semibold text-neutral-text-tertiary uppercase tracking-wider">Size</th>
                      <th className="px-6 py-3 text-xs font-semibold text-neutral-text-tertiary uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-border">
                    {files.map(file => (
                      <DocumentRow
                        key={file.id}
                        name={file.name}
                        size={file.size}
                        onDelete={() => removeFile(file.id)}
                      />
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center h-full">
                  <div className="w-16 h-16 bg-neutral-background border border-neutral-border rounded-full flex items-center justify-center mb-4">
                    <Upload className="w-8 h-8 text-neutral-text-tertiary opacity-20" />
                  </div>
                  <h4 className="text-neutral-text-primary font-medium mb-1">No evidence uploaded yet</h4>
                  <p className="text-xs text-neutral-text-tertiary max-w-[240px]">
                    Upload relevant PDF documents to begin the settlement orchestration.
                  </p>
                  <Button variant="ghost" onClick={handleUploadClick} className="mt-4 text-brand-primary">
                    Select Files
                  </Button>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Right Column: PDF Report Preview */}
        <div className="col-span-12 lg:col-span-4 flex flex-col min-h-0">
          <div className="bg-neutral-surface border border-neutral-border rounded-lg h-full flex flex-col shadow-sm overflow-hidden">
            <div className="p-4 border-b border-neutral-border flex items-center justify-between bg-neutral-background/30 flex-shrink-0">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-brand-primary" />
                <h3 className="text-sm font-semibold text-neutral-text-primary">Final Report Preview</h3>
              </div>
              <div className="flex items-center space-x-2">
                <Button variant="ghost" size="sm" className="h-8 text-[11px]" disabled>
                  <Upload className="w-3 h-3 mr-1" /> Download PDF
                </Button>
              </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-neutral-background/10 overflow-y-auto">
              <div className="w-12 h-12 bg-neutral-background border border-neutral-border rounded-full flex items-center justify-center mb-4">
                <FileText className="w-6 h-6 text-neutral-text-tertiary opacity-20" />
              </div>
              <h4 className="text-neutral-text-primary font-medium mb-1 text-sm">Final report hasn't generated</h4>
              <p className="text-[11px] text-neutral-text-tertiary max-w-[180px]">
                Complete the workflow orchestration to generate the final settlement report.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DocumentRow({ name, size, onDelete }: { name: string, size: string, onDelete: () => void }) {
  return (
    <tr className="hover:bg-neutral-background/20 transition-colors group">
      <td className="px-6 py-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded border border-neutral-border bg-neutral-background flex-shrink-0">
            <FileText className="w-4 h-4 text-brand-primary" />
          </div>
          <span className="text-sm font-medium text-neutral-text-primary truncate max-w-[500px]">
            {name}
          </span>
        </div>
      </td>
      <td className="px-6 py-4">
        <span className="text-xs text-neutral-text-secondary font-mono">{size}</span>
      </td>
      <td className="px-6 py-4 text-right">
        <button
          onClick={onDelete}
          className="p-2 hover:bg-semantic-danger/10 rounded-md transition-colors text-neutral-text-tertiary hover:text-semantic-danger"
          title="Delete document"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: CaseStatus }) {
  const configs = {
    [CaseStatus.RUNNING]: {
      label: 'Ongoing',
      styles: 'bg-brand-primary'
    },
    [CaseStatus.SUBMITTED]: {
      label: 'Ongoing',
      styles: 'bg-brand-primary'
    },
    [CaseStatus.AWAITING_APPROVAL]: {
      label: 'Completed',
      styles: 'bg-semantic-success'
    },
    [CaseStatus.APPROVED]: {
      label: 'Approved',
      styles: 'bg-blue-600'
    },
    [CaseStatus.DECLINED]: {
      label: 'Rejected',
      styles: 'bg-semantic-danger'
    },
    [CaseStatus.ESCALATED]: {
      label: 'Ongoing',
      styles: 'bg-brand-primary'
    },
    [CaseStatus.FAILED]: {
      label: 'Failed',
      styles: 'bg-neutral-text-tertiary'
    }
  };

  const config = configs[status] || configs[CaseStatus.RUNNING];

  return (
    <div 
      className={`relative flex items-center pl-3 pr-6 py-1 text-[11px] font-medium text-black shadow-sm ${config.styles}`}
      style={{
        clipPath: 'polygon(0% 0%, 85% 0%, 100% 50%, 85% 100%, 0% 100%)'
      }}
    >
      <span>{config.label}</span>
    </div>
  );
}
