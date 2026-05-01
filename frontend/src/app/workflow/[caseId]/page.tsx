"use client";

import { useState, useCallback, useEffect, use } from "react"
import { InputsPane } from "@/components/dashboard/InputsPane"
import { WorkflowPane } from "@/components/dashboard/WorkflowPane"
import { BlackboardPane } from "@/components/dashboard/BlackboardPane"
import { ActionBar } from "@/components/dashboard/ActionBar"
import { api } from "@/lib/api"
import { useCaseStore } from "@/stores/case-store"
import { SseClient } from "@/lib/sse-client"

interface PageProps {
  params: Promise<{ caseId: string }>;
}

export default function WorkflowCasePage({ params }: PageProps) {
  const { caseId } = use(params);
  const [blackboardWidth, setBlackboardWidth] = useState(350);
  const [isResizing, setIsResizing] = useState(false);
  const setCase = useCaseStore(state => state.setCase);
  const resetCase = useCaseStore(state => state.reset);

  // Load snapshot and connect to SSE on mount
  useEffect(() => {
    let sse: SseClient | null = null;
    let isCancelled = false;

    const init = async () => {
      try {
        const snapshot = await api.getCaseSnapshot(caseId);
        if (isCancelled) return;
        setCase(snapshot);
        
        sse = new SseClient(caseId);
        sse.connect();
      } catch (err) {
        if (!isCancelled) {
          console.error("Failed to initialize case:", err);
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
      <ActionBar />
    </div>
  )
}
