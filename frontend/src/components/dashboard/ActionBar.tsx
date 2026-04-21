"use client";

import { Button } from "@/components/primitives/Button"
import { Check, X, FileText, Share2 } from "lucide-react"

export function ActionBar() {
  return (
    <div className="h-16 bg-neutral-surface border-t border-neutral-border px-6 flex items-center justify-between shrink-0 box-border z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] w-full">
      <div className="flex items-center space-x-4">
        <div>
          <div className="text-sm font-semibold text-neutral-text-primary">Ready for Final Decision</div>
          <div className="text-[11px] text-neutral-text-tertiary">All AI Agents completed successfully</div>
        </div>
        
        <div className="h-8 w-px bg-neutral-border mx-2"></div>
        
        <Button variant="ghost" size="sm" className="text-neutral-text-secondary hover:text-brand-primary h-8">
          <FileText className="w-4 h-4 mr-2" />
          Preview Offer Letter
        </Button>
      </div>
      
      <div className="flex space-x-3">
        <Button variant="secondaryAI" className="border-neutral-border text-neutral-text-primary h-9 rounded-md px-4 py-2 text-sm font-medium hover:bg-neutral-background">
          <X className="w-4 h-4 mr-2 text-semantic-danger" />
          Override / Rewrite
        </Button>
        <Button variant="default" className="h-9 rounded-md px-6 py-2 text-sm font-semibold">
          <Check className="w-4 h-4 mr-2" />
          Approve Settlement
        </Button>
      </div>
    </div>
  )
}
