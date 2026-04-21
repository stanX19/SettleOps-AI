"use client";

import { useState, useCallback, useEffect } from "react"
import { InputsPane } from "@/components/dashboard/InputsPane"
import { WorkflowPane } from "@/components/dashboard/WorkflowPane"
import { BlackboardPane } from "@/components/dashboard/BlackboardPane"
import { ActionBar } from "@/components/dashboard/ActionBar"

export default function DashboardPage() {
  const [blackboardWidth, setBlackboardWidth] = useState(290);
  const [isResizing, setIsResizing] = useState(false);

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
        if (newWidth >= 290 && newWidth <= 600) {
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
        <div className="w-[290px] min-w-[290px] h-full border-r border-neutral-border bg-neutral-surface overflow-hidden">
          <InputsPane />
        </div>

        {/* Middle Pane: Workflow */}
        <div className="flex-1 h-full border-r border-neutral-border bg-neutral-background flex flex-col relative overflow-hidden">
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
