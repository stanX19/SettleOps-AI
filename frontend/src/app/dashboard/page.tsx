"use client";

import React, { useState, useEffect } from "react";
import {
  Search,
  Filter,
  ChevronDown,
  MoreHorizontal,
  AlertCircle,
  CheckCircle2,
  Clock,
  User,
  ArrowUpRight,
  Plus,
  Loader2
} from "lucide-react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { CaseListItem, CaseStatus } from "@/lib/types";

type DisplayStatus = "In Progress" | "Pending Review" | "Awaiting Docs" | "Completed" | "Escalated" | "Draft" | "Failed";

function mapCaseStatus(status: CaseStatus): DisplayStatus {
  switch (status) {
    case CaseStatus.RUNNING:
    case CaseStatus.SUBMITTED:
      return "In Progress";
    case CaseStatus.AWAITING_APPROVAL:
      return "Pending Review";
    case CaseStatus.AWAITING_DOCS:
      return "Awaiting Docs";
    case CaseStatus.APPROVED:
      return "Completed";
    case CaseStatus.ESCALATED:
      return "Escalated";
    case CaseStatus.DECLINED:
    case CaseStatus.FAILED:
      return "Failed";
    case CaseStatus.DRAFT:
      return "Draft";
    default:
      return "In Progress";
  }
}

