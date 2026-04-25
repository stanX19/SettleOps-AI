import { useState } from "react"
import { Button } from "@/components/primitives/Button"
import { Check, Edit3, ShieldX, XCircle, AlertCircle, Loader2 } from "lucide-react"
import { useCaseStore } from "@/stores/case-store"
import { CaseStatus } from "@/lib/types"
import { api } from "@/lib/api"
import { SignatureModal } from "./SignatureModal"

export function ActionBar() {
  const caseId = useCaseStore(state => state.case_id);
  const status = useCaseStore(state => state.status);
  const [isConfirmingDecline, setIsConfirmingDecline] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);

  if (!caseId || ![CaseStatus.AWAITING_APPROVAL, CaseStatus.ESCALATED, CaseStatus.AWAITING_DOCS].includes(status)) {
    return null;
  }

  const handleResume = async () => {
    try {
      setIsSubmitting(true);
      // We use the documents upload endpoint with no new files to trigger a resume/re-validation
      await api.submitDocuments(caseId, []);
    } catch (error) {
      console.error("Failed to resume workflow:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async () => {
    setIsSignatureModalOpen(true);
  };

  const handleDecline = async () => {
    try {
      setIsSubmitting(true);
      await api.declineCase(caseId, "Declined by officer via dashboard");
      setIsConfirmingDecline(false);
    } catch (error) {
      console.error("Failed to decline case:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-16 bg-neutral-surface border-t border-neutral-border px-6 flex items-center justify-between shrink-0 box-border z-30 shadow-[0_-8px_30px_rgb(0,0,0,0.12)] w-full animate-in slide-in-from-bottom-full duration-500 ease-out">
      <div className="flex items-center space-x-4">
        {!isConfirmingDecline ? (
          <Button 
            variant="outline" 
            onClick={() => setIsConfirmingDecline(true)}
            className="h-9 border-semantic-danger/30 text-semantic-danger hover:bg-semantic-danger hover:text-neutral-white transition-all duration-200"
          >
            <ShieldX className="w-4 h-4 mr-2" />
            Decline Claim
          </Button>
        ) : (
          <div className="flex items-center space-x-2 bg-semantic-danger/10 p-1.5 pr-3 rounded-md border border-semantic-danger/30 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center px-2 text-xs font-bold text-semantic-danger">
              <AlertCircle className="w-3.5 h-3.5 mr-1.5" />
              CONFIRM DECLINE?
            </div>
            <Button 
              size="sm" 
              variant="default"
              className="h-7 bg-semantic-danger hover:bg-semantic-danger/80" 
              onClick={handleDecline}
              disabled={isSubmitting}
            >
              {isSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes, Decline"}
            </Button>
            <Button 
              size="sm" 
              variant="secondary" 
              className="h-7" 
              onClick={() => setIsConfirmingDecline(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>

      <div className="flex space-x-3">
        {status === CaseStatus.AWAITING_DOCS ? (
          <Button 
            variant="default" 
            className="h-9 rounded-md px-6 py-2 text-sm font-semibold bg-brand-primary hover:bg-brand-primary/90 text-neutral-white shadow-lg shadow-brand-primary/20"
            onClick={handleResume}
            disabled={isSubmitting}
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
            Resume Pipeline
          </Button>
        ) : (
          <>
            <Button 
              variant="secondary" 
              className="border-neutral-border text-neutral-text-primary h-9 rounded-md px-4 py-2 text-sm font-medium hover:bg-neutral-background"
              disabled={isSubmitting}
              onClick={() => useCaseStore.getState().setBlackboardMode('chat')}
            >
              <Edit3 className="w-4 h-4 mr-2 text-brand-primary" />
              Modify
            </Button>
            <Button 
              variant="default" 
              className="h-9 rounded-md px-6 py-2 text-sm font-semibold bg-brand-primary hover:bg-brand-primary/90 text-neutral-white shadow-lg shadow-brand-primary/20"
              onClick={handleApprove}
              disabled={isSubmitting || isConfirmingDecline}
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              Approve Settlement
            </Button>
          </>
        )}
      </div>

      <SignatureModal 
        isOpen={isSignatureModalOpen} 
        onClose={() => setIsSignatureModalOpen(false)}
        caseId={caseId}
        onSuccess={() => {
          // Success is handled by the modal (close + redirect or sse)
        }}
      />
    </div>
  )
}
