"use client";

import React, { useState, useEffect } from "react"
import { Badge } from "@/components/primitives/Badge"
import {
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  FileKey,
  Scale,
  Landmark,
  Info,
  Loader2,
  MessageSquare,
  LayoutList,
  Send,
  User,
  Bot,
  ArrowUp,
  Wrench,
  Mic,
  Volume2,
  Square,
  Edit3,
  BookOpen,
  Gavel
} from "lucide-react"
import { useCaseStore } from "@/stores/case-store"
import { BlackboardSection, CaseStatus, OfficerMessageInfo, AgentId, SseAgentOutput, Citation } from "@/lib/types"
import { api } from "@/lib/api"
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer"
import { Button } from "@/components/primitives/Button"
import { CitationPanel } from "@/components/dashboard/CitationPanel"
import { CitationEvidenceModal } from "@/components/dashboard/CitationEvidenceModal"

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

function OutputCard({
  title,
  icon,
  children,
  status,
  citationCount,
  onCitationClick,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  status?: 'success' | 'warning' | 'danger';
  citationCount?: number;
  onCitationClick?: () => void;
}) {
  let headerColor = "text-neutral-text-primary";
  if (status === "warning") headerColor = "text-semantic-warning";
  if (status === "danger") headerColor = "text-semantic-danger";

  const showBadge = citationCount !== undefined && citationCount > 0 && onCitationClick;

  return (
    <div className="bg-neutral-surface border border-neutral-border rounded-md shadow-card mb-4 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="bg-neutral-background px-3 py-2 border-b border-neutral-border flex items-center justify-between gap-2">
        <div className={`flex items-center text-sm font-semibold ${headerColor}`}>
          <span className="mr-2 opacity-80">{icon}</span>
          {title}
        </div>
        <div className="flex items-center gap-2">
          {showBadge && (
            <button
              onClick={onCitationClick}
              className="flex items-center gap-1 rounded-sm border border-brand-primary/30 bg-brand-primary/5 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-brand-primary transition-colors hover:bg-brand-primary/15"
              title={`${citationCount} citation${citationCount === 1 ? '' : 's'}`}
              aria-label={`View ${citationCount} citation${citationCount === 1 ? '' : 's'}`}
            >
              <BookOpen className="h-2.5 w-2.5" />
              {citationCount}
            </button>
          )}
          <CheckCircle2 className="w-4 h-4 text-semantic-success opacity-80" />
        </div>
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

const SECTION_TITLES: Partial<Record<BlackboardSection, string>> = {
  [BlackboardSection.POLICY_VERDICT]: "Policy Verdict",
  [BlackboardSection.LIABILITY_VERDICT]: "Liability Verdict",
  [BlackboardSection.DAMAGE_RESULT]: "Damage Assessment",
  [BlackboardSection.FRAUD_ASSESSMENT]: "Fraud Assessment",
  [BlackboardSection.AUDIT_RESULT]: "Auditor Findings",
};

export function BlackboardPane() {
  const {
    blackboard,
    status,
    officer_messages,
    addOfficerMessage,
    artifacts,
    blackboard_mode: mode,
    setBlackboardMode: setMode,
    selectedAgentId,
    setSelectedAgentId
  } = useCaseStore();
  const caseId = useCaseStore(state => state.case_id);
  const citations = useCaseStore(state => state.citations);
  const documents = useCaseStore(state => state.documents);
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isChallengeMode, setIsChallengeMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isEditingPayout, setIsEditingPayout] = useState(false);
  const [overrideData, setOverrideData] = useState<any>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [activeCitationSection, setActiveCitationSection] = useState<BlackboardSection | null>(null);
  const [activeEvidenceCitation, setActiveEvidenceCitation] = useState<Citation | null>(null);
  const audio_urls = useCaseStore(state => state.audio_urls);
  const isSyncing = status === CaseStatus.RUNNING;
  const isAwaitingApproval = status === CaseStatus.AWAITING_APPROVAL || status === CaseStatus.ESCALATED;

  const sectionCitationCount = (section: BlackboardSection) =>
    (citations?.[section] ?? []).length;
  const openCitations = (section: BlackboardSection) => setActiveCitationSection(section);
  const activeCitations = activeCitationSection ? (citations?.[activeCitationSection] ?? []) : [];
  const activeTitle = activeCitationSection ? (SECTION_TITLES[activeCitationSection] ?? activeCitationSection) : "";

  // SSE for chat is now handled globally in SseClient via the main stream
  // This ensures no messages are missed when switching between Blackboard/Chat modes.

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setIsSending(true);
        try {
          const result = await api.transcribeAudio(blob);
          setMessage(prev => (prev ? prev + " " : "") + result.text);
        } catch (err) {
          console.error("STT failed:", err);
        } finally {
          setIsSending(false);
        }
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone access denied:", err);
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
  };

  const playAudio = (url: string) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "";
    const audio = new Audio(`${baseUrl}${url}`);
    audio.play();
  };

  const handleSendMessage = async () => {
    if (!message.trim() || isSending || !caseId) return;

    const currentMessage = message;
    setMessage("");
    setIsSending(true);

    try {
      // Optimistic update
      addOfficerMessage({
        message_id: `temp-${Date.now()}`,
        role: "officer",
        message: currentMessage,
        timestamp: new Date().toISOString()
      });

      if (isChallengeMode) {
        await api.sendMessage(caseId, currentMessage);
        // The clarification or rerun ack will be delivered via the global SSE stream
      } else {
        await api.sendChatMessage(caseId, currentMessage, selectedAgentId || undefined);
        // AI Strategist replies are also delivered via SSE
      }
    } catch (err) {
      console.error("Failed to send message:", err);
      // Could add an error message to the chat here
    } finally {
      setIsSending(false);
    }
  };

  const renderCaseFacts = (data: any) => {
    const tagged = data.tagged_documents ? Object.values(data.tagged_documents) as string[] : [];
    const missing = data.missing_documents || [];

    return (
      <OutputCard title="Intake Validation" icon={<FileKey className="w-4 h-4" />} status="success">
        <Field label="Processed Documents" value={tagged.length} />
        {missing.length > 0 && (
          <div className="mt-2 p-2 bg-semantic-danger/10 rounded border border-semantic-danger/20">
            <span className="text-[9px] text-semantic-danger font-bold uppercase tracking-wider block mb-1">Missing</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {missing.map((m: string) => <Tag key={m}>{m}</Tag>)}
            </div>
          </div>
        )}
        {tagged.length > 0 && (
          <div className="mt-2">
            <span className="text-[9px] text-neutral-text-tertiary font-bold uppercase tracking-wider block mb-1">Tags Found</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {tagged.map((t: string, i: number) => <Tag key={i}>{t}</Tag>)}
            </div>
          </div>
        )}
      </OutputCard>
    );
  };

  const renderPolicyVerdict = (data: any) => (
    <OutputCard
      title="Policy Verdict"
      icon={<ShieldCheck className="w-4 h-4" />}
      status="success"
      citationCount={sectionCitationCount(BlackboardSection.POLICY_VERDICT)}
      onCitationClick={() => openCitations(BlackboardSection.POLICY_VERDICT)}
    >
      <Field label="Claim Type" value={<Badge variant="secondary">{data.claim_type || "N/A"}</Badge>} />
      <div className="grid grid-cols-2 gap-3 mt-2">
        <Field label="Max Payout" value={data.max_payout_myr != null ? `RM ${data.max_payout_myr.toLocaleString()}` : "N/A"} />
        <Field label="Excess" value={data.excess_myr != null ? `RM ${data.excess_myr.toLocaleString()}` : "N/A"} />
      </div>
      <Field label="Depreciation" value={data.depreciation_percent != null ? `${data.depreciation_percent}%` : "N/A"} />
    </OutputCard>
  );

  const renderLiabilityVerdict = (data: any) => {
    const insured = data.fault_split?.insured || 0;
    const thirdParty = data.fault_split?.third_party || 0;

    return (
      <OutputCard
        title="Liability Verdict"
        icon={<Scale className="w-4 h-4" />}
        status="success"
        citationCount={sectionCitationCount(BlackboardSection.LIABILITY_VERDICT)}
        onCitationClick={() => openCitations(BlackboardSection.LIABILITY_VERDICT)}
      >
        {data.fault_split && (
          <Field label="Fault Split" value={<LiabilityBar claimant={insured} thirdParty={thirdParty} />} />
        )}
        <Field label="Incident Details" value={
          <div className="text-[11px] text-neutral-text-primary mt-1">
            <div><span className="font-semibold">Time:</span> {data.incident_time || "N/A"}</div>
            <div><span className="font-semibold">Location:</span> {data.location || "N/A"}</div>
            <div className="italic text-neutral-text-secondary mt-1">{data.description || "No narrative found."}</div>
          </div>
        } />
        <Field label="Point of Impact" value={
          <div className="flex items-center space-x-2 mt-1">
            <Badge variant="outline">{data.poi_location || "N/A"}</Badge>
            <span className="text-[10px] text-neutral-text-tertiary">Severity: {data.damage_severity || "N/A"}</span>
          </div>
        } />
      </OutputCard>
    );
  };

  const renderFraudAssessment = (data: any) => (
    <OutputCard
      title="Fraud Assessment"
      icon={<AlertTriangle className="w-4 h-4" />}
      status={data.suspicion_score > 0.5 ? "danger" : "success"}
      citationCount={sectionCitationCount(BlackboardSection.FRAUD_ASSESSMENT)}
      onCitationClick={() => openCitations(BlackboardSection.FRAUD_ASSESSMENT)}
    >
      <div className="flex items-baseline justify-between">
        <Field label="Risk Score" value={<span className="text-lg font-mono">{data.suspicion_score?.toFixed(2)}</span>} />
        <Badge variant={data.suspicion_score > 0.5 ? "distructive" : "success"}>
          {data.suspicion_score > 0.5 ? "High Risk" : "Low Risk"}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-1 mt-2">
        {data.red_flags?.map((f: string) => <Tag key={f}>{f}</Tag>)}
      </div>
    </OutputCard>
  );

  const renderPayoutRecommendation = (data: any) => {
    const breakdown = data.payout_breakdown;
    const isEscalated = data.status === "escalated" || data.recommended_action === "escalate";
    const missingFields: string[] = data.missing_fields || [];

    const handleSaveOverride = async () => {
      if (!caseId || !overrideData) return;
      setIsSending(true);
      try {
        // Recalculate final payout based on overrides
        const total = (overrideData.verified_parts || 0) + (overrideData.verified_labour || 0) + (overrideData.verified_paint || 0) + (overrideData.verified_towing || 0);
        const depr = total * ((overrideData.depreciation_percent || 0) / 100);
        const adjusted = total - depr;
        const final = Math.max(adjusted - (overrideData.excess_deducted_myr || 0), 0);

        const updatedBreakdown = {
          ...overrideData,
          repair_estimate_myr: total,
          depreciation_deducted_myr: depr,
          liability_adjusted_myr: adjusted,
          final_payout_myr: final,
        };

        const updatedPayout = {
          ...data,
          payout_breakdown: updatedBreakdown,
          status: "approved_manual",
          rationale: "Manual override by officer."
        };

        await api.updateBlackboardSection(caseId, BlackboardSection.PAYOUT_RECOMMENDATION, updatedPayout);
        // Update local store
        useCaseStore.getState().handleAgentOutput({
          agent: AgentId.PAYOUT,
          case_id: caseId,
          timestamp: new Date().toISOString(),
          section: BlackboardSection.PAYOUT_RECOMMENDATION,
          data: updatedPayout
        } as SseAgentOutput);
        setIsEditingPayout(false);
      } catch (err) {
        console.error("Failed to save override:", err);
      } finally {
        setIsSending(false);
      }
    };

    if (isEditingPayout && overrideData) {
      return (
        <OutputCard title="Manual Payout Override" icon={<Edit3 className="w-4 h-4" />} status="warning">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[9px] uppercase font-bold text-neutral-text-tertiary">Parts (RM)</label>
                <input
                  type="number"
                  value={overrideData.verified_parts}
                  onChange={e => setOverrideData({ ...overrideData, verified_parts: parseFloat(e.target.value) })}
                  className="w-full bg-neutral-background border border-neutral-border rounded p-1.5 text-xs text-neutral-text-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] uppercase font-bold text-neutral-text-tertiary">Labour (RM)</label>
                <input
                  type="number"
                  value={overrideData.verified_labour}
                  onChange={e => setOverrideData({ ...overrideData, verified_labour: parseFloat(e.target.value) })}
                  className="w-full bg-neutral-background border border-neutral-border rounded p-1.5 text-xs text-neutral-text-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] uppercase font-bold text-neutral-text-tertiary">Paint (RM)</label>
                <input
                  type="number"
                  value={overrideData.verified_paint}
                  onChange={e => setOverrideData({ ...overrideData, verified_paint: parseFloat(e.target.value) })}
                  className="w-full bg-neutral-background border border-neutral-border rounded p-1.5 text-xs text-neutral-text-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] uppercase font-bold text-neutral-text-tertiary">Towing (RM)</label>
                <input
                  type="number"
                  value={overrideData.verified_towing}
                  onChange={e => setOverrideData({ ...overrideData, verified_towing: parseFloat(e.target.value) })}
                  className="w-full bg-neutral-background border border-neutral-border rounded p-1.5 text-xs text-neutral-text-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] uppercase font-bold text-neutral-text-tertiary">Excess (RM)</label>
                <input
                  type="number"
                  value={overrideData.excess_deducted_myr}
                  onChange={e => setOverrideData({ ...overrideData, excess_deducted_myr: parseFloat(e.target.value) })}
                  className="w-full bg-neutral-background border border-neutral-border rounded p-1.5 text-xs text-neutral-text-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] uppercase font-bold text-neutral-text-tertiary">Depreciation (%)</label>
                <input
                  type="number"
                  value={overrideData.depreciation_percent || 0}
                  onChange={e => setOverrideData({ ...overrideData, depreciation_percent: parseFloat(e.target.value) })}
                  className="w-full bg-neutral-background border border-neutral-border rounded p-1.5 text-xs text-neutral-text-primary"
                />
              </div>
            </div>
            <div className="flex space-x-2 pt-2">
              <Button size="sm" variant="default" className="flex-1 bg-brand-primary text-black" onClick={handleSaveOverride} disabled={isSending}>
                {isSending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save Changes"}
              </Button>
              <Button size="sm" variant="secondary" className="flex-1" onClick={() => setIsEditingPayout(false)} disabled={isSending}>
                Cancel
              </Button>
            </div>
          </div>
        </OutputCard>
      );
    }

    // Human-readable labels for missing fields
    const fieldLabels: Record<string, string> = {
      "excess_myr": "Policy Excess (deductible amount the insured must pay)",
      "verified_total": "Verified Damage Total (from workshop quotation audit)",
    };

    if (isEscalated) {
      return (
        <OutputCard title="Payout Recommendation" icon={<Landmark className="w-4 h-4" />} status="danger">
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-semantic-danger flex-shrink-0" />
              <span className="text-xs font-bold text-semantic-danger uppercase tracking-wider">Escalated — Missing Data</span>
            </div>

            <p className="text-[11px] text-neutral-text-secondary leading-relaxed">
              {data.rationale || "The payout engine cannot compute a final amount because required data is missing from upstream analysis."}
            </p>

            {missingFields.length > 0 && (
              <div className="p-2.5 bg-semantic-danger/5 rounded border border-semantic-danger/15 space-y-1.5">
                <span className="text-[9px] text-semantic-danger font-bold uppercase tracking-wider block">Missing Fields</span>
                {missingFields.map((field: string) => (
                  <div key={field} className="flex items-start space-x-1.5">
                    <span className="text-semantic-danger text-[10px] mt-0.5">•</span>
                    <div>
                      <span className="text-[11px] font-semibold text-neutral-text-primary font-mono">{field}</span>
                      {fieldLabels[field] && (
                        <span className="text-[10px] text-neutral-text-tertiary ml-1">— {fieldLabels[field]}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-1">
              <p className="text-[10px] text-neutral-text-tertiary italic">
                Upload the missing document(s) via the Manage Hub, or approve manually to override with safe defaults.
              </p>
            </div>
          </div>
        </OutputCard>
      );
    }

    return (
      <OutputCard title="Payout Recommendation" icon={<Landmark className="w-4 h-4" />} status="success">
        {breakdown ? (
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="text-neutral-text-secondary">Repair Estimate</span>
              <span className="font-semibold text-neutral-text-primary">RM {breakdown.repair_estimate_myr?.toLocaleString() || 0}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-neutral-text-tertiary italic">Depreciation</span>
              <span className="text-semantic-danger/80">- RM {breakdown.depreciation_deducted_myr?.toLocaleString() || 0}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-neutral-text-tertiary italic">Excess</span>
              <span className="text-semantic-danger/80">- RM {breakdown.excess_deducted_myr?.toLocaleString() || 0}</span>
            </div>
            <div className="border-t border-neutral-border pt-2 mt-2 flex justify-between items-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-text-secondary">Final Payout</span>
              <span className="text-sm font-bold text-brand-primary">RM {breakdown.final_payout_myr?.toLocaleString() || 0}</span>
            </div>

            {isAwaitingApproval && !isEditingPayout && (
              <div className="pt-3 border-t border-neutral-border/50 mt-3">
                <button
                  onClick={() => {
                    setOverrideData({
                      verified_parts: breakdown.verified_parts || 0,
                      verified_labour: breakdown.verified_labour || 0,
                      verified_paint: breakdown.verified_paint || 0,
                      verified_towing: breakdown.verified_towing || 0,
                      excess_deducted_myr: breakdown.excess_deducted_myr || 0,
                      depreciation_percent: 0 // Default to re-calculate
                    });
                    setIsEditingPayout(true);
                  }}
                  className="w-full py-1.5 border border-brand-primary/30 text-brand-primary rounded-md text-[10px] font-bold uppercase tracking-widest hover:bg-brand-primary/10 transition-colors flex items-center justify-center"
                >
                  <Edit3 className="w-3 h-3 mr-2" />
                  Override Calculations
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-[11px] text-neutral-text-secondary italic">
            {data.rationale || "Calculating final payout..."}
          </div>
        )}
      </OutputCard>
    );
  };

  const renderDamageResult = (data: any) => (
    <OutputCard
      title="Damage Assessment"
      icon={<Wrench className="w-4 h-4" />}
      status={data.suspicious_parts?.length > 0 ? "warning" : "success"}
      citationCount={sectionCitationCount(BlackboardSection.DAMAGE_RESULT)}
      onCitationClick={() => openCitations(BlackboardSection.DAMAGE_RESULT)}
    >
      <Field label="Verified Estimate" value={data.verified_total != null ? `RM ${data.verified_total.toLocaleString()}` : "N/A"} />
      {data.suspicious_parts?.length > 0 && (
        <div className="mt-2">
          <span className="text-[9px] text-semantic-warning font-bold uppercase tracking-wider block mb-1">Suspicious Parts</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {data.suspicious_parts.map((p: string) => <Tag key={p}>{p}</Tag>)}
          </div>
        </div>
      )}
    </OutputCard>
  );

  const renderAuditResult = (data: any) => {
    const isInconsistent = data.is_consistent === false || data.status === "error";
    const target = data.target_cluster && data.target_cluster !== "none" ? data.target_cluster : null;
    return (
      <OutputCard
        title="Auditor Findings"
        icon={<Gavel className="w-4 h-4" />}
        status={isInconsistent ? "warning" : "success"}
        citationCount={sectionCitationCount(BlackboardSection.AUDIT_RESULT)}
        onCitationClick={() => openCitations(BlackboardSection.AUDIT_RESULT)}
      >
        <Field
          label="Consistency"
          value={
            <Badge variant={isInconsistent ? "distructive" : "success"}>
              {isInconsistent ? "Inconsistent" : "Consistent"}
            </Badge>
          }
        />
        <Field label="Findings" value={<span className="text-[11px] leading-relaxed">{data.findings || "No issues."}</span>} />
        <div className="grid grid-cols-2 gap-3 mt-1">
          <Field label="Suggested Action" value={<Badge variant="outline">{data.suggested_action || "N/A"}</Badge>} />
          {target && <Field label="Target Cluster" value={<Badge variant="outline">{target}</Badge>} />}
        </div>
      </OutputCard>
    );
  };

  const renderArtifacts = () => {
    if (!artifacts || artifacts.length === 0) return null;

    const activeArtifacts = artifacts.filter(a => !a.superseded);

    return (
      <OutputCard title="Claim Artifacts" icon={<FileKey className="w-4 h-4" />} status="success">
        <div className="space-y-2">
          {activeArtifacts.map((art, idx) => (
            <a
              key={idx}
              href={art.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-2 rounded-md border border-neutral-border bg-neutral-background hover:border-brand-primary transition-colors group"
            >
              <div className="flex items-center space-x-2 overflow-hidden">
                <FileKey className="w-3.5 h-3.5 text-brand-primary" />
                <div className="flex flex-col overflow-hidden">
                  <span className="text-[11px] font-medium text-neutral-text-primary truncate">{art.filename}</span>
                  <span className="text-[9px] text-neutral-text-tertiary uppercase">v{art.version} • {art.artifact_type.replace('_', ' ')}</span>
                </div>
              </div>
              <ArrowUp className="w-3 h-3 rotate-90 text-neutral-text-tertiary group-hover:text-brand-primary transition-colors" />
            </a>
          ))}
        </div>
      </OutputCard>
    );
  };

  return (
    <div className="flex flex-col h-full bg-neutral-surface overflow-hidden">
      {/* Mode Toggle Header */}
      <div className="px-6 py-4 border-b border-neutral-border flex-shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-neutral-text-primary uppercase tracking-widest">
            {mode === 'blackboard' ? 'Blackboard' : 'SettleOps AI'}
          </h2>
          <div className="relative flex bg-neutral-surface border border-neutral-border rounded-lg p-1">
            {/* Sliding Background Pill */}
            <div
              className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-brand-primary rounded-md transition-all duration-300 ease-in-out ${mode === 'blackboard' ? 'translate-x-0' : 'translate-x-full'}`}
              style={{ left: '4px' }}
            />

            <button
              onClick={() => setMode('blackboard')}
              className={`relative z-10 p-1.5 px-2.5 rounded-md transition-colors duration-300 ${mode === 'blackboard' ? 'text-black' : 'text-neutral-text-tertiary hover:text-neutral-text-secondary'}`}
              title="Blackboard Mode"
            >
              <LayoutList className="w-4 h-4" />
            </button>
            <button
              onClick={() => setMode('chat')}
              className={`relative z-10 p-1.5 px-2.5 rounded-md transition-colors duration-300 ${mode === 'chat' ? 'text-black' : 'text-neutral-text-tertiary hover:text-neutral-text-secondary'}`}
              title="AI Chat Mode"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        {mode === 'blackboard' ? (
          <div className="flex flex-col">
            {blackboard[BlackboardSection.CASE_FACTS] ? renderCaseFacts(blackboard[BlackboardSection.CASE_FACTS]) : (isSyncing && <BlackboardSkeleton />)}
            {blackboard[BlackboardSection.POLICY_VERDICT] ? renderPolicyVerdict(blackboard[BlackboardSection.POLICY_VERDICT]) : (isSyncing && blackboard[BlackboardSection.CASE_FACTS] && <BlackboardSkeleton />)}
            {blackboard[BlackboardSection.LIABILITY_VERDICT] && renderLiabilityVerdict(blackboard[BlackboardSection.LIABILITY_VERDICT])}
            {blackboard[BlackboardSection.DAMAGE_RESULT] && renderDamageResult(blackboard[BlackboardSection.DAMAGE_RESULT])}
            {blackboard[BlackboardSection.FRAUD_ASSESSMENT] && renderFraudAssessment(blackboard[BlackboardSection.FRAUD_ASSESSMENT])}
            {blackboard[BlackboardSection.PAYOUT_RECOMMENDATION] && renderPayoutRecommendation(blackboard[BlackboardSection.PAYOUT_RECOMMENDATION])}
            {blackboard[BlackboardSection.AUDIT_RESULT] && renderAuditResult(blackboard[BlackboardSection.AUDIT_RESULT])}
            {renderArtifacts()}

            {!Object.keys(blackboard).length && !isSyncing && (
              <div className="flex-1 flex flex-col items-center justify-center text-neutral-text-tertiary opacity-40 py-20 text-center">
                <Info className="w-12 h-12 mb-4" />
                <p className="text-sm font-medium">Awaiting Agent Output</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Chat Interface */}
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 mb-4 pr-1">
              {officer_messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-10">
                  <Bot className="w-10 h-10 text-neutral-text-tertiary opacity-20 mb-3" />
                  <p className="text-xs text-neutral-text-tertiary font-medium">AI Strategist Ready</p>
                  <p className="text-[10px] text-neutral-text-tertiary/60 max-w-[180px] mt-1">
                    Ask for analysis, or use the "Modify" button to challenge agent findings.
                  </p>
                </div>
              ) : (
                officer_messages.map((msg) => (
                  <div
                    key={msg.message_id}
                    className={`flex items-start space-x-3 ${msg.role === 'officer' ? 'justify-end' : ''}`}
                  >
                    {msg.role !== 'officer' && (
                      <div className="w-7 h-7 rounded-full bg-brand-primary flex items-center justify-center flex-shrink-0">
                        <Bot className="w-3.5 h-3.5 text-black" />
                      </div>
                    )}

                    <div className={`p-2.5 rounded-xl max-w-[85%] shadow-sm ${msg.role === 'officer'
                        ? 'bg-brand-primary/10 rounded-tr-none'
                        : 'bg-neutral-surface border border-neutral-border rounded-tl-none'
                      }`}>
                      <MarkdownRenderer
                        content={msg.message}
                        className={`text-[11px] leading-relaxed ${msg.role === 'officer' ? 'text-neutral-text-primary' : 'text-neutral-text-primary'
                          }`}
                      />
                      {msg.role === 'system' && audio_urls[msg.message] && (
                        <button
                          onClick={() => playAudio(audio_urls[msg.message])}
                          className="mt-2 p-1 rounded-md bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary transition-colors flex items-center space-x-1"
                        >
                          <Volume2 className="w-3 h-3" />
                          <span className="text-[9px] font-bold uppercase tracking-widest">Listen</span>
                        </button>
                      )}
                      <div className={`text-[8px] mt-1 uppercase tracking-tighter opacity-40 ${msg.role === 'officer' ? 'text-right' : ''}`}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>

                    {msg.role === 'officer' && (
                      <div className="w-7 h-7 rounded-full bg-neutral-surface border border-neutral-border flex items-center justify-center flex-shrink-0">
                        <User className="w-3.5 h-3.5 text-neutral-text-primary" />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Chat Input */}
            <div className="sticky bottom-0 bg-neutral-background pt-2 border-t border-neutral-border/50">
              <div className="flex items-center space-x-2 mb-2">
                <button
                  type="button"
                  onClick={() => setIsChallengeMode(false)}
                  className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-colors ${!isChallengeMode ? 'bg-brand-primary text-black' : 'bg-neutral-surface text-neutral-text-tertiary hover:text-neutral-text-secondary'}`}
                >
                  Ask Strategist
                </button>
                <button
                  type="button"
                  onClick={() => setIsChallengeMode(true)}
                  className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-colors ${isChallengeMode ? 'bg-semantic-warning text-black' : 'bg-neutral-surface text-neutral-text-tertiary hover:text-neutral-text-secondary'}`}
                >
                  Challenge Analysis
                </button>

                {selectedAgentId && (
                  <div className="flex items-center gap-1.5 ml-auto animate-in fade-in slide-in-from-right-2">
                    <span className="text-[9px] text-neutral-text-tertiary font-bold uppercase tracking-widest">Targeting:</span>
                    <Badge variant="outline" className="bg-indigo-500/10 text-indigo-400 border-indigo-500/30 text-[9px] px-1.5 py-0 capitalize flex items-center gap-1">
                      <Bot className="w-2.5 h-2.5" />
                      {selectedAgentId}
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedAgentId(null); }}
                        className="ml-1 hover:text-white transition-colors"
                      >
                        ×
                      </button>
                    </Badge>
                  </div>
                )}
              </div>
              <form
                onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
                className="relative"
              >
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={isChallengeMode ? "Enter instruction for surgical rerun..." : "Ask strategist about the claim..."}
                  disabled={isSending || isRecording}
                  className={`w-full bg-neutral-surface border rounded-lg pl-3 pr-20 py-2.5 text-xs text-neutral-text-primary focus:outline-none transition-colors disabled:opacity-50 ${isChallengeMode ? 'border-semantic-warning/50 focus:border-semantic-warning' : 'border-neutral-border focus:border-brand-primary/50'}`}
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                  <button
                    type="button"
                    onClick={isRecording ? handleStopRecording : handleStartRecording}
                    disabled={isSending}
                    className={`p-1.5 rounded-md transition-colors shadow-sm ${isRecording ? 'bg-semantic-danger text-white animate-pulse' : 'bg-neutral-background text-neutral-text-tertiary hover:text-brand-primary'}`}
                  >
                    {isRecording ? <Square className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="submit"
                    disabled={isSending || isRecording || !message.trim()}
                    className={`p-1.5 rounded-md transition-colors shadow-sm disabled:opacity-50 ${isChallengeMode ? 'bg-semantic-warning text-black hover:bg-semantic-warning/90' : 'bg-brand-primary text-black hover:bg-brand-primary/90'}`}
                  >
                    {isSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUp className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      <CitationPanel
        title={activeTitle}
        citations={activeCitations}
        documents={documents}
        isOpen={activeCitationSection !== null}
        onClose={() => setActiveCitationSection(null)}
        onViewEvidence={(c) => setActiveEvidenceCitation(c)}
      />
      <CitationEvidenceModal
        citation={activeEvidenceCitation}
        documents={documents}
        onClose={() => setActiveEvidenceCitation(null)}
      />
    </div>
  )
}