function mapPriority(status: CaseStatus): "Low" | "Medium" | "High" | "Critical" {
  if (status === CaseStatus.ESCALATED) return "Critical";
  if (status === CaseStatus.AWAITING_APPROVAL) return "High";
  if (status === CaseStatus.RUNNING) return "Medium";
  return "Low";
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCases = async () => {
      try {
        const data = await api.listCases();
        setCases(data);
      } catch (err) {
        console.error("Failed to fetch cases:", err);
        setError("Could not load cases from backend. Showing empty state.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchCases();
  }, []);

  const handleNewClaim = async () => {
    try {
      const { case_id } = await api.initiateDraftCase();
      router.push(`/workflow/${case_id}/manage`);
    } catch (err) {
      console.error("Failed to create new claim:", err);
      alert("Could not initialize a new claim. Please ensure the backend is running.");
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-neutral-background p-6 overflow-y-auto custom-scrollbar">
      {/* Header Section */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-2xl font-bold text-neutral-text-primary mb-2">Claims Queue</h1>
          <p className="text-neutral-text-secondary text-sm">Monitor and manage all active insurance claims in real-time.</p>
        </div>

        <button
          id="new-claim-button"
          onClick={handleNewClaim}
          className="flex items-center space-x-2 bg-brand-primary hover:bg-brand-primary-hover text-brand-on-primary px-4 py-2 rounded-md font-medium transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>New Claim</span>
        </button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Claims" value={String(cases.length)} trend="" />
        <StatCard label="Pending Review" value={String(cases.filter(c => c.status === CaseStatus.AWAITING_APPROVAL).length)} trend="" warning />
        <StatCard label="In Progress" value={String(cases.filter(c => c.status === CaseStatus.RUNNING).length)} trend="" />
        <StatCard label="Escalated" value={String(cases.filter(c => c.status === CaseStatus.ESCALATED).length)} trend="" danger />
      </div>

      {/* Claims Table */}
      <div className="bg-neutral-surface border border-neutral-border rounded-lg overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-brand-primary" />
            <span className="ml-3 text-sm text-neutral-text-secondary">Loading claims…</span>
          </div>
        ) : cases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertCircle className="w-8 h-8 text-neutral-text-tertiary mb-3 opacity-40" />
            <p className="text-sm text-neutral-text-secondary mb-1">
              {error || "No claims found."}
            </p>
            <p className="text-xs text-neutral-text-tertiary">Create a new claim to get started.</p>
          </div>
        ) : (
          <>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-background/50 border-b border-neutral-border">
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-text-tertiary uppercase tracking-wider">Case ID</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-text-tertiary uppercase tracking-wider">Submitted</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-text-tertiary uppercase tracking-wider">Current Agent</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-text-tertiary uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-text-tertiary uppercase tracking-wider">Priority</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-text-tertiary uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-border">
                {cases.map((c) => (
                  <tr
                    key={c.case_id}
                    onClick={() => router.push(`/workflow/${c.case_id}`)}
                    className="hover:bg-neutral-background/30 transition-colors group cursor-pointer"
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs font-medium text-brand-primary">{c.case_id}</span>
                        <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-neutral-text-tertiary" />
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-neutral-text-secondary">
                      <div className="flex items-center space-x-1.5">
                        <Clock className="w-3.5 h-3.5 text-neutral-text-tertiary" />
                        <span>{formatTimeAgo(c.submitted_at)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-neutral-text-secondary">
                      <span className="font-mono text-xs">{c.current_agent || "—"}</span>
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge status={mapCaseStatus(c.status)} />
                    </td>
                    <td className="px-4 py-4">
                      <PriorityIndicator priority={mapPriority(c.status)} />
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className="p-1 hover:bg-neutral-background rounded-md transition-colors text-neutral-text-tertiary hover:text-neutral-text-primary"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="px-4 py-3 bg-neutral-background/20 border-t border-neutral-border flex items-center justify-between">
              <span className="text-xs text-neutral-text-tertiary">Showing {cases.length} claim{cases.length !== 1 ? "s" : ""}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, trend, warning, danger, success }: {
  label: string;
  value: string;
  trend: string;
  warning?: boolean;
  danger?: boolean;
  success?: boolean;
}) {
  return (
    <div className="bg-neutral-surface border border-neutral-border rounded-lg p-4 shadow-sm">
      <p className="text-xs font-medium text-neutral-text-tertiary uppercase tracking-wider mb-1">{label}</p>
      <div className="flex items-baseline justify-between">
        <h3 className="text-2xl font-bold text-neutral-text-primary">{value}</h3>
        <span className={`text-xs font-medium ${danger ? 'text-semantic-danger' :
          success ? 'text-semantic-success' :
            warning ? 'text-semantic-warning' :
              'text-semantic-success'
          }`}>
          {trend}
        </span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: DisplayStatus }) {
  const styles: Record<DisplayStatus, string> = {
    "In Progress": "bg-semantic-info/10 text-semantic-info border-semantic-info/20",
    "Pending Review": "bg-semantic-warning/10 text-semantic-warning border-semantic-warning/20",
    "Awaiting Docs": "bg-neutral-text-tertiary/10 text-neutral-text-secondary border-neutral-text-tertiary/20",
    "Completed": "bg-semantic-success/10 text-semantic-success border-semantic-success/20",
    "Escalated": "bg-semantic-danger/10 text-semantic-danger border-semantic-danger/20",
    "Draft": "bg-neutral-text-tertiary/10 text-neutral-text-tertiary border-neutral-text-tertiary/20",
    "Failed": "bg-semantic-danger/10 text-semantic-danger border-semantic-danger/20",
  };

  const icons: Record<DisplayStatus, React.ReactNode> = {
    "In Progress": <Clock className="w-3 h-3 mr-1" />,
    "Pending Review": <AlertCircle className="w-3 h-3 mr-1" />,
    "Awaiting Docs": <Clock className="w-3 h-3 mr-1" />,
    "Completed": <CheckCircle2 className="w-3 h-3 mr-1" />,
    "Escalated": <AlertCircle className="w-3 h-3 mr-1" />,
    "Draft": <Clock className="w-3 h-3 mr-1" />,
    "Failed": <AlertCircle className="w-3 h-3 mr-1" />,
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${styles[status] || styles["In Progress"]}`}>
      {icons[status]}
      {status}
    </span>
  );
}

function PriorityIndicator({ priority }: { priority: "Low" | "Medium" | "High" | "Critical" }) {
  const dots = {
    "Low": 1,
    "Medium": 2,
    "High": 3,
    "Critical": 4,
  };

  const color = {
    "Low": "bg-neutral-text-tertiary",
    "Medium": "bg-semantic-info",
    "High": "bg-semantic-warning",
    "Critical": "bg-semantic-danger animate-pulse",
  };

  return (
    <div className="flex flex-col space-y-1">
      <div className="flex space-x-0.5">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className={`w-3 h-1 rounded-full ${i < dots[priority] ? color[priority] : 'bg-neutral-border'}`}
          />
        ))}
      </div>
      <span className="text-[10px] font-medium text-neutral-text-tertiary uppercase tracking-tight">
        {priority}
      </span>
    </div>
  );
}

