"use client";

import React, { use, useState, useRef, useEffect } from "react";
import {
  FileText,
  Upload,
  ChevronLeft,
  Play,
  Trash2,
  AlertCircle,
  Loader2,
  Image as ImageIcon
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/primitives/Button";
import { Toast } from "@/components/primitives/Toast";
import { CaseStatus } from "@/lib/types";
import { api } from "@/lib/api";

interface PageProps {
  params: Promise<{ caseId: string }>;
}

interface UploadedFile {
  id: string;
  name: string;
  size: string;
  date: string;
  file?: File;
  isRemote?: boolean;
  tags?: string[];
  url?: string;
}

const EXT_COLORS: Record<string, { bg: string; text: string }> = {
  pdf: { bg: "bg-red-500/10", text: "text-red-500" },
  jpg: { bg: "bg-blue-500/10", text: "text-blue-400" },
  jpeg: { bg: "bg-blue-500/10", text: "text-blue-400" },
  png: { bg: "bg-blue-500/10", text: "text-blue-400" },
  webp: { bg: "bg-blue-500/10", text: "text-blue-400" },
};

function getExt(filename: string) {
  return filename.split(".").pop()?.toLowerCase() || "file";
}

function formatFileSize(size: number): string {
  if (!size || size <= 0) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ManageCasePage({ params }: PageProps) {
  const { caseId } = use(params);
  const router = useRouter();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [status, setStatus] = useState<CaseStatus>(CaseStatus.DRAFT);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: "", visible: false });

  const showToast = (message: string) => {
    setToast({ message, visible: true });
  };

  // Fetch actual status and remote file sizes on mount
  useEffect(() => {
    const fetchSnapshot = async () => {
      try {
        const snap = await api.getCaseSnapshot(caseId);
        setSnapshot(snap);
        setStatus(snap.status);

        if (snap.documents?.length > 0) {
          const existingFiles: UploadedFile[] = snap.documents.map((doc: any, i: number) => ({
            id: `remote-${i}`,
            name: doc.filename,
            size: "...", // Loading state
            date: "",
            isRemote: true,
            tags: doc.tags || (doc.doc_type ? [doc.doc_type] : []),
            url: doc.url // Store URL to fetch size
          }));

          setFiles(prev => {
            const localOnly = prev.filter(f => !f.isRemote);
            return [...existingFiles, ...localOnly];
          });

          // Fetch sizes in background using Range header to get full size metadata without downloading
          existingFiles.forEach(async (f, idx) => {
            const url = snap.documents[idx].url;
            if (!url) return;
            try {
              // Try getting the full size via Range request which is often more reliable than HEAD
              const resp = await fetch(url, { headers: { 'Range': 'bytes=0-0' } });

              // For a range request, Content-Range looks like "bytes 0-0/12345"
              const contentRange = resp.headers.get('content-range');
              let sizeInBytes = 0;

              if (contentRange) {
                const total = contentRange.split('/')[1];
                if (total) sizeInBytes = parseInt(total, 10);
              } else {
                // Fallback to Content-Length if Range is not supported or it returned 200 instead of 206
                const cl = resp.headers.get('content-length');
                if (cl) sizeInBytes = parseInt(cl, 10);
              }

              if (sizeInBytes > 0) {
                const sizeStr = formatFileSize(sizeInBytes);
                setFiles(current =>
                  current.map(item => item.id === f.id ? { ...item, size: sizeStr } : item)
                );
              } else {
                setFiles(current =>
                  current.map(item => item.id === f.id ? { ...item, size: "—" } : item)
                );
              }
            } catch (e) {
              console.error("Failed to fetch size for", f.name, e);
              setFiles(current =>
                current.map(item => item.id === f.id ? { ...item, size: "—" } : item)
              );
            }
          });
        }
      } catch (err) {
        console.error("Failed to fetch case snapshot:", err);
      }
    };
    fetchSnapshot();
  }, [caseId]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;

    const newFiles: UploadedFile[] = Array.from(fileList).map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      size: formatFileSize(file.size),
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      file: file
    }));

    setFiles(prev => [...prev, ...newFiles]);
    setError(null);
    showToast(`Successfully uploaded ${newFiles.length} document${newFiles.length > 1 ? 's' : ''}`);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (id: string) => {
    const fileToRemove = files.find(f => f.id === id);
    setFiles(prev => prev.filter(f => f.id !== id));
    if (fileToRemove) {
      showToast(`Deleted ${fileToRemove.name}`);
    }
  };

  const handleStartWorkflow = async () => {
    if (status !== CaseStatus.DRAFT) {
      setError("This case has already been started.");
      return;
    }
    const localFiles = files.filter(f => !f.isRemote && f.file);
    if (localFiles.length === 0) {
      setError("Please upload evidence documents first.");
      return;
    }

    setIsStarting(true);
    setError(null);

    try {
      const documentFiles = localFiles.map(f => f.file!);
      await api.submitDocuments(caseId, documentFiles);
      showToast("Redirecting to workflow view");
      setTimeout(() => router.push(`/workflow/${caseId}`), 900);
    } catch (err: any) {
      console.error("Failed to start workflow:", err);
      setError(err.message || "An unexpected error occurred while starting the workflow.");
      setIsStarting(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-neutral-background p-8 overflow-hidden">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".pdf,image/*"
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
              <span className="text-xs font-mono text-neutral-800 dark:text-brand-primary bg-black/5 dark:bg-brand-primary/10 border border-black/10 dark:border-transparent px-2 py-0.5 rounded uppercase font-medium">{caseId}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {status === CaseStatus.DRAFT && (
            <Button
              onClick={handleStartWorkflow}
              disabled={isStarting || files.filter(f => !f.isRemote && f.file).length === 0}
              variant="outline"
              className="flex items-center space-x-2 bg-neutral-surface border-neutral-border text-neutral-text-primary hover:bg-neutral-background transition-all disabled:opacity-50"
            >
              {isStarting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
              <span>{isStarting ? "Initializing..." : "Start Workflow"}</span>
            </Button>
          )}
          <Button onClick={handleUploadClick} className="flex items-center space-x-2">
            <Upload className="w-4 h-4" />
            <span>Upload New Evidence</span>
          </Button>
        </div>
      </div>

      {/* Error Message Display */}
      {error && (
        <div className="mb-6 p-4 bg-semantic-danger/10 border border-semantic-danger/20 rounded-lg flex items-center space-x-3 text-semantic-danger animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {/* Grid Layout - Filling remaining height */}
      <div className="grid grid-cols-12 gap-8 flex-1 min-h-0">

        {/* Left Column: Evidence Hub */}
        <div className="col-span-12 lg:col-span-8 flex flex-col min-h-0">

          {/* Document Management Hub */}
          <div className="bg-neutral-surface border border-neutral-border rounded-lg shadow-sm flex flex-col h-full overflow-hidden">
            <div className="h-[60px] p-4 border-b border-neutral-border flex items-center justify-between flex-shrink-0 bg-neutral-background/30">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-brand-primary" />
                <h2 className="text-sm font-semibold text-neutral-text-primary">Document Evidence Slots</h2>
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
                      <th className="px-6 py-3 text-xs font-semibold text-neutral-text-tertiary uppercase tracking-wider w-[45%]">Document Name</th>
                      <th className="px-6 py-3 text-xs font-semibold text-neutral-text-tertiary uppercase tracking-wider">Size</th>
                      <th className="px-6 py-3 text-xs font-semibold text-neutral-text-tertiary uppercase tracking-wider">Tag</th>
                      <th className="px-6 py-3 text-xs font-semibold text-neutral-text-tertiary uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-border">
                    {files.map(file => (
                      <DocumentRow
                        key={file.id}
                        name={file.name}
                        size={file.size}
                        tags={file.tags || []}
                        isRemote={file.isRemote}
                        onDelete={() => removeFile(file.id)}
                      />
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center h-full">
                  <Upload className="w-8 h-8 text-neutral-text-tertiary opacity-60 mb-4" />
                  <h4 className="text-neutral-text-primary font-medium mb-1">No evidence uploaded yet</h4>
                  <p className="text-xs text-neutral-text-tertiary max-w-[480px]">
                    Upload relevant PDF documents or images (Police Report, Policy, Quote) to begin the settlement orchestration.
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
            <div className="h-[60px] px-4 py-4 border-b border-neutral-border flex items-center justify-between bg-neutral-background/30 flex-shrink-0">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-brand-primary" />
                <h3 className="text-sm font-semibold text-neutral-text-primary">Final Report Preview</h3>
              </div>
              <div className="flex items-center space-x-2">
                {(() => {
                  const apiBase = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
                  const artifact = snapshot?.artifacts?.find((a: any) => a.artifact_type === 'decision_pdf_signed' && !a.superseded)
                    || snapshot?.artifacts?.find((a: any) => a.artifact_type === 'decision_pdf' && !a.superseded);

                  if (!artifact) return null;

                  return (
                    <a
                      href={`${apiBase}${artifact.url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="ghost" size="sm" className="h-8 text-[11px] text-brand-primary hover:text-brand-primary/80">
                        <Upload className="w-3 h-3 mr-1 rotate-180" /> Download PDF
                      </Button>
                    </a>
                  );
                })()}
              </div>
            </div>

            {(() => {
              const apiBase = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
              // Prefer the signed artifact if it exists (case approved with signature),
              // otherwise fall back to the unsigned draft.
              const pdfArtifact = snapshot?.artifacts?.find((a: any) => a.artifact_type === 'decision_pdf_signed' && !a.superseded)
                || snapshot?.artifacts?.find((a: any) => a.artifact_type === 'decision_pdf' && !a.superseded);

              if (pdfArtifact) {
                return (
                  <div className="flex-1 w-full h-full bg-neutral-background overflow-hidden relative">
                    <iframe
                      src={`${apiBase}${pdfArtifact.url}`}
                      className="border-none absolute inset-0"
                      style={{ width: "calc(100% + 18px)", height: "calc(100% + 18px)" }}
                      title="Settlement Report Preview"
                    />
                  </div>
                );
              }

              return (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-neutral-background/10 overflow-y-auto">
                  <FileText className="w-8 h-8 text-neutral-text-tertiary opacity-60 mb-4" />
                  <h4 className="text-neutral-text-primary font-medium mb-1">Final report hasn't generated</h4>
                  <p className="text-xs text-neutral-text-tertiary max-w-[320px]">
                    Complete the workflow orchestration to generate the final settlement report.
                  </p>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
      <Toast
        message={toast.message}
        isVisible={toast.visible}
        onClose={() => setToast(prev => ({ ...prev, visible: false }))}
      />
    </div>
  );
}

function DocumentRow({ name, size, tags, isRemote, onDelete }: { name: string, size: string, tags: string[], isRemote?: boolean, onDelete: () => void }) {
  const ext = getExt(name);
  const colors = EXT_COLORS[ext] || { bg: "bg-neutral-border/20", text: "text-neutral-text-tertiary" };
  const validTags = tags.filter(t => t && t !== "unknown");

  return (
    <tr className="hover:bg-neutral-background/20 transition-colors group">
      <td className="px-6 py-3">
        <div className="flex items-center space-x-3">
          {/* Square File Icon Container */}
          <div className={`w-8 h-8 shrink-0 bg-neutral-background border border-neutral-border/50 rounded-lg flex items-center justify-center shadow-sm`}>
            {ext === 'pdf' ? (
              <FileText className="w-4 h-4 text-red-500" />
            ) : (
              <ImageIcon className="w-4 h-4 text-blue-500" />
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-neutral-text-primary truncate max-w-[350px]">
              {name}
            </span>
          </div>
        </div>
      </td>
      <td className="px-6 py-3">
        <span className="text-xs text-neutral-text-secondary font-mono whitespace-nowrap">{size}</span>
      </td>
      <td className="px-6 py-3">
        {validTags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {validTags.map(tag => (
              <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                {tag.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-neutral-text-tertiary">—</span>
        )}
      </td>
      <td className="px-6 py-3 text-right">
        <button
          onClick={onDelete}
          className="relative group/tip p-2 hover:bg-semantic-danger/10 rounded-md transition-colors text-neutral-text-tertiary hover:text-semantic-danger"
          aria-label="Delete document"
        >
          <Trash2 className="w-4 h-4" />
          <div className="absolute bottom-full mb-1.5 right-0 px-2 py-1 bg-neutral-surface text-neutral-text-primary text-xs rounded shadow-card pointer-events-none opacity-0 group-hover/tip:opacity-100 transition-opacity z-50 border border-neutral-border whitespace-nowrap">
            Delete document
          </div>
        </button>
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: CaseStatus }) {
  const configs: Record<CaseStatus, { label: string; styles: string }> = {
    [CaseStatus.RUNNING]: {
      label: 'Ongoing',
      styles: 'bg-brand-primary'
    },
    [CaseStatus.SUBMITTED]: {
      label: 'Ongoing',
      styles: 'bg-brand-primary'
    },
    [CaseStatus.AWAITING_APPROVAL]: {
      label: 'Pending Review',
      styles: 'bg-semantic-warning'
    },
    [CaseStatus.AWAITING_ADJUSTER]: {
      label: 'Awaiting Adjuster',
      styles: 'bg-semantic-warning'
    },
    [CaseStatus.APPROVED]: {
      label: 'Approved',
      styles: 'bg-semantic-success'
    },
    [CaseStatus.DECLINED]: {
      label: 'Rejected',
      styles: 'bg-semantic-danger'
    },
    [CaseStatus.ESCALATED]: {
      label: 'Ongoing',
      styles: 'bg-brand-primary'
    },
    [CaseStatus.AWAITING_DOCS]: {
      label: 'Missing Docs',
      styles: 'bg-semantic-warning'
    },
    [CaseStatus.DRAFT]: {
      label: 'Draft',
      styles: 'bg-neutral-surface border border-neutral-border text-neutral-text-secondary'
    },
    [CaseStatus.FAILED]: {
      label: 'Failed',
      styles: 'bg-neutral-text-tertiary'
    }
  };

  const config = configs[status];

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
