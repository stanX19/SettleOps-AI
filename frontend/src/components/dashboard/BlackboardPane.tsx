"use client";

import React from "react"
import { Badge } from "@/components/primitives/Badge"
import { CheckCircle2, AlertTriangle, ShieldCheck, FileKey, Scale, Landmark, Info } from "lucide-react"

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium border bg-neutral-border/30 text-neutral-text-secondary border-neutral-border/50 mr-1.5 mb-1 inline-block">
      {children}
    </span>
  )
}

function LiabilityBar({ claimant, thirdParty }: { claimant: number, thirdParty: number }) {
  return (
    <div className="mt-1 space-y-1">
      <div className="flex justify-between text-[9px] font-bold uppercase tracking-tighter">
        <span className={claimant > 0 ? "text-semantic-danger" : "text-neutral-text-tertiary"}>Claimant {claimant}%</span>
        <span className={thirdParty > 0 ? "text-semantic-danger" : "text-neutral-text-tertiary"}>Third Party {thirdParty}%</span>
      </div>
      <div className="h-1.5 w-full bg-neutral-border/30 rounded-full overflow-hidden flex">
        <div className="h-full bg-neutral-text-tertiary transition-all duration-500" style={{ width: `${claimant}%` }} />
        <div className="h-full bg-semantic-danger transition-all duration-500" style={{ width: `${thirdParty}%` }} />
      </div>
    </div>
  )
}

function OutputCard({ title, icon, fields, status }: { title: string, icon: React.ReactNode, fields: Record<string, React.ReactNode>, status?: 'success' | 'warning' | 'danger' }) {
  let headerColor = "text-neutral-text-primary";
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
      </div>
      <div className="p-3">
        <div className="grid grid-cols-1 gap-3">
          {Object.entries(fields).map(([key, value]) => (
            <div key={key} className="flex flex-col">
              <span className="text-[10px] text-neutral-text-tertiary uppercase tracking-wider font-bold mb-0.5">{key}</span>
              <div className="text-xs text-neutral-text-primary font-medium leading-relaxed">
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function BlackboardPane() {
  return (
    <div className="pl-6 pr-4 py-4 flex flex-col h-full overflow-y-auto bg-neutral-background custom-scrollbar">
      <div className="flex flex-col mb-6 space-y-1">
        <h2 className="text-lg font-semibold text-neutral-text-primary flex items-center justify-between">
          <span>Blackboard State</span>
          <Badge variant="success">Syncing</Badge>
        </h2>
        <p className="text-xs text-neutral-text-secondary">Shared JSON payload buffer</p>
      </div>

      <div className="flex-1 flex flex-col">
        <OutputCard
          title="Case Facts"
          icon={<FileKey className="w-4 h-4" />}
          status="success"
          fields={{
            "Case ID": <span className="font-mono text-brand-primary">CLM-2026-00812</span>,
            "Incident Date": "15 March 2026 14:32:00",
            "Location": <span className="flex items-center"><Info className="w-3 h-3 mr-1 text-blue-400" /> Jalan Tun Razak near KLCC</span>,
            "Involved Vehicles": (
              <div className="space-y-4 mt-2">
                {/* Claimant */}
                <div className="flex flex-col space-y-1.5">
                  <div className="text-[9px] text-neutral-text-tertiary font-extrabold tracking-[0.15em] flex items-center ml-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-primary mr-2" />
                    CLAIMANT (DRIVER A)
                  </div>
                  <div className="flex flex-wrap items-center justify-between px-3 gap-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-neutral-text-primary px-1.5 py-0.5 bg-neutral-border/20 rounded border border-neutral-border/30">WXY 1234</span>
                      <span className="text-xs text-neutral-text-secondary italic opacity-80">Proton X50</span>
                    </div>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium border bg-semantic-danger/10 text-semantic-danger border-semantic-danger/20 inline-block whitespace-nowrap">
                      Rear Damage
                    </span>
                  </div>
                </div>

                {/* Third Party */}
                <div className="flex flex-col space-y-1.5">
                  <div className="text-[9px] text-neutral-text-tertiary font-extrabold tracking-[0.15em] flex items-center ml-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-neutral-border mr-2" />
                    THIRD PARTY (DRIVER B)
                  </div>
                  <div className="flex flex-wrap items-center justify-between px-3 gap-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-neutral-text-primary px-1.5 py-0.5 bg-neutral-border/20 rounded border border-neutral-border/30">ABC 5678</span>
                      <span className="text-xs text-neutral-text-secondary italic opacity-80">Honda City</span>
                    </div>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium border bg-semantic-danger/10 text-semantic-danger border-semantic-danger/20 inline-block whitespace-nowrap">
                      Front Damage
                    </span>
                  </div>
                </div>
              </div>
            )
          }}
        />

        <OutputCard
          title="Policy Verdict"
          icon={<ShieldCheck className="w-4 h-4" />}
          status="success"
          fields={{
            "Status": <Badge variant="success" className="px-2">Covered</Badge>,
            "Clause": "4.2(a) Comprehensive Motor OD-KFK",
            "Conditions": (
              <div className="flex flex-wrap mt-1">
                <Tag>Excess RM 400</Tag>
                <Tag>NCD 25% Protected</Tag>
                <Tag>KFK Waiver Eligible</Tag>
              </div>
            )
          }}
        />

        <OutputCard
          title="Liability Verdict"
          icon={<Scale className="w-4 h-4" />}
          status="success"
          fields={{
            "Fault Split": <LiabilityBar claimant={0} thirdParty={100} />,
            "Reasoning": (
              <div className="text-[11px] bg-neutral-background/50 p-2 rounded border border-neutral-border/50 italic text-neutral-text-secondary">
                "Section 43 summons issued to TP. Photo evidence confirms Claimant stationary and TP failed to brake."
              </div>
            )
          }}
        />

        <OutputCard
          title="Fraud Assessment"
          icon={<AlertTriangle className="w-4 h-4" />}
          status="success"
          fields={{
            "Risk Category": <span className="text-semantic-success font-bold">Low Risk</span>,
            "Suspicion Score": <span className="text-lg font-mono tracking-tight">0.18</span>,
            "Signals": (
              <div className="flex flex-wrap mt-1">
                <Tag>No metadata anomalies</Tag>
                <Tag>Policy active &gt; 2 years</Tag>
              </div>
            )
          }}
        />

        <OutputCard
          title="Payout Recommendation"
          icon={<Landmark className="w-4 h-4" />}
          status="success"
          fields={{
            "Calculation": (
              <div className="space-y-1.5 mt-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-neutral-text-secondary">Base Estimate</span>
                  <span className="font-semibold text-neutral-text-primary">RM 5,600.00</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-neutral-text-tertiary italic">Less: Excess</span>
                  <span className="text-semantic-danger/80">- RM 400.00</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-neutral-text-tertiary italic">Less: Depreciation</span>
                  <span className="text-semantic-danger/80">- RM 1,000.00</span>
                </div>
                <div className="border-t border-neutral-border pt-2 mt-2 flex justify-between items-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-text-secondary">Final Payout</span>
                  <span className="text-sm font-bold text-brand-primary">RM 4,200.00</span>
                </div>
              </div>
            )
          }}
        />
      </div>
    </div>
  )
}
