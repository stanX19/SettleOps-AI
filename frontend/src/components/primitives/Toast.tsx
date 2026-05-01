"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToastProps {
  message: string;
  isVisible: boolean;
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, isVisible, onClose, duration = 3000 }: ToastProps) {
  const [shouldRender, setShouldRender] = useState(isVisible);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setShouldRender(true);
      const animTimer = setTimeout(() => setActive(true), 10);
      const hideTimer = setTimeout(() => onClose(), duration);
      return () => {
        clearTimeout(animTimer);
        clearTimeout(hideTimer);
      };
    } else {
      setActive(false);
      const timer = setTimeout(() => setShouldRender(false), 500);
      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onClose]);

  if (!shouldRender) return null;

  return (
    <div
      className={cn(
        "fixed top-10 left-1/2 -translate-x-1/2 z-[100] transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1)",
        active
          ? "opacity-100 translate-y-0"
          : "opacity-0 -translate-y-12"
      )}
    >
      <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-neutral-surface/90 backdrop-blur-md border border-neutral-border shadow-lg min-w-[240px]">
        <div className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-semantic-success/10">
          <CheckCircle2 className="w-4 h-4 text-semantic-success" />
        </div>

        <div className="flex-1 min-w-0 pr-2">
          <p className="text-[13px] font-medium text-neutral-text-primary truncate">
            {message}
          </p>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded-md hover:bg-neutral-background text-neutral-text-tertiary hover:text-neutral-text-primary transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
