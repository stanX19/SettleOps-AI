"use client";

import { useState, useCallback, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react"
import { InputsPane } from "@/components/dashboard/InputsPane"
import { WorkflowPane } from "@/components/dashboard/WorkflowPane"
import { BlackboardPane } from "@/components/dashboard/BlackboardPane"
import { ActionBar } from "@/components/dashboard/ActionBar"
import { AdjusterUploadModal } from "@/components/dashboard/AdjusterUploadModal"
import { Button } from "@/components/primitives/Button"
import { api, ApiError } from "@/lib/api"
import { useCaseStore } from "@/stores/case-store"
import { SseClient } from "@/lib/sse-client"
import { CaseStatus } from "@/lib/types"

interface PageProps {
  params: Promise<{ caseId: string }>;
}

type LoadState = "loading" | "ready" | "not_found" | "error";

export default function WorkflowCasePage({ params }: PageProps) {
  const { caseId } = use(params);
  const router = useRouter();
  const [blackboardWidth, setBlackboardWidth] = useState(350);
  const [isResizing, setIsResizing] = useState(false);
  const setCase = useCaseStore(state => state.setCase);
  const resetCase = useCaseStore(state => state.reset);
  const caseStatus = useCaseStore(state => state.status);
  const [adjusterModalOpen, setAdjusterModalOpen] = useState(false);
  const [adjusterModalShown, setAdjusterModalShown] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);

  // Auto-open adjuster upload modal when case enters AWAITING_ADJUSTER
  useEffect(() => {
    if (caseStatus === CaseStatus.AWAITING_ADJUSTER && !adjusterModalShown) {
      setAdjusterModalOpen(true);
      setAdjusterModalShown(true);
    }
  }, [caseStatus, adjusterModalShown]);

  const handleAdjusterUpload = useCallback(async (file: File) => {
    await api.uploadAdjusterReport(caseId, file);
  }, [caseId]);

  // Load snapshot and connect to SSE on mount
  useEffect(() => {
    let sse: SseClient | null = null;
    let isCancelled = false;

    const init = async () => {
      try {
        setLoadState("loading");
        setLoadErrorMessage(null);
        const snapshot = await api.getCaseSnapshot(caseId);
        if (isCancelled) return;
        setCase(snapshot);
        setLoadState("ready");

        const refreshCase = useCaseStore.getState().refreshCase;

        sse = new SseClient(caseId, () => {
          console.log("SSE connected, refreshing case state...");
          refreshCase(caseId);
        });
        sse.connect();
      } catch (err) {
        if (isCancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          // Expected when the case ID is invalid or the backend was restarted.
          // Surface a friendly empty state instead of a console error.
          console.warn(`Case ${caseId} not found (404).`);
          setLoadState("not_found");
        } else {
          console.error("Failed to initialize case:", err);
          setLoadErrorMessage(err instanceof Error ? err.message : "Failed to load case.");
          setLoadState("error");
        }
      }
    };

    init();

    return () => {
      isCancelled = true;
      if (sse) sse.disconnect();
      resetCase();
    };
  }, [caseId, setCase, resetCase]);

  const startResizing = useCallback(() => {
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (e: MouseEvent) => {
      if (isResizing) {
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth >= 320 && newWidth <= 600) {
          setBlackboardWidth(newWidth);
        }
      }
    },
    [isResizing]
  );

  useEffect(() => {
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize, stopResizing]);

  if (loadState === "loading") {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-neutral-background">
        <Loader2 className="w-8 h-8 text-brand-primary animate-spin mb-3" />
        <p className="text-sm font-medium text-neutral-text-secondary">Loading case…</p>
        <p className="text-xs text-neutral-text-tertiary mt-1 font-mono">{caseId}</p>
      </div>
    );
  }

  if (loadState === "not_found" || loadState === "error") {
    const isNotFound = loadState === "not_found";
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-neutral-background p-6">
        <div className="bg-neutral-surface border border-neutral-border rounded-xl shadow-card max-w-md w-full p-7 text-center flex flex-col items-center">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${isNotFound ? "bg-amber-500/10 text-amber-500" : "bg-semantic-danger/10 text-semantic-danger"}`}>
            <AlertCircle className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-neutral-text-primary tracking-tight mb-1.5">
            {isNotFound ? "Case Not Found" : "Couldn't Load Case"}
          </h2>
          <p className="text-sm text-neutral-text-secondary mb-1">
            {isNotFound
              ? "The case you're looking for no longer exists or hasn't been submitted yet."
              : "Something went wrong while loading this case."}
          </p>
          <p className="text-[11px] text-neutral-text-tertiary font-mono mb-5 break-all">
            {caseId}
          </p>
          {!isNotFound && loadErrorMessage && (
            <p className="text-xs text-semantic-danger bg-semantic-danger/10 border border-semantic-danger/20 rounded-md px-3 py-2 mb-4 w-full wrap-break-word">
              {loadErrorMessage}
            </p>
          )}
          <div className="flex gap-2 w-full">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => router.push("/")}
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Back to Dashboard
            </Button>
            {!isNotFound && (
              <Button
                className="flex-1 bg-brand-primary text-black hover:bg-brand-primary-hover"
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-neutral-background select-none">
      <div className="flex flex-1 overflow-hidden">
        {/* Left Pane: Inputs */}
        <div className="w-[320px] min-w-[320px] h-full border-r border-neutral-border bg-neutral-surface overflow-hidden">
          <InputsPane />
        </div>

        {/* Middle Pane: Workflow */}
        <div className="flex-1 h-full bg-neutral-background flex flex-col relative overflow-hidden">
          <WorkflowPane />
        </div>

        {/* Resizer Handle */}
        <div
          onMouseDown={startResizing}
          className={`w-1.5 h-full cursor-col-resize hover:bg-brand-primary transition-colors absolute right-0 z-50 ${isResizing ? 'bg-brand-primary' : 'bg-transparent'}`}
          style={{ right: `${blackboardWidth - 3}px` }}
        />

        {/* Right Pane: Blackboard */}
        <div 
          style={{ width: `${blackboardWidth}px` }}
          className="h-full bg-neutral-surface flex flex-col border-l border-neutral-border transition-[width] duration-75 ease-out shadow-[-4px_0_12px_rgba(0,0,0,0.1)]"
        >
          <BlackboardPane />
        </div>
      </div>
      
      {/* Bottom Action Bar */}
      <ActionBar onOpenAdjusterUpload={() => setAdjusterModalOpen(true)} />

      {/* Adjuster Upload Modal — auto-opens on AWAITING_ADJUSTER */}
      <AdjusterUploadModal
        isOpen={adjusterModalOpen}
        onClose={() => setAdjusterModalOpen(false)}
        onUpload={handleAdjusterUpload}
      />
    </div>
  )
}
