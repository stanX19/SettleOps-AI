"use client";

import React from "react";
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
  Plus
} from "lucide-react";

interface Claim {
  id: string;
  claimant: string;
  vehicle: string;
  policy: string;
  lossDate: string;
  status: "In Progress" | "Pending Review" | "Awaiting Docs" | "Completed" | "Escalated";
  priority: "Low" | "Medium" | "High" | "Critical";
  assigned: string;
}

const mockClaims: Claim[] = [
  { 
    id: "CLM-29384", 
    claimant: "Alex Rivers", 
    vehicle: "2022 Tesla Model 3", 
    policy: "POL-88219", 
    lossDate: "2h ago", 
    status: "In Progress", 
    priority: "High", 
    assigned: "JD" 
  },
  { 
    id: "CLM-29385", 
    claimant: "Sarah Chen", 
    vehicle: "2021 BMW X5", 
    policy: "POL-77102", 
    lossDate: "5h ago", 
    status: "Pending Review", 
    priority: "Medium", 
    assigned: "SK" 
  },
  { 
    id: "CLM-29386", 
    claimant: "Michael Brown", 
    vehicle: "2023 Ford F-150", 
    policy: "POL-99384", 
    lossDate: "1d ago", 
    status: "Awaiting Docs", 
    priority: "Low", 
    assigned: "JD" 
  },
  { 
    id: "CLM-29387", 
    claimant: "Elena Rodriguez", 
    vehicle: "2020 Honda CR-V", 
    policy: "POL-11203", 
    lossDate: "3d ago", 
    status: "Completed", 
    priority: "Medium", 
    assigned: "AR" 
  },
  { 
    id: "CLM-29388", 
    claimant: "David Kim", 
    vehicle: "2024 Porsche Taycan", 
    policy: "POL-55421", 
    lossDate: "45m ago", 
    status: "Escalated", 
    priority: "Critical", 
    assigned: "SK" 
  },
];

export default function DashboardPage() {
  return (
    <div className="flex flex-col h-full w-full bg-neutral-background p-6 overflow-y-auto custom-scrollbar">
      {/* Header Section */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-2xl font-bold text-neutral-text-primary mb-2">Claims Queue</h1>
          <p className="text-neutral-text-secondary text-sm">Monitor and manage all active insurance claims in real-time.</p>
        </div>
        
        <button className="flex items-center space-x-2 bg-brand-primary hover:bg-brand-primary-hover text-brand-on-primary px-4 py-2 rounded-md font-medium transition-colors shadow-sm">
          <Plus className="w-4 h-4" />
          <span>New Claim</span>
        </button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Claims" value="124" trend="+12%" />
        <StatCard label="Pending Review" value="18" trend="-2" warning />
        <StatCard label="Avg. Cycle Time" value="4.2d" trend="-0.5d" success />
        <StatCard label="Fraud Flagged" value="3" trend="+1" danger />
      </div>

      {/* Claims Table */}
      <div className="bg-neutral-surface border border-neutral-border rounded-lg overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-neutral-background/50 border-b border-neutral-border">
              <th className="px-4 py-3 text-xs font-semibold text-neutral-text-tertiary uppercase tracking-wider">Case ID</th>
              <th className="px-4 py-3 text-xs font-semibold text-neutral-text-tertiary uppercase tracking-wider">Claimant & Vehicle</th>
              <th className="px-4 py-3 text-xs font-semibold text-neutral-text-tertiary uppercase tracking-wider">Policy</th>
              <th className="px-4 py-3 text-xs font-semibold text-neutral-text-tertiary uppercase tracking-wider">Loss Date</th>
              <th className="px-4 py-3 text-xs font-semibold text-neutral-text-tertiary uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-xs font-semibold text-neutral-text-tertiary uppercase tracking-wider">Priority</th>
              <th className="px-4 py-3 text-xs font-semibold text-neutral-text-tertiary uppercase tracking-wider">Assigned</th>
              <th className="px-4 py-3 text-xs font-semibold text-neutral-text-tertiary uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-border">
            {mockClaims.map((claim) => (
              <tr key={claim.id} className="hover:bg-neutral-background/30 transition-colors group cursor-pointer">
                <td className="px-4 py-4">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs font-medium text-brand-primary">{claim.id}</span>
                    <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-neutral-text-tertiary" />
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-neutral-text-primary">{claim.claimant}</span>
                    <span className="text-xs text-neutral-text-tertiary">{claim.vehicle}</span>
                  </div>
                </td>
                <td className="px-4 py-4 text-sm text-neutral-text-secondary">
                  {claim.policy}
                </td>
                <td className="px-4 py-4 text-sm text-neutral-text-secondary">
                  <div className="flex items-center space-x-1.5">
                    <Clock className="w-3.5 h-3.5 text-neutral-text-tertiary" />
                    <span>{claim.lossDate}</span>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <StatusBadge status={claim.status} />
                </td>
                <td className="px-4 py-4">
                  <PriorityIndicator priority={claim.priority} />
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 rounded-full bg-neutral-background border border-neutral-border flex items-center justify-center text-[10px] font-bold text-neutral-text-secondary">
                      {claim.assigned}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 text-right">
                  <button className="p-1 hover:bg-neutral-background rounded-md transition-colors text-neutral-text-tertiary hover:text-neutral-text-primary">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {/* Pagination Mock */}
        <div className="px-4 py-3 bg-neutral-background/20 border-t border-neutral-border flex items-center justify-between">
          <span className="text-xs text-neutral-text-tertiary">Showing 1-5 of 124 claims</span>
          <div className="flex space-x-2">
            <button className="px-2 py-1 text-xs border border-neutral-border rounded disabled:opacity-50" disabled>Prev</button>
            <button className="px-2 py-1 text-xs border border-neutral-border rounded hover:bg-neutral-background">Next</button>
          </div>
        </div>
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
        <span className={`text-xs font-medium ${
          danger ? 'text-semantic-danger' : 
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

function StatusBadge({ status }: { status: Claim["status"] }) {
  const styles = {
    "In Progress": "bg-semantic-info/10 text-semantic-info border-semantic-info/20",
    "Pending Review": "bg-semantic-warning/10 text-semantic-warning border-semantic-warning/20",
    "Awaiting Docs": "bg-neutral-text-tertiary/10 text-neutral-text-secondary border-neutral-text-tertiary/20",
    "Completed": "bg-semantic-success/10 text-semantic-success border-semantic-success/20",
    "Escalated": "bg-semantic-danger/10 text-semantic-danger border-semantic-danger/20",
  };

  const icons = {
    "In Progress": <Clock className="w-3 h-3 mr-1" />,
    "Pending Review": <AlertCircle className="w-3 h-3 mr-1" />,
    "Awaiting Docs": <Clock className="w-3 h-3 mr-1" />,
    "Completed": <CheckCircle2 className="w-3 h-3 mr-1" />,
    "Escalated": <AlertCircle className="w-3 h-3 mr-1" />,
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${styles[status]}`}>
      {icons[status]}
      {status}
    </span>
  );
}

function PriorityIndicator({ priority }: { priority: Claim["priority"] }) {
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
