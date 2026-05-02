"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  User,
  Briefcase,
  Calendar,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Stamp
} from "lucide-react";
import { Button } from "@/components/primitives/Button";
import { api } from "@/lib/api";
import { BlackboardSection, ArtifactType } from "@/lib/types";
import { useCaseStore } from "@/stores/case-store";

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  onSuccess: () => void;
}

type Step = "preview_draft" | "sign_details" | "review_signed";

export function SignatureModal({ isOpen, onClose, caseId, onSuccess }: SignatureModalProps) {
  const [step, setStep] = useState<Step>("preview_draft");
  const [signerName, setSignerName] = useState("");
  const [designation, setDesignation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pdfRefreshKey, setPdfRefreshKey] = useState(0);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [signedPdfBlobUrl, setSignedPdfBlobUrl] = useState<string | null>(null);
  const [isSigningPreview, setIsSigningPreview] = useState(false);
  const [isApproved, setIsApproved] = useState(false);

  const artifacts = useCaseStore(state => state.artifacts);
  const setCase = useCaseStore(state => state.setCase);
  const decisionPdf = artifacts.find(a => a.artifact_type === ArtifactType.DECISION_PDF && !a.superseded);

  const payoutBreakdown = useCaseStore(state => state.blackboard[BlackboardSection.PAYOUT_RECOMMENDATION]?.payout_breakdown);
  const finalPayout = payoutBreakdown?.final_payout_myr || 0;

  // Reset step when modal opens and trigger preview generation if needed
  useEffect(() => {
    if (isOpen) {
      setStep("preview_draft");
      setPdfBlobUrl(null);
      setSignedPdfBlobUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPdfRefreshKey(prev => prev + 1);
      setIsApproved(false);
      ensurePreview();
    }
  }, [isOpen]);

  const ensurePreview = async () => {
    setIsPreviewLoading(true);
    const apiBase = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
    try {
      await fetch(`${apiBase}/api/v1/signature/${caseId}/preview`);
      const snapshot = await api.getCaseSnapshot(caseId);
      setCase(snapshot);
      setPdfRefreshKey(prev => prev + 1);
    } catch (error) {
      console.error("Failed to ensure preview:", error);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const pdfUrl = decisionPdf
    ? `${(process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "")}${decisionPdf.url}?t=${pdfRefreshKey}`
    : null;

  useEffect(() => {
    if (!pdfUrl) {
      setPdfBlobUrl(null);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    fetch(pdfUrl)
      .then(r => r.blob())
      .then(blob => {
        if (cancelled) return;
        const pdfBlob = blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" });
        createdUrl = URL.createObjectURL(pdfBlob);
        setPdfBlobUrl(createdUrl);
      })
      .catch(err => console.error("Failed to load PDF:", err));
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [pdfUrl]);

  const stepTitle = isApproved
    ? "Settlement Finalized — Signed Report"
    : ({
        preview_draft: "Step 1: Review Draft Settlement",
        sign_details: "Step 2: Digital Signature",
        review_signed: "Step 3: Final Review (Signed)",
      } as const)[step];

  if (!isOpen) return null;

  // Step 2 → Step 3 transition.
  //
  // We render the signed PDF on the fly via the preview-signed endpoint, which
  // returns binary PDF bytes WITHOUT persisting any artifact and WITHOUT
  // emitting SSE. This is what lets the operator visually verify the signed
  // letter while keeping Manage Hub / Blackboard pointed at the unsigned
  // draft. The signed copy is only persisted when the operator clicks
  // "Confirm & Approve Case" in Step 3 (handleFinalApprove).
  const handleSign = async () => {
    if (!signerName.trim() || !designation.trim() || isSigningPreview) return;
    setIsSigningPreview(true);
    try {
      const blob = await api.previewSignedPdf(caseId, {
        signer_name: signerName,
        designation: designation,
        sign_date: new Date().toLocaleDateString('en-MY', { day: '2-digit', month: 'long', year: 'numeric' }),
      });
      const pdfBlob = blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" });
      const objectUrl = URL.createObjectURL(pdfBlob);
      setSignedPdfBlobUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return objectUrl;
      });
      setStep("review_signed");
    } catch (err) {
      console.error("Failed to render signed preview:", err);
    } finally {
      setIsSigningPreview(false);
    }
  };

  const handleClose = () => {
    setSignedPdfBlobUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    onClose();
  };

  const handleFinalApprove = async () => {
    setIsSubmitting(true);
    try {
      // Persist the signed PDF as a SEPARATE artifact (the backend appends a
      // new decision_pdf_signed record without superseding the unsigned draft),
      // then transition the case to approved. Modal stays open on the signed
      // preview until the operator dismisses it; success is surfaced via Toast
      // by the parent.
      await api.approveWithSignature(caseId, {
        signer_name: signerName,
        designation: designation,
        sign_date: new Date().toLocaleDateString('en-MY', { day: '2-digit', month: 'long', year: 'numeric' })
      });
      await api.approveCase(caseId);
      setPdfRefreshKey(prev => prev + 1);
      setIsApproved(true);
      onSuccess();
    } catch (error) {
      console.error("Failed to approve case:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 fade-in duration-300">
      <div className="bg-neutral-surface border border-neutral-border rounded-lg shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col h-[90vh] max-h-[900px]">
        {/* Header */}
        <div className="p-4 border-b border-neutral-border flex items-center justify-between bg-neutral-background/30 flex-shrink-0">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 text-brand-primary" />
            <h2 className="text-base font-bold text-neutral-text-primary tracking-wide">
              {stepTitle}
            </h2>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-1">
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={`w-2 h-2 rounded-full ${isApproved ||
                    (s === 1 && step === "preview_draft") ||
                    (s === 2 && step === "sign_details") ||
                    (s === 3 && step === "review_signed")
                    ? "bg-brand-primary" : "bg-neutral-border"
                    }`}
                />
              ))}
            </div>
            <button onClick={handleClose} className="p-1 hover:bg-neutral-border rounded-md transition-colors">
              <X className="w-4 h-4 text-neutral-text-tertiary" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col bg-neutral-background w-full">
          {step === "preview_draft" && (
            <div className="flex-1 flex flex-col overflow-hidden w-full">
              <div className="flex-1 relative bg-neutral-background/50 w-full">
                {pdfBlobUrl ? (
                  <iframe src={pdfBlobUrl} className="w-full h-full border-none" />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4">
                    <Loader2 className="w-8 h-8 text-brand-primary animate-spin" />
                    <p className="text-sm text-neutral-text-tertiary animate-pulse font-medium">
                      {isPreviewLoading || pdfUrl ? "Assembling draft report..." : "Waiting for document artifacts..."}
                    </p>
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-neutral-border bg-white flex justify-between items-center flex-shrink-0">
                <div className="h-10 px-3 bg-neutral-background/80 border border-neutral-border rounded-md flex flex-col justify-center">
                  <span className="text-[9px] font-bold text-black uppercase tracking-widest leading-none">Approved Payout</span>
                  <span className="text-sm font-bold text-yellow-500 leading-none mt-1">RM {finalPayout.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <Button onClick={() => setStep("sign_details")} className="h-10 bg-brand-primary text-black hover:bg-brand-primary-hover px-5 font-semibold">
                  Proceed to Sign <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {step === "sign_details" && (
            <div className="flex-1 flex flex-col w-full">
              <div className="flex-1 flex flex-col items-center justify-center px-8 py-6 overflow-y-auto w-full">
                <div className="w-full max-w-[460px] space-y-6 flex flex-col">
                  <div className="text-center space-y-3">
                    <img src="/signature.png" alt="Signature" className="w-26 h-26 mx-auto object-contain -translate-y-4" />
                    <p className="text-sm text-neutral-text-secondary">
                      Provide authority details for the official stamp.
                    </p>
                  </div>

                  <div className="space-y-4 bg-neutral-surface border border-neutral-border p-5 rounded-lg shadow-sm w-full">
                    <div className="space-y-1.5 w-full">
                      <label className="text-[10px] font-bold text-neutral-text-tertiary uppercase tracking-wider flex items-center">
                        <User className="w-3 h-3 mr-1.5 text-brand-primary" /> Full Name
                      </label>
                      <input
                        type="text"
                        value={signerName}
                        onChange={(e) => setSignerName(e.target.value)}
                        className="w-full bg-neutral-background border border-neutral-border rounded-md px-3 py-2 text-sm text-neutral-text-primary focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/20 transition-all"
                        placeholder="e.g. John Doe"
                      />
                    </div>

                    <div className="space-y-1.5 w-full">
                      <label className="text-[10px] font-bold text-neutral-text-tertiary uppercase tracking-wider flex items-center">
                        <Briefcase className="w-3 h-3 mr-1.5 text-brand-primary" /> Designation / Dept.
                      </label>
                      <input
                        type="text"
                        value={designation}
                        onChange={(e) => setDesignation(e.target.value)}
                        className="w-full bg-neutral-background border border-neutral-border rounded-md px-3 py-2 text-sm text-neutral-text-primary focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/20 transition-all"
                        placeholder="e.g. Claims Manager"
                      />
                    </div>

                    <div className="space-y-1.5 w-full">
                      <label className="text-[10px] font-bold text-neutral-text-tertiary uppercase tracking-wider flex items-center">
                        <Calendar className="w-3 h-3 mr-1.5 text-brand-primary" /> Effective Date
                      </label>
                      <div className="w-full bg-neutral-background/60 border border-neutral-border rounded-md px-3 py-2 text-sm text-neutral-text-secondary flex items-center justify-between">
                        <span>{new Date().toLocaleDateString('en-MY', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                        <ShieldCheck className="w-4 h-4 text-semantic-success" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-4 border-t border-neutral-border bg-white flex justify-between items-center flex-shrink-0">
                <Button variant="outline" onClick={() => setStep("preview_draft")} className="h-10 border-neutral-border px-5">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                <Button
                  onClick={handleSign}
                  disabled={isSubmitting || isSigningPreview || !signerName.trim() || !designation.trim()}
                  className="h-10 bg-brand-primary text-black hover:bg-brand-primary-hover px-5 font-semibold"
                >
                  {isSigningPreview ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Stamp className="w-4 h-4 mr-2" />
                      Apply Signature
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {step === "review_signed" && (
            <div className="flex-1 flex flex-col overflow-hidden w-full">
              <div className={`px-4 py-2.5 border-b border-neutral-border flex items-center gap-2 flex-shrink-0 ${isApproved ? "bg-semantic-success/5" : "bg-brand-primary/5"}`}>
                {isApproved ? (
                  <CheckCircle2 className="w-4 h-4 text-semantic-success flex-shrink-0" />
                ) : (
                  <Stamp className="w-4 h-4 text-brand-primary flex-shrink-0" />
                )}
                <p className="text-xs text-neutral-text-secondary">
                  {isApproved ? (
                    <>
                      Approved & signed by <span className="font-semibold text-neutral-text-primary">{signerName}</span> ({designation}). The signed letter of undertaking is now archived.
                    </>
                  ) : (
                    <>
                      Preview signed by <span className="font-semibold text-neutral-text-primary">{signerName}</span> ({designation}). The signed copy is saved to artifacts only when you confirm.
                    </>
                  )}
                </p>
              </div>
              <div className="flex-1 relative bg-neutral-background/50 w-full">
                {signedPdfBlobUrl ? (
                  <iframe src={signedPdfBlobUrl} className="w-full h-full border-none" />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4">
                    <Loader2 className="w-8 h-8 text-brand-primary animate-spin" />
                    <p className="text-sm text-neutral-text-tertiary animate-pulse font-medium">
                      Rendering signed preview…
                    </p>
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-neutral-border bg-white flex justify-between items-center flex-shrink-0">
                {isApproved ? (
                  <>
                    <div className="flex items-center gap-2 text-xs text-semantic-success font-semibold">
                      <CheckCircle2 className="w-4 h-4" />
                      Settlement finalized
                    </div>
                    <Button
                      onClick={handleClose}
                      className="h-10 bg-semantic-success text-white hover:bg-semantic-success/90 px-5 font-semibold shadow-lg shadow-semantic-success/20"
                    >
                      Close
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSignedPdfBlobUrl(prev => {
                          if (prev) URL.revokeObjectURL(prev);
                          return null;
                        });
                        setStep("sign_details");
                      }}
                      className="border-neutral-border"
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" /> Change Details
                    </Button>
                    <Button
                      onClick={handleFinalApprove}
                      disabled={isSubmitting}
                      className="h-10 bg-semantic-success text-white hover:bg-semantic-success/90 px-5 font-semibold shadow-lg shadow-semantic-success/20"
                    >
                      {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                      Confirm & Approve Case
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
