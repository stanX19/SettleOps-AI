import { useState } from "react"
import { Button } from "@/components/primitives/Button"
import { Toast } from "@/components/primitives/Toast"
import { Check, Edit3, ShieldX, AlertTriangle, Loader2, FileText, Upload } from "lucide-react"
import { useCaseStore } from "@/stores/case-store"
import { CaseStatus, ArtifactType } from "@/lib/types"
import { api } from "@/lib/api"
import { SignatureModal } from "./SignatureModal"

function DeclineConfirmModal({ isOpen, isSubmitting, onConfirm, onCancel }: {
  isOpen: boolean;
  isSubmitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-neutral-surface border border-neutral-border rounded-lg shadow-2xl w-full max-w-sm mx-4 p-6 animate-in zoom-in-95 duration-200">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-12 h-12 rounded-full bg-semantic-danger/10 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-semantic-danger" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-neutral-text-primary mb-1">Decline this claim?</h3>
            <p className="text-sm text-neutral-text-secondary">
              This action will formally reject the settlement. The claimant will be notified and this cannot be undone.
            </p>
          </div>
          <div className="flex gap-3 w-full mt-2">
            <Button
              variant="secondary"
              className="flex-1 h-9"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              className="flex-1 h-9 bg-semantic-danger hover:bg-semantic-danger/90 text-white"
              onClick={onConfirm}
              disabled={isSubmitting}
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Yes, Decline"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ActionBarProps {
  onOpenAdjusterUpload?: () => void;
}

export function ActionBar({ onOpenAdjusterUpload }: ActionBarProps) {
  const caseId = useCaseStore(state => state.case_id);
  const status = useCaseStore(state => state.status);
  const [isConfirmingDecline, setIsConfirmingDecline] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: "", visible: false });

  // The action bar UI itself only makes sense while the case is awaiting an
  // operator decision. The signature modal and toast are intentionally rendered
  // unconditionally below: once the operator has opened the modal, the case
  // transitions through RUNNING -> APPROVED on the backend, and unmounting the
  // modal mid-flow would lose its local step state and snap back to "preview
  // draft" the next time the parent re-renders.
  const showActionBar = !!caseId && [
    CaseStatus.AWAITING_APPROVAL,
    CaseStatus.ESCALATED,
    CaseStatus.AWAITING_DOCS,
    CaseStatus.AWAITING_ADJUSTER,
    CaseStatus.APPROVED,
  ].includes(status);

  const handleResume = async () => {
    try {
      setIsSubmitting(true);
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

  const handleDownloadReport = () => {
    const artifacts = useCaseStore.getState().artifacts;
    const signedArtifact = artifacts.find(a => a.artifact_type === ArtifactType.DECISION_PDF_SIGNED && !a.superseded);
    if (signedArtifact) {
      const apiBase = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
      window.open(`${apiBase}${signedArtifact.url}`, "_blank");
    }
  };

  return (
    <>
      {showActionBar && (
        <>
          <DeclineConfirmModal
            isOpen={isConfirmingDecline}
            isSubmitting={isSubmitting}
            onConfirm={handleDecline}
            onCancel={() => setIsConfirmingDecline(false)}
          />

          <div className="h-14 bg-neutral-surface border-t border-neutral-border px-6 flex items-center justify-between shrink-0 box-border z-30 w-full animate-in slide-in-from-bottom-full duration-500 ease-out">
            <div className="flex items-center space-x-4">
              {status !== CaseStatus.APPROVED && (
                <Button
                  variant="outline"
                  onClick={() => setIsConfirmingDecline(true)}
                  className="h-9 border-semantic-danger/30 text-semantic-danger hover:bg-semantic-danger hover:text-neutral-white transition-all duration-200"
                  disabled={isSubmitting}
                >
                  <ShieldX className="w-4 h-4 mr-2" />
                  Decline Claim
                </Button>
              )}
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex space-x-3">
                {status === CaseStatus.APPROVED ? (
                  <Button
                    variant="default"
                    className="group h-9 rounded-md px-6 py-2 text-sm font-semibold bg-semantic-success hover:bg-semantic-success hover:brightness-110 text-white transition-all duration-200 ease-out"
                    onClick={handleDownloadReport}
                  >
                    <FileText className="w-4 h-4 mr-2 transition-transform duration-200 group-hover:scale-110" />
                    Download Final Report
                  </Button>
                ) : status === CaseStatus.AWAITING_DOCS ? (
                  <Button
                    variant="default"
                    className="group h-9 rounded-md px-6 py-2 text-sm font-semibold bg-brand-primary hover:bg-brand-primary hover:brightness-110 hover:shadow-xl hover:shadow-brand-primary/40 active:shadow-md text-black shadow-lg shadow-brand-primary/20 transition-all duration-200 ease-out disabled:opacity-60 disabled:hover:brightness-100"
                    onClick={handleResume}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4 mr-2 transition-transform duration-200 group-hover:scale-110" />
                    )}
                    Resume Pipeline
                  </Button>
                ) : status === CaseStatus.AWAITING_ADJUSTER ? (
                  <Button
                    variant="default"
                    className="group h-9 rounded-md px-6 py-2 text-sm font-semibold bg-semantic-warning hover:bg-semantic-warning hover:brightness-110 hover:shadow-xl hover:shadow-semantic-warning/40 active:shadow-md text-black shadow-lg shadow-semantic-warning/20 transition-all duration-200 ease-out disabled:opacity-60 disabled:hover:brightness-100"
                    onClick={onOpenAdjusterUpload}
                    disabled={isSubmitting}
                  >
                    <Upload className="w-4 h-4 mr-2 transition-transform duration-200 group-hover:scale-110" />
                    Upload Adjuster Report
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="secondary"
                      className="border-neutral-border text-neutral-text-primary h-9 rounded-md px-4 py-2 text-sm font-medium hover:bg-brand-primary/10 hover:border-brand-primary/40 hover:text-brand-primary transition-all duration-200"
                      disabled={isSubmitting}
                      onClick={() => useCaseStore.getState().setBlackboardMode("chat")}
                    >
                      <Edit3 className="w-4 h-4 mr-2 text-brand-primary" />
                      Challenge
                    </Button>
                    <Button
                      variant="default"
                      className="group h-9 rounded-md px-6 py-2 text-sm font-semibold bg-brand-primary hover:bg-brand-primary hover:brightness-110 hover:shadow-xl hover:shadow-brand-primary/40 active:shadow-md text-black shadow-lg shadow-brand-primary/20 transition-all duration-200 ease-out disabled:opacity-60 disabled:hover:brightness-100"
                      onClick={handleApprove}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4 mr-2 transition-transform duration-200 group-hover:scale-110" />
                      )}
                      Approve Settlement
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {caseId && (
        <SignatureModal
          isOpen={isSignatureModalOpen}
          onClose={() => setIsSignatureModalOpen(false)}
          caseId={caseId}
          onSuccess={async () => {
            setToast({ message: "Settlement approved successfully", visible: true });
            try {
              const snapshot = await api.getCaseSnapshot(caseId);
              useCaseStore.getState().setCase(snapshot);
            } catch (err) {
              console.error("Failed to refresh case state after approval", err);
            }
          }}
        />
      )}

      <Toast
        message={toast.message}
        isVisible={toast.visible}
        onClose={() => setToast(prev => ({ ...prev, visible: false }))}
      />
    </>
  )
}
