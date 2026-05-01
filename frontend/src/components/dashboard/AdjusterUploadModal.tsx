'use client';

import React, { useState, useRef } from 'react';
import {
  Upload,
  FileText,
  AlertTriangle,
  X,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/primitives/Button';

interface AdjusterUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (file: File) => Promise<void>;
  /** Optional context about why the adjuster was triggered */
  triggerReason?: string;
}

export function AdjusterUploadModal({
  isOpen,
  onClose,
  onUpload,
  triggerReason,
}: AdjusterUploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = (file: File) => {
    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ];
    if (!allowedTypes.includes(file.type)) {
      setError('Please upload a PDF or Word document.');
      return;
    }
    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      setError('File must be less than 10MB.');
      return;
    }
    setError(null);
    setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setError(null);
    try {
      await onUpload(selectedFile);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to upload adjuster report.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">
                Adjuster Report Required
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                High-value claim — physical inspection needed
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-800 rounded-md transition-colors text-slate-400"
            disabled={uploading}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Reason Banner */}
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-200">
            <p className="font-semibold text-amber-300 mb-1">
              Why is an adjuster needed?
            </p>
            <p>
              {triggerReason ||
                'The verified repair cost exceeds 40% of the policy cap (sum insured). Per Malaysian insurance guidelines, a physical adjuster inspection is required before approval.'}
            </p>
          </div>

          {/* Upload Area */}
          <div
            className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
              dragOver
                ? 'border-indigo-400 bg-indigo-500/10'
                : selectedFile
                ? 'border-emerald-500/50 bg-emerald-500/5'
                : 'border-slate-700 hover:border-slate-600 bg-slate-950/50'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
              }}
            />

            {selectedFile ? (
              <div className="flex flex-col items-center gap-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                <p className="text-sm font-medium text-slate-200">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-slate-500">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB — Click to
                  change
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-slate-500" />
                <p className="text-sm text-slate-300">
                  Drag & drop your adjuster report here
                </p>
                <p className="text-xs text-slate-500">or click to browse</p>
                <div className="flex items-center gap-2 mt-2">
                  <FileText className="w-3.5 h-3.5 text-slate-600" />
                  <span className="text-xs text-slate-600">
                    PDF, DOC, or DOCX — Max 10MB
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex justify-end gap-3">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={uploading}
            className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedFile || uploading}
            className="bg-amber-600 hover:bg-amber-700 text-white border-none shadow-lg shadow-amber-500/20 disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Upload & Resume
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
