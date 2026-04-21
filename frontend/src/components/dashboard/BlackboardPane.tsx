"use client";

import React from "react"
import { Badge } from "@/components/primitives/Badge"
import { CheckCircle2, AlertTriangle, ShieldCheck, FileKey, Scale, Landmark } from "lucide-react"

function OutputCard({ title, icon, fields, status }: { title: string, icon: React.ReactNode, fields: Record<string, React.ReactNode>, status?: 'success' | 'warning' | 'danger' }) {

  let headerColor = "text-neutral-text-primary";
  if (status === "success") headerColor = "text-semantic-success";
  if (status === "warning") headerColor = "text-semantic-warning";
  if (status === "danger") headerColor = "text-semantic-danger";

  return (
    <div className="bg-neutral-surface border border-neutral-border rounded-md shadow-card mb-4 overflow-hidden">
      <div className="bg-neutral-background px-3 py-2 border-b border-neutral-border flex items-center justify-between">
        <div className={`flex items-center text-sm font-semibold ${headerColor}`}>
          <span className="mr-2 opacity-80">{icon}</span>
          {title}
        </div>
        {status === "success" && <CheckCircle2 className="w-4 h-4 text-semantic-success" />}
        {status === "warning" && <AlertTriangle className="w-4 h-4 text-semantic-warning" />}
      </div>
      <div className="p-3">
        <div className="grid grid-cols-1 gap-2">
          {Object.entries(fields).map(([key, value]) => (
            <div key={key} className="flex flex-col">
              <span className="text-[10px] text-neutral-text-tertiary uppercase tracking-wider font-semibold">{key}</span>
              <span className="text-xs text-neutral-text-primary font-medium">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function BlackboardPane() {
  return (
    <div className="p-4 flex flex-col h-full overflow-y-auto bg-neutral-background custom-scrollbar border-l border-neutral-border">
      <div className="flex flex-col mb-6 space-y-1">
        <h2 className="text-lg font-semibold text-neutral-text-primary flex items-center justify-between">
          <span>Blackboard State</span>
          <Badge variant="success">Syncing</Badge>
        </h2>
        <p className="text-xs text-neutral-text-secondary">Shared JSON payload buffer</p>
      </div>

      <div className="flex-1 flex flex-col">

        <OutputCard
          title="CaseFacts"
          icon={<FileKey className="w-4 h-4" />}
          status="success"
          fields={{
            "Case ID": "CLM-2026-00812",
            "Incident Date": "15 March 2026 14:32:00",
            "Location": "Jalan Tun Razak near KLCC",
            "Driver A (Claimant)": "WXY 1234 (Proton X50 2023) - Rear Damage",
            "Driver B (TP)": "ABC 5678 - Front Damage"
          }}
        />

        <OutputCard
          title="PolicyVerdict"
          icon={<ShieldCheck className="w-4 h-4" />}
          status="success"
          fields={{
            "Status": <span className="text-semantic-success">Covered</span>,
            "Clause": "4.2(a) Comprehensive Motor OD-KFK",
            "Conditions": "Excess RM 400 | NCD 25% Protected"
          }}
        />

        <OutputCard
          title="LiabilityVerdict"
          icon={<Scale className="w-4 h-4" />}
          status="success"
          fields={{
            "Fault Split": "Claimant 0% | Third Party 100%",
            "Reasoning": "Section 43 summons issued to TP. Photo evidence confirms Claimant stationary and TP failed to brake."
          }}
        />

        <OutputCard
          title="FraudAssessment"
          icon={<AlertTriangle className="w-4 h-4" />}
          status="success"
          fields={{
            "Risk Category": "Low Risk",
            "Suspicion Score": "0.18",
            "Signals": "No metadata anomalies. Policy active > 2 years."
          }}
        />

        <OutputCard
          title="PayoutRecommendation"
          icon={<Landmark className="w-4 h-4" />}
          status="success"
          fields={{
            "Base Estimate": "RM 5,600.00",
            "Deductions": "-RM 400 (Excess) | -RM 1,000 (Depreciation)",
            "Final Recommendation": "RM 4,200.00 to Panel Workshop"
          }}
        />

      </div>
    </div>
  )
}
