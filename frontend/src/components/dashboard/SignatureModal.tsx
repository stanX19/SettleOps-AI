"use client";

import React, { useState } from "react";
import { 
  X, 
  PenTool, 
  User, 
  Briefcase, 
  Calendar,
  CheckCircle2,
  Loader2,
  ShieldCheck
} from "lucide-react";
import { Button } from "@/components/primitives/Button";
import { api } from "@/lib/api";
import { BlackboardSection } from "@/lib/types";
import { useCaseStore } from "@/stores/case-store";

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  onSuccess: () => void;
}

export function SignatureModal({ isOpen, onClose, caseId, onSuccess }: SignatureModalProps) {
  const [signerName, setSignerName] = useState("Senior Claims Adjuster");
  const [designation, setDesignation] = useState("Claims Management Department");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const payoutBreakdown = useCaseStore(state => state.blackboard[BlackboardSection.PAYOUT_RECOMMENDATION]?.payout_breakdown);
  const finalPayout = payoutBreakdown?.final_payout_myr || 0;

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      // 1. Sign the PDF
      await api.approveWithSignature(caseId, {
        signer_name: signerName,
        designation: designation,
        sign_date: new Date().toISOString().split('T')[0]
      });
      
      // 2. Actually approve the case in the workflow
      await api.approveCase(caseId);
      
      setIsSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    } catch (error) {
      console.error("Failed to sign and approve:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className="bg-neutral-surface border border-neutral-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-4 border-b border-neutral-border flex items-center justify-between bg-neutral-background/30">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 text-brand-primary" />
            <h2 className="text-sm font-bold text-neutral-text-primary uppercase tracking-wider">Final Approval & Signature</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-neutral-border rounded-md transition-colors">
            <X className="w-4 h-4 text-neutral-text-tertiary" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {isSuccess ? (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-4 animate-in zoom-in-95">
              <div className="w-16 h-16 bg-semantic-success/20 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-semantic-success" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-neutral-text-primary">Settlement Approved</h3>
                <p className="text-sm text-neutral-text-tertiary mt-1">
                  The document has been digitally signed and the case is now completed.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="bg-brand-primary/5 border border-brand-primary/10 p-4 rounded-lg mb-6">
                <p className="text-[11px] text-neutral-text-secondary leading-relaxed">
                  By signing this document, you are confirming that all agent findings have been verified and the final settlement amount of <strong>RM {finalPayout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> is approved for payout.
                </p>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-neutral-text-tertiary uppercase tracking-wider flex items-center">
                    <User className="w-3 h-3 mr-1.5" /> Full Name
                  </label>
                  <input
                    type="text"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    required
                    className="w-full bg-neutral-background border border-neutral-border rounded-md px-3 py-2 text-sm text-neutral-text-primary focus:outline-none focus:border-brand-primary transition-colors"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-neutral-text-tertiary uppercase tracking-wider flex items-center">
                    <Briefcase className="w-3 h-3 mr-1.5" /> Designation / Department
                  </label>
                  <input
                    type="text"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    required
                    className="w-full bg-neutral-background border border-neutral-border rounded-md px-3 py-2 text-sm text-neutral-text-primary focus:outline-none focus:border-brand-primary transition-colors"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-neutral-text-tertiary uppercase tracking-wider flex items-center">
                    <Calendar className="w-3 h-3 mr-1.5" /> Signature Date
                  </label>
                  <input
                    type="text"
                    value={new Date().toLocaleDateString('en-MY', { day: '2-digit', month: 'long', year: 'numeric' })}
                    disabled
                    className="w-full bg-neutral-background/50 border border-neutral-border rounded-md px-3 py-2 text-sm text-neutral-text-tertiary cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="pt-6 flex space-x-3">
                <Button 
                  type="button" 
                  variant="secondary" 
                  className="flex-1"
                  onClick={onClose}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="flex-1 bg-brand-primary text-black hover:bg-brand-primary/90 shadow-lg shadow-brand-primary/20"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <PenTool className="w-4 h-4 mr-2" />
                  )}
                  {isSubmitting ? "Signing..." : "Sign & Approve"}
                </Button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
