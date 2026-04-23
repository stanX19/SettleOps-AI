"use client";

import React from "react"
import { Badge } from "@/components/primitives/Badge"
import { CheckCircle2, AlertTriangle, ShieldCheck, FileKey, Scale, Landmark, Info, Loader2 } from "lucide-react"

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

import { useCaseStore } from "@/stores/case-store"
import { BlackboardSection } from "@/lib/types"

function OutputCard({ title, icon, children, status }: { title: string, icon: React.ReactNode, children: React.ReactNode, status?: 'success' | 'warning' | 'danger' }) {
  let headerColor = "text-neutral-text-primary";
  if (status === "warning") headerColor = "text-semantic-warning";
  if (status === "danger") headerColor = "text-semantic-danger";

  return (
    <div className="bg-neutral-surface border border-neutral-border rounded-md shadow-card mb-4 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="bg-neutral-background px-3 py-2 border-b border-neutral-border flex items-center justify-between">
        <div className={`flex items-center text-sm font-semibold ${headerColor}`}>
          <span className="mr-2 opacity-80">{icon}</span>
          {title}
        </div>
        <CheckCircle2 className="w-4 h-4 text-semantic-success opacity-80" />
      </div>
      <div className="p-3">
        {children}
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string, value: React.ReactNode }) {
  return (
    <div className="flex flex-col mb-3 last:mb-0">
      <span className="text-[10px] text-neutral-text-tertiary uppercase tracking-wider font-bold mb-0.5">{label}</span>
      <div className="text-xs text-neutral-text-primary font-medium leading-relaxed">
        {value}
      </div>
    </div>
  )
}

