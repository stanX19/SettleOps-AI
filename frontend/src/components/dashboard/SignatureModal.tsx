"use client";

import React, { useState, useEffect } from "react";
import { 
  X, 
  PenTool, 
  User, 
  Briefcase, 
  Calendar,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  FileText,
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

type Step = "preview_draft" | "sign_details" | "review_signed" | "success";

export function SignatureModal({ isOpen, onClose, caseId, onSuccess }: SignatureModalProps) {
  const [step, setStep] = useState<Step>("preview_draft");
  const [signerName, setSignerName] = useState("Senior Claims Adjuster");
  const [designation, setDesignation] = useState("Claims Management Department");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pdfRefreshKey, setPdfRefreshKey] = useState(0);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const artifacts = useCaseStore(state => state.artifacts);
  const decisionPdf = artifacts.find(a => a.artifact_type === ArtifactType.DECISION_PDF && !a.superseded);
  
  const payoutBreakdown = useCaseStore(state => state.blackboard[BlackboardSection.PAYOUT_RECOMMENDATION]?.payout_breakdown);
  const finalPayout = payoutBreakdown?.final_payout_myr || 0;

  // Reset step when modal opens and trigger preview generation if needed
  useEffect(() => {
    if (isOpen) {
      setStep("preview_draft");
      ensurePreview();
    }
  }, [isOpen]);

  const ensurePreview = async () => {
    if (decisionPdf) return;
    setIsPreviewLoading(true);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/v1/signature/${caseId}/preview`);
    } catch (error) {
      console.error("Failed to ensure preview:", error);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleSign = async () => {
    setIsSubmitting(true);
    try {
      await api.approveWithSignature(caseId, {
        signer_name: signerName,
        designation: designation,
        sign_date: new Date().toLocaleDateString('en-MY', { day: '2-digit', month: 'long', year: 'numeric' })
      });
      
      setPdfRefreshKey(prev => prev + 1);
      setStep("review_signed");
    } catch (error) {
      console.error("Failed to sign:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinalApprove = async () => {
    setIsSubmitting(true);
    try {
      await api.approveCase(caseId);
      setStep("success");
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    } catch (error) {
      console.error("Failed to approve case:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const pdfUrl = decisionPdf 
    ? `${process.env.NEXT_PUBLIC_API_URL || ""}${decisionPdf.url}?t=${pdfRefreshKey}` 
    : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 fade-in duration-300">
      <div className="bg-neutral-surface border border-neutral-border rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col h-[90vh] max-h-[900px]">
        {/* Header */}
        <div className="p-4 border-b border-neutral-border flex items-center justify-between bg-neutral-background/30 flex-shrink-0">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 text-brand-primary" />
            <h2 className="text-sm font-bold text-neutral-text-primary uppercase tracking-wider">
              Settlement Approval Wizard
            </h2>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-1">
               {[1, 2, 3].map((s) => (
                 <div 
                   key={s} 
                   className={`w-2 h-2 rounded-full ${
                     (s === 1 && step === "preview_draft") ||
                     (s === 2 && step === "sign_details") ||
                     (s === 3 && step === "review_signed") ||
                     (step === "success")
                      ? "bg-brand-primary" : "bg-neutral-border"
                   }`}
                 />
               ))}
            </div>
            <button onClick={onClose} className="p-1 hover:bg-neutral-border rounded-md transition-colors">
              <X className="w-4 h-4 text-neutral-text-tertiary" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col bg-neutral-background w-full">
          {step === "preview_draft" && (
            <div className="flex-1 flex flex-col overflow-hidden w-full">
              <div className="p-4 bg-brand-primary/5 border-b border-brand-primary/10">
                <h3 className="text-sm font-bold text-neutral-text-primary flex items-center gap-2">
                  <FileText className="w-4 h-4 text-brand-primary" />
                  Step 1: Review Draft Settlement
                </h3>
                <p className="text-[11px] text-neutral-text-tertiary mt-1">
                  Please verify all repair costs and policy deductions before proceeding to signature.
                </p>
              </div>
              <div className="flex-1 relative bg-neutral-background/50 w-full">
                {pdfUrl ? (
                  <iframe src={pdfUrl} className="w-full h-full border-none" />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4">
                    <Loader2 className="w-8 h-8 text-brand-primary animate-spin" />
                    <p className="text-sm text-neutral-text-tertiary animate-pulse font-medium">
                      {isPreviewLoading ? "Assembling draft report..." : "Waiting for document artifacts..."}
                    </p>
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-neutral-border bg-neutral-background flex justify-between items-center flex-shrink-0">
                <div className="px-3 py-1.5 bg-neutral-background/80 border border-neutral-border rounded-md">
                  <span className="text-[10px] font-bold text-neutral-text-tertiary uppercase tracking-widest block mb-0.5">Approved Payout</span>
                  <span className="text-sm font-bold text-brand-primary">RM {finalPayout.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <Button onClick={() => setStep("sign_details")} className="bg-brand-primary text-black hover:bg-brand-primary-hover px-8">
                  Proceed to Sign <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {step === "sign_details" && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto w-full">
              <div className="w-full max-w-[500px] space-y-8 py-12 flex flex-col">
                <div className="text-center space-y-3">
                  <div className="w-16 h-16 bg-brand-primary/10 rounded-2xl flex items-center justify-center mx-auto">
                    <PenTool className="w-8 h-8 text-brand-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-neutral-text-primary">Step 2: Digital Signature</h3>
                    <p className="text-sm text-neutral-text-tertiary mt-1">
                      Provide authority details for the official stamp.
                    </p>
                  </div>
                </div>

                <div className="space-y-5 bg-neutral-surface border border-neutral-border p-8 rounded-2xl shadow-sm w-full">
                  <div className="space-y-2 w-full">
                    <label className="text-[10px] font-bold text-neutral-text-tertiary uppercase tracking-wider flex items-center px-1">
                      <User className="w-3 h-3 mr-2 text-brand-primary" /> Full Name
                    </label>
                    <input
                      type="text"
                      value={signerName}
                      onChange={(e) => setSignerName(e.target.value)}
                      className="w-full bg-neutral-background border border-neutral-border rounded-xl px-4 py-3 text-sm text-neutral-text-primary focus:outline-none focus:border-brand-primary transition-all"
                      placeholder="e.g. John Doe"
                      style={{ width: '100%', minWidth: '100%' }}
                    />
                  </div>

                  <div className="space-y-2 w-full">
                    <label className="text-[10px] font-bold text-neutral-text-tertiary uppercase tracking-wider flex items-center px-1">
                      <Briefcase className="w-3 h-3 mr-2 text-brand-primary" /> Designation / Dept.
                    </label>
                    <input
                      type="text"
                      value={designation}
                      onChange={(e) => setDesignation(e.target.value)}
                      className="w-full bg-neutral-background border border-neutral-border rounded-xl px-4 py-3 text-sm text-neutral-text-primary focus:outline-none focus:border-brand-primary transition-all"
                      placeholder="e.g. Claims Manager"
                      style={{ width: '100%', minWidth: '100%' }}
                    />
                  </div>

                  <div className="space-y-2 w-full">
                    <label className="text-[10px] font-bold text-neutral-text-tertiary uppercase tracking-wider flex items-center px-1">
                      <Calendar className="w-3 h-3 mr-2 text-neutral-text-tertiary" /> Effective Date
                    </label>
                    <div className="w-full bg-neutral-background/40 border border-neutral-border rounded-xl px-4 py-3 text-sm text-neutral-text-tertiary flex items-center justify-between">
                      <span>{new Date().toLocaleDateString('en-MY', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                      <ShieldCheck className="w-4 h-4 text-semantic-success" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 w-full">
                  <Button variant="outline" onClick={() => setStep("preview_draft")} className="py-6 rounded-xl border-neutral-border">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                  </Button>
                  <Button 
                    onClick={handleSign} 
                    disabled={isSubmitting}
                    className="py-6 rounded-xl bg-brand-primary text-black hover:bg-brand-primary-hover shadow-lg shadow-brand-primary/20"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Stamp className="w-5 h-5 mr-2" />
                        Apply Signature
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {step === "review_signed" && (
            <div className="flex-1 flex flex-col overflow-hidden w-full">
              <div className="p-4 bg-semantic-success/5 border-b border-semantic-success/10">
                <h3 className="text-sm font-bold text-neutral-text-primary flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-semantic-success" />
                  Step 3: Final Review (Signed)
                </h3>
                <p className="text-[11px] text-neutral-text-tertiary mt-1">
                  The document has been digitally signed and stamped. Please verify the overlay placement.
                </p>
              </div>
              <div className="flex-1 relative bg-neutral-background/50 w-full">
                {pdfUrl ? (
                  <iframe src={pdfUrl} className="w-full h-full border-none" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-neutral-text-tertiary italic text-sm">
                    Loading signed document...
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-neutral-border bg-neutral-background flex justify-between items-center flex-shrink-0">
                <Button variant="outline" onClick={() => setStep("sign_details")} className="border-neutral-border">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Change Details
                </Button>
                <Button 
                  onClick={handleFinalApprove} 
                  disabled={isSubmitting}
                  className="bg-semantic-success text-white hover:bg-semantic-success/90 px-12 shadow-lg shadow-semantic-success/20"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                  Confirm & Approve Case
                </Button>
              </div>
            </div>
          )}

          {step === "success" && (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-8 bg-neutral-surface w-full">
              <div className="relative">
                <div className="absolute inset-0 bg-semantic-success/20 rounded-full blur-2xl animate-pulse" />
                <div className="relative w-24 h-24 bg-semantic-success/20 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-12 h-12 text-semantic-success" />
                </div>
              </div>
              <div className="space-y-3 max-w-sm">
                <h3 className="text-3xl font-bold text-neutral-text-primary tracking-tight">Settlement Finalized</h3>
                <p className="text-neutral-text-tertiary leading-relaxed">
                  The claim has been successfully approved. The signed letter of undertaking is now available in the archives.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
