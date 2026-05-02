"use client";

import React, { useState, useEffect, useMemo } from "react";

const ROWS_PER_PAGE = 10;
import {
  Search,
  Filter,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  User,
  ArrowUpRight,
  Plus,
  Loader2,
  Eye,
  FolderOpen,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { CaseListItem, CaseStatus, AgentId } from "@/lib/types";
import { Toast } from "@/components/primitives/Toast";

type DisplayStatus = "In Progress" | "Pending Review" | "Awaiting Docs" | "Approved" | "Escalated" | "Draft" | "Failed";

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
      return "Approved";
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

// Mock prefix is intentionally distinct from the backend's "CLM-YYYY-NNNNN" pattern
// so we can reliably tell mock cases apart from real ones.
const MOCK_PREFIX = "MOCK-";

const MOCK_CASES: CaseListItem[] = [
  {
    case_id: `${MOCK_PREFIX}2026-0501`,
    status: CaseStatus.AWAITING_APPROVAL,
    submitted_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    current_agent: AgentId.AUDITOR,
  },
  {
    case_id: `${MOCK_PREFIX}2026-0502`,
    status: CaseStatus.RUNNING,
    submitted_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    current_agent: AgentId.LIABILITY,
  },
  {
    case_id: `${MOCK_PREFIX}2026-0503`,
    status: CaseStatus.APPROVED,
    submitted_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    current_agent: null,
  },
  {
    case_id: `${MOCK_PREFIX}2026-0504`,
    status: CaseStatus.ESCALATED,
    submitted_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    current_agent: AgentId.ADJUSTER,
  },
  {
    case_id: `${MOCK_PREFIX}2026-0505`,
    status: CaseStatus.AWAITING_DOCS,
    submitted_at: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    current_agent: AgentId.INTAKE,
  },
];

const isMockCase = (caseId: string) => caseId.startsWith(MOCK_PREFIX);

export default function DashboardPage() {
  const router = useRouter();
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [threshold, setThreshold] = useState(75);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const [mockCasesState, setMockCasesState] = useState<CaseListItem[]>(MOCK_CASES);
  const [currentPage, setCurrentPage] = useState(1);

  // Locally-deleted case IDs — kept out of the table even if polling returns them.
  const [deletedCaseIds, setDeletedCaseIds] = useState<Set<string>>(new Set());
  const [caseToDelete, setCaseToDelete] = useState<CaseListItem | null>(null);

  // Filter out locally-deleted cases first, then paginate
  const visibleCases = useMemo(
    () => cases.filter(c => !deletedCaseIds.has(c.case_id)),
    [cases, deletedCaseIds]
  );

  // Derived pagination data
  const totalPages = Math.max(1, Math.ceil(visibleCases.length / ROWS_PER_PAGE));
  const paginatedCases = useMemo(() => {
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    return visibleCases.slice(start, start + ROWS_PER_PAGE);
  }, [visibleCases, currentPage]);

  // Clamp current page if cases length changes (e.g., after polling)
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  useEffect(() => {
    const fetchCases = async () => {
      try {
        const data = await api.listCases();
        // Filter out any existing mock cases from the backend data just in case,
        // then append our local mock cases state.
        let realCases: CaseListItem[] = [];
        if (Array.isArray(data)) {
          realCases = data.filter(c => !isMockCase(c.case_id));
        } else if (data && typeof data === 'object') {
          // Sometimes APIs wrap lists in an object like { cases: [...] } or return a dict
          const possibleArray = (data as any).cases || Object.values(data);
          if (Array.isArray(possibleArray)) {
            realCases = possibleArray.filter((c: any) => c && c.case_id && !isMockCase(c.case_id));
          }
        }
        setCases([...realCases, ...mockCasesState]);
      } catch (err) {
        console.error("Failed to fetch cases:", err);
        setCases(mockCasesState);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchCases();
    
    // Set up polling to refresh the dashboard table periodically
    // This ensures new claims show up without a page refresh
    const intervalId = setInterval(fetchCases, 5000);
    return () => clearInterval(intervalId);
  }, [mockCasesState]);

  const handleApplySettings = () => {
    // Mock behavior: Change "Pending Review" (AWAITING_APPROVAL) mock cases to "Approved"
    setMockCasesState(prevMock => 
      prevMock.map(c => {
        if (c.status === CaseStatus.AWAITING_APPROVAL) {
          return { ...c, status: CaseStatus.APPROVED, current_agent: null };
        }
        return c;
      })
    );
    setShowSettings(false);
    setToastMessage("Automation threshold applied.");
    setShowToast(false);
    setTimeout(() => setShowToast(true), 10);
  };

  const handleMockAction = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setToastMessage("This is a mock case");
    setShowToast(false);
    // Add a tiny delay to allow the toast to reset if it was already showing
    setTimeout(() => setShowToast(true), 10);
  };

  const handleConfirmDelete = () => {
    if (!caseToDelete) return;
    const id = caseToDelete.case_id;

    if (isMockCase(id)) {
      // Remove from in-memory mock data
      setMockCasesState(prev => prev.filter(c => c.case_id !== id));
    } else {
      // No backend delete endpoint — track locally so polling can't bring it back
      setDeletedCaseIds(prev => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    }

    setCaseToDelete(null);
    setToastMessage(`Case ${id} removed`);
    setShowToast(false);
    setTimeout(() => setShowToast(true), 10);
  };

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
      {/* Delete Confirmation Modal */}
      {caseToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setCaseToDelete(null)}
        >
          <div
            className="bg-neutral-surface border border-neutral-border rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5">
              <div className="flex items-start gap-3 mb-3">
                <div className="shrink-0 w-10 h-10 rounded-full bg-semantic-danger/10 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-semantic-danger" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-neutral-text-primary mb-1">Delete this case?</h3>
                  <p className="text-sm text-neutral-text-secondary leading-relaxed">
                    This will remove <span className="font-mono font-semibold text-neutral-text-primary">{caseToDelete.case_id}</span> from your dashboard. This action cannot be undone.
                  </p>
                </div>
                <button
                  onClick={() => setCaseToDelete(null)}
                  className="shrink-0 p-1 rounded-md hover:bg-neutral-background text-neutral-text-tertiary hover:text-neutral-text-primary transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 bg-neutral-background/40 border-t border-neutral-border">
              <button
                onClick={() => setCaseToDelete(null)}
                className="px-4 py-1.5 rounded-md text-sm font-medium text-neutral-text-primary border border-neutral-border bg-neutral-surface hover:bg-neutral-background transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium text-white bg-semantic-danger hover:bg-semantic-danger/90 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header Section */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-2xl font-bold text-neutral-text-primary mb-2">Claims Queue Dashboard</h1>
          <p className="text-neutral-text-secondary text-sm">Monitor and manage all active insurance claims in real-time.</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Settings Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-1.5 bg-neutral-surface border border-neutral-border hover:bg-neutral-background text-neutral-text-primary px-3 py-1.5 rounded-md text-sm font-medium transition-colors shadow-sm"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>Settings</span>
              <span className="bg-neutral-background px-1.5 py-0.5 rounded text-xs font-semibold ml-1">{threshold}%</span>
            </button>

            {showSettings && (
              <div className="absolute top-full right-0 mt-2 w-80 bg-neutral-surface border border-neutral-border rounded-lg shadow-lg z-50 p-4">
                <h3 className="text-sm font-semibold text-neutral-text-primary mb-1">Auto-Decision Threshold</h3>
                <p className="text-xs text-neutral-text-secondary mb-4 leading-relaxed">
                  Cases with AI confidence ≥ {threshold}% are auto-approved/rejected. Below this threshold, cases require human review.
                </p>
                
                <div className="flex items-center justify-between text-xs font-medium text-neutral-text-tertiary mb-2">
                  <span>0%</span>
                  <span className="text-neutral-text-primary font-bold text-sm">{threshold}%</span>
                  <span>100%</span>
                </div>
                
                <div className="relative w-full h-2 bg-neutral-background rounded-full mb-6 flex items-center">
                  <div 
                    className="absolute top-0 left-0 h-full bg-brand-primary rounded-full pointer-events-none" 
                    style={{ width: `calc(${threshold}% + (8px - ${threshold * 0.16}px))` }}
                  ></div>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={threshold}
                    onChange={(e) => setThreshold(parseInt(e.target.value))}
                    className="w-full h-full opacity-0 cursor-pointer absolute inset-0 z-10 m-0 p-0"
                  />
                  <div 
                    className="absolute top-1/2 w-4 h-4 bg-white border-2 border-brand-primary rounded-full shadow pointer-events-none -translate-x-1/2 -translate-y-1/2" 
                    style={{ left: `calc(${threshold}% + (8px - ${threshold * 0.16}px))` }}
                  ></div>
                </div>
                
                <div className="flex items-end justify-between">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-neutral-text-secondary">
                      <div className="w-2 h-2 rounded-full bg-semantic-success"></div>
                      <span>≥ {threshold}% → Auto-decided</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-neutral-text-secondary">
                      <div className="w-2 h-2 rounded-full bg-semantic-warning"></div>
                      <span>&lt; {threshold}% → Human review</span>
                    </div>
                  </div>
                  <button 
                    onClick={handleApplySettings}
                    className="bg-brand-primary hover:bg-brand-primary-hover text-brand-on-primary px-4 py-1.5 rounded-md text-sm font-medium transition-colors"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            id="new-claim-button"
            onClick={handleNewClaim}
            className="flex items-center gap-1.5 bg-brand-primary hover:bg-brand-primary-hover text-brand-on-primary px-3 py-1.5 rounded-md text-sm font-medium transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Claim</span>
          </button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Claims" value={String(visibleCases.length)} trend="" />
        <StatCard label="Pending Review" value={String(visibleCases.filter(c => c.status === CaseStatus.AWAITING_APPROVAL).length)} trend="" warning />
        <StatCard label="In Progress" value={String(visibleCases.filter(c => c.status === CaseStatus.RUNNING).length)} trend="" />
        <StatCard label="Escalated" value={String(visibleCases.filter(c => c.status === CaseStatus.ESCALATED).length)} trend="" danger />
      </div>

      {/* Claims Table */}
      <div className="bg-neutral-surface border border-neutral-border rounded-lg shadow-sm">
        <Toast
          message={toastMessage}
          isVisible={showToast}
          onClose={() => setShowToast(false)}
        />
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-brand-primary" />
            <span className="ml-3 text-sm text-neutral-text-secondary">Loading claims…</span>
          </div>
        ) : visibleCases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <img src="/empty-box.png" alt="Empty Box" className="w-28 h-28 mb-3 opacity-60" />
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
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-text-tertiary uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-text-tertiary uppercase tracking-wider">Priority</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-text-tertiary uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-border">
                {paginatedCases.map((c) => {
                  const isMock = isMockCase(c.case_id);
                  return (
                  <tr
                    key={c.case_id}
                    onClick={(e) => {
                      if (isMock) {
                        handleMockAction(e);
                      } else {
                        router.push(`/workflow/${c.case_id}`);
                      }
                    }}
                    className="hover:bg-neutral-background/30 transition-colors group cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-mono text-sm text-brand-primary">{c.case_id}</span>
                        <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-neutral-text-tertiary" />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-neutral-text-secondary">
                      <div className="flex items-center space-x-1.5">
                        <Clock className="w-3 h-3 text-neutral-text-tertiary" />
                        <span className="text-xs">{formatTimeAgo(c.submitted_at)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={mapCaseStatus(c.status)} />
                    </td>
                    <td className="px-4 py-3">
                      <PriorityIndicator priority={mapPriority(c.status)} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => { 
                            if (isMock) {
                              handleMockAction(e);
                            } else {
                              e.stopPropagation(); 
                              router.push(`/workflow/${c.case_id}`); 
                            }
                          }}
                          className="relative group/tip p-1.5 hover:bg-neutral-background rounded-md transition-colors text-neutral-text-tertiary hover:text-brand-primary"
                        >
                          <Eye className="w-4 h-4" />
                          <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 px-2 py-1 bg-neutral-surface text-neutral-text-primary text-xs rounded shadow-card pointer-events-none opacity-0 group-hover/tip:opacity-100 transition-opacity z-50 border border-neutral-border whitespace-nowrap">
                            View case
                          </div>
                        </button>
                        <button
                          onClick={(e) => { 
                            if (isMock) {
                              handleMockAction(e);
                            } else {
                              e.stopPropagation(); 
                              router.push(`/workflow/${c.case_id}/manage`); 
                            }
                          }}
                          className="relative group/tip p-1.5 hover:bg-neutral-background rounded-md transition-colors text-neutral-text-tertiary hover:text-brand-primary"
                        >
                          <FolderOpen className="w-4 h-4" />
                          <div className="absolute bottom-full mb-1.5 right-0 px-2 py-1 bg-neutral-surface text-neutral-text-primary text-xs rounded shadow-card pointer-events-none opacity-0 group-hover/tip:opacity-100 transition-opacity z-50 border border-neutral-border whitespace-nowrap">
                            Manage evidence
                          </div>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setCaseToDelete(c);
                          }}
                          className="relative group/tip p-1.5 hover:bg-semantic-danger/10 rounded-md transition-colors text-neutral-text-tertiary hover:text-semantic-danger"
                        >
                          <Trash2 className="w-4 h-4" />
                          <div className="absolute bottom-full mb-1.5 right-0 px-2 py-1 bg-neutral-surface text-neutral-text-primary text-xs rounded shadow-card pointer-events-none opacity-0 group-hover/tip:opacity-100 transition-opacity z-50 border border-neutral-border whitespace-nowrap">
                            Delete case
                          </div>
                        </button>
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="px-4 py-3 bg-neutral-background/20 border-t border-neutral-border flex items-center justify-between">
              <span className="text-xs text-neutral-text-tertiary">
                Showing{" "}
                <span className="font-semibold text-neutral-text-secondary">
                  {(currentPage - 1) * ROWS_PER_PAGE + 1}
                  –
                  {Math.min(currentPage * ROWS_PER_PAGE, visibleCases.length)}
                </span>{" "}
                of <span className="font-semibold text-neutral-text-secondary">{visibleCases.length}</span> claim{visibleCases.length !== 1 ? "s" : ""}
              </span>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-neutral-text-secondary border border-neutral-border bg-neutral-surface hover:bg-neutral-background disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev</span>
                </button>

                <div className="flex items-center px-2 text-xs text-neutral-text-tertiary">
                  Page <span className="font-semibold text-neutral-text-primary mx-1">{currentPage}</span> of{" "}
                  <span className="font-semibold text-neutral-text-primary mx-1">{totalPages}</span>
                </div>

                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-neutral-text-secondary border border-neutral-border bg-neutral-surface hover:bg-neutral-background disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
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
    "Approved": "bg-semantic-success/10 text-semantic-success border-semantic-success/20",
    "Escalated": "bg-semantic-danger/10 text-semantic-danger border-semantic-danger/20",
    "Draft": "bg-neutral-text-tertiary/10 text-neutral-text-tertiary border-neutral-text-tertiary/20",
    "Failed": "bg-semantic-danger/10 text-semantic-danger border-semantic-danger/20",
  };

  const icons: Record<DisplayStatus, React.ReactNode> = {
    "In Progress": <Clock className="w-3 h-3 mr-1" />,
    "Pending Review": <AlertCircle className="w-3 h-3 mr-1" />,
    "Awaiting Docs": <Clock className="w-3 h-3 mr-1" />,
    "Approved": <CheckCircle2 className="w-3 h-3 mr-1" />,
    "Escalated": <AlertCircle className="w-3 h-3 mr-1" />,
    "Draft": <Clock className="w-3 h-3 mr-1" />,
    "Failed": <AlertCircle className="w-3 h-3 mr-1" />,
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${styles[status] || styles["In Progress"]}`}>
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
      <div className="flex items-center space-x-0.5 h-1.5">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className={`w-3 h-1 shrink-0 rounded-full ${i < dots[priority] ? color[priority] : 'bg-neutral-border'}`}
          />
        ))}
      </div>
      <span className="text-[10px] font-medium text-neutral-text-tertiary uppercase tracking-tight">
        {priority}
      </span>
    </div>
  );
}