function BlackboardSkeleton() {
  return (
    <div className="bg-neutral-surface border border-neutral-border rounded-md shadow-card mb-4 overflow-hidden opacity-60">
      <div className="bg-neutral-background px-3 py-2 border-b border-neutral-border flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 rounded bg-neutral-border/50 animate-pulse" />
          <div className="w-24 h-3 rounded bg-neutral-border/50 animate-pulse" />
        </div>
      </div>
      <div className="p-3 space-y-4">
        <div className="space-y-2">
          <div className="w-16 h-2 rounded bg-neutral-border/30 animate-pulse" />
          <div className="w-full h-3 rounded bg-neutral-border/30 animate-pulse" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="w-12 h-2 rounded bg-neutral-border/30 animate-pulse" />
            <div className="w-full h-3 rounded bg-neutral-border/30 animate-pulse" />
          </div>
          <div className="space-y-2">
            <div className="w-12 h-2 rounded bg-neutral-border/30 animate-pulse" />
            <div className="w-full h-3 rounded bg-neutral-border/30 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function BlackboardPane() {
  const blackboard = useCaseStore(state => state.blackboard);
  const status = useCaseStore(state => state.status);
  const isSyncing = status === "running";

  const renderCaseFacts = (data: any) => (
    <OutputCard title="Case Facts" icon={<FileKey className="w-4 h-4" />} status="success">
      <Field label="Summary" value={data.summary || "Extracting..."} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Incident Date" value={data.incident_date} />
        <Field label="Location" value={data.location} />
      </div>
      <div className="mt-2 p-2 bg-neutral-background/50 rounded border border-neutral-border/50">
        <span className="text-[9px] text-neutral-text-tertiary font-bold uppercase tracking-wider block mb-1">Vehicles Involved</span>
        {data.vehicles?.map((v: any, i: number) => (
          <div key={i} className="flex items-center justify-between py-1 border-b border-neutral-border last:border-0">
            <span className="text-xs text-neutral-text-primary font-bold">{v.plate}</span>
            <span className="text-[10px] text-neutral-text-secondary">{v.model}</span>
          </div>
        ))}
      </div>
    </OutputCard>
  );

  const renderPolicyVerdict = (data: any) => (
    <OutputCard title="Policy Verdict" icon={<ShieldCheck className="w-4 h-4" />} status="success">
      <Field label="Status" value={<Badge variant={data.is_covered ? "success" : "distructive"}>{data.is_covered ? "Covered" : "Rejected"}</Badge>} />
      <Field label="Claim Type" value={data.claim_type} />
      <div className="flex flex-wrap gap-1 mt-1">
        {data.tags?.map((t: string) => <Tag key={t}>{t}</Tag>)}
      </div>
    </OutputCard>
  );

  const renderLiabilityVerdict = (data: any) => (
    <OutputCard title="Liability Verdict" icon={<Scale className="w-4 h-4" />} status="success">
      <Field label="Fault Split" value={<LiabilityBar claimant={data.claimant_fault_pct} thirdParty={data.third_party_fault_pct} />} />
      <Field label="Reasoning" value={<div className="text-[11px] italic text-neutral-text-secondary">{data.reasoning}</div>} />
    </OutputCard>
  );

  const renderFraudAssessment = (data: any) => (
    <OutputCard title="Fraud Assessment" icon={<AlertTriangle className="w-4 h-4" />} status={data.risk_score > 0.5 ? "danger" : "success"}>
      <div className="flex items-baseline justify-between">
        <Field label="Risk Score" value={<span className="text-lg font-mono">{data.risk_score?.toFixed(2)}</span>} />
        <Badge variant={data.risk_score > 0.5 ? "distructive" : "success"}>
          {data.risk_score > 0.5 ? "High Risk" : "Low Risk"}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-1 mt-2">
        {data.flags?.map((f: string) => <Tag key={f}>{f}</Tag>)}
      </div>
    </OutputCard>
  );

  const renderPayoutRecommendation = (data: any) => (
    <OutputCard title="Payout Recommendation" icon={<Landmark className="w-4 h-4" />} status="success">
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-xs">
          <span className="text-neutral-text-secondary">Base Amount</span>
          <span className="font-semibold text-neutral-text-primary">RM {data.base_amount?.toLocaleString()}</span>
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="text-neutral-text-tertiary italic">Adjustments</span>
          <span className="text-semantic-danger/80">- RM {data.deductions?.toLocaleString()}</span>
        </div>
        <div className="border-t border-neutral-border pt-2 mt-2 flex justify-between items-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-text-secondary">Final Payout</span>
          <span className="text-sm font-bold text-brand-primary">RM {data.final_payout?.toLocaleString()}</span>
        </div>
      </div>
    </OutputCard>
  );

  return (
    <div className="pl-6 pr-4 py-4 flex flex-col h-full overflow-y-auto bg-neutral-background custom-scrollbar">
      <div className="flex flex-col mb-6 space-y-1">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-text-primary">Blackboard State</h2>
          <Badge variant={isSyncing ? "warning" : "success"} className="transition-all duration-500">
            {isSyncing ? (
              <span className="flex items-center">
                <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                Syncing
              </span>
            ) : "Synced"}
          </Badge>
        </div>
        <p className="text-xs text-neutral-text-secondary">Live engine decision buffer</p>
      </div>

      <div className="flex-1 flex flex-col">
        {blackboard[BlackboardSection.CASE_FACTS] ? renderCaseFacts(blackboard[BlackboardSection.CASE_FACTS]) : (isSyncing && <BlackboardSkeleton />)}
        {blackboard[BlackboardSection.POLICY_VERDICT] ? renderPolicyVerdict(blackboard[BlackboardSection.POLICY_VERDICT]) : (isSyncing && blackboard[BlackboardSection.CASE_FACTS] && <BlackboardSkeleton />)}
        {blackboard[BlackboardSection.LIABILITY_VERDICT] && renderLiabilityVerdict(blackboard[BlackboardSection.LIABILITY_VERDICT])}
        {blackboard[BlackboardSection.FRAUD_ASSESSMENT] && renderFraudAssessment(blackboard[BlackboardSection.FRAUD_ASSESSMENT])}
        {blackboard[BlackboardSection.PAYOUT_RECOMMENDATION] && renderPayoutRecommendation(blackboard[BlackboardSection.PAYOUT_RECOMMENDATION])}
        
        {!Object.keys(blackboard).length && !isSyncing && (
          <div className="flex-1 flex flex-col items-center justify-center text-neutral-text-tertiary opacity-40 py-20 text-center">
            <Info className="w-12 h-12 mb-4" />
            <p className="text-sm font-medium">Awaiting Agent Output</p>
            <p className="text-[10px] uppercase tracking-widest mt-1">Real-time SSE Stream</p>
          </div>
        )}
      </div>
    </div>
  )
}
