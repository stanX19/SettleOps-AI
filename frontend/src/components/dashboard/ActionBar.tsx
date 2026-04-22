"use client";

import { Button } from "@/components/primitives/Button"
import { Check, Edit3, ShieldX, XCircle } from "lucide-react"

export function ActionBar() {
  return (
    <div className="h-16 bg-neutral-surface border-t border-neutral-border px-6 flex items-center justify-between shrink-0 box-border z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] w-full">
      <div className="flex items-center space-x-4">
        <Button variant="outline" className="h-9 border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white transition-all duration-200">
          <ShieldX className="w-4 h-4 mr-2" />
          Decline Claim
        </Button>
      </div>

      <div className="flex space-x-3">
        <Button variant="secondaryAI" className="border-neutral-border text-neutral-text-primary h-9 rounded-md px-4 py-2 text-sm font-medium hover:bg-neutral-background">
          <Edit3 className="w-4 h-4 mr-2 text-brand-primary" />
          Modify
        </Button>
        <Button variant="default" className="h-9 rounded-md px-6 py-2 text-sm font-semibold">
          <Check className="w-4 h-4 mr-2" />
          Approve Settlement
        </Button>
      </div>
    </div>
  )
}
