"use client";

import React, { use } from "react";
import {
  FileText,
  Upload,
  ShieldCheck,
  Activity,
  ChevronLeft,
  Settings,
  MoreVertical,
  CheckCircle2,
  AlertCircle,
  Clock,
  ExternalLink
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/primitives/Button";

interface PageProps {
  params: Promise<{ caseId: string }>;
}

export default function ManageCasePage({ params }: PageProps) {
  const { caseId } = use(params);

  return (
    <div className="flex flex-col h-full w-full bg-neutral-background p-8 overflow-y-auto custom-scrollbar">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-4">
          <Link href={`/workflow/${caseId}`} className="p-2 hover:bg-neutral-surface rounded-md transition-colors text-neutral-text-secondary">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-neutral-text-primary">Workflow Management</h1>
            <div className="flex items-center mt-1 space-x-2">
              <span className="text-xs font-mono text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded uppercase">{caseId}</span>
              <span className="text-neutral-text-tertiary text-sm">•</span>
              <span className="text-neutral-text-secondary text-sm font-medium">Standard Auto Policy Claim</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <Button variant="secondary" className="flex items-center space-x-2">
            <Settings className="w-4 h-4" />
            <span>Configure Pipeline</span>
          </Button>
          <Button className="flex items-center space-x-2">
            <Upload className="w-4 h-4" />
            <span>Upload New Evidence</span>
          </Button>
        </div>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-12 gap-6">

        {/* Left Column: Metrics & Health */}
        <div className="col-span-12 lg:col-span-8 space-y-6">

          {/* Intake Health Metrics */}
          <div className="bg-neutral-surface border border-neutral-border rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-2">
                <Activity className="w-5 h-5 text-brand-primary" />
                <h2 className="text-lg font-semibold text-neutral-text-primary">Intake Health Metrics</h2>
              </div>
              <span className="text-xs font-mono text-neutral-text-tertiary">LAST UPDATED: JUST NOW</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <MetricCard
                label="Document Confidence"
                value="98.2%"
                status="excellent"
                icon={<ShieldCheck className="w-4 h-4" />}
              />
              <MetricCard
                label="Extraction Density"
                value="Low"
                status="warning"
                icon={<AlertCircle className="w-4 h-4" />}
                description="3 fields missing from PD"
              />
              <MetricCard
                label="Pipeline Latency"
                value="1.4s"
                status="excellent"
                icon={<Clock className="w-4 h-4" />}
              />
            </div>
          </div>

          {/* Document Management Hub */}
          <div className="bg-neutral-surface border border-neutral-border rounded-xl shadow-sm">
            <div className="p-6 border-b border-neutral-border flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <FileText className="w-5 h-5 text-brand-primary" />
                <h2 className="text-lg font-semibold text-neutral-text-primary">Document Evidence Slots</h2>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-neutral-text-tertiary mr-2">4 of 6 REQUIRED UPLOADED</span>
                <div className="w-24 h-1.5 bg-neutral-background rounded-full overflow-hidden">
                  <div className="h-full bg-brand-primary w-2/3"></div>
                </div>
              </div>
            </div>

            <div className="p-0 overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-neutral-background/30">
                    <th className="px-6 py-3 text-xs font-semibold text-neutral-text-tertiary uppercase tracking-wider">Document Name</th>
                    <th className="px-6 py-3 text-xs font-semibold text-neutral-text-tertiary uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-xs font-semibold text-neutral-text-tertiary uppercase tracking-wider">Source</th>
                    <th className="px-6 py-3 text-xs font-semibold text-neutral-text-tertiary uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-border">
                  <DocumentRow
                    name="Police Traffic Accident Report"
                    status="verified"
                    source="External API (NYPD)"
                    date="Oct 24, 2023"
                  />
                  <DocumentRow
                    name="Claimant Statement (Audio)"
                    status="processing"
                    source="Direct Upload"
                    date="Oct 24, 2023"
                  />
                  <DocumentRow
                    name="Vehicle Photos - Front End"
                    status="verified"
                    source="Mobile Intake"
                    date="Oct 23, 2023"
                  />
                  <DocumentRow
                    name="Repair Estimate #8821"
                    status="missing"
                    source="Manual Entry"
                    date="-"
                  />
                </tbody>
              </table>
            </div>

            <div className="p-4 bg-neutral-background/30 flex justify-center border-t border-neutral-border">
              <button className="text-sm font-medium text-brand-primary hover:text-brand-primary-hover flex items-center space-x-1">
                <span>View all Case Assets</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Sidebar Actions */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <div className="bg-brand-primary/5 border border-brand-primary/20 rounded-xl p-6">
            <h3 className="text-brand-primary font-semibold mb-2 flex items-center space-x-2">
              <Activity className="w-4 h-4" />
              <span>Next Suggested Action</span>
            </h3>
            <p className="text-neutral-text-secondary text-sm mb-4 leading-relaxed">
              The Payout Agent is currently blocked by a missing Repair Estimate. Upload or sync the estimate to continue the automated workflow.
            </p>
            <Button className="w-full justify-center">Request Estimate Sync</Button>
          </div>

          <div className="bg-neutral-surface border border-neutral-border rounded-xl p-6 shadow-sm">
            <h3 className="text-neutral-text-primary font-semibold mb-4 text-sm uppercase tracking-wider">Pipeline Configuration</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-text-secondary">Strict Compliance Mode</span>
                <div className="w-8 h-4 bg-brand-primary rounded-full relative">
                  <div className="absolute right-0.5 top-0.5 w-3 h-3 bg-white rounded-full"></div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-text-secondary">Auto-Approve Low Value</span>
                <div className="w-8 h-4 bg-neutral-background border border-neutral-border rounded-full relative">
                  <div className="absolute left-0.5 top-0.5 w-3 h-3 bg-neutral-text-tertiary rounded-full"></div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-text-secondary">ML Model Version</span>
                <span className="text-xs font-mono text-neutral-text-tertiary">v2.4.0-stable</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function MetricCard({ label, value, status, icon, description }: {
  label: string,
  value: string,
  status: 'excellent' | 'warning' | 'critical',
  icon: React.ReactNode,
  description?: string
}) {
  const statusColors = {
    excellent: 'text-semantic-success bg-semantic-success/10',
    warning: 'text-semantic-warning bg-semantic-warning/10',
    critical: 'text-semantic-danger bg-semantic-danger/10'
  };

  return (
    <div className="bg-neutral-background/50 rounded-lg p-4 border border-neutral-border/50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-neutral-text-tertiary uppercase tracking-wider">{label}</span>
        <div className={`p-1.5 rounded-md ${statusColors[status]}`}>
          {icon}
        </div>
      </div>
      <div className="flex items-baseline space-x-2">
        <h4 className="text-xl font-bold text-neutral-text-primary">{value}</h4>
        {description && <span className="text-[10px] text-neutral-text-tertiary">{description}</span>}
      </div>
    </div>
  );
}

function DocumentRow({ name, status, source, date }: { name: string, status: 'verified' | 'processing' | 'missing', source: string, date: string }) {
  return (
    <tr className="hover:bg-neutral-background/20 transition-colors group">
      <td className="px-6 py-4">
        <div className="flex items-center space-x-3">
          <div className={`p-2 rounded border ${status === 'missing' ? 'border-dashed border-neutral-border bg-transparent' : 'border-neutral-border bg-neutral-background'}`}>
            <FileText className={`w-4 h-4 ${status === 'missing' ? 'text-neutral-text-tertiary' : 'text-brand-primary'}`} />
          </div>
          <span className={`text-sm font-medium ${status === 'missing' ? 'text-neutral-text-tertiary' : 'text-neutral-text-primary'}`}>
            {name}
          </span>
        </div>
      </td>
      <td className="px-6 py-4">
        {status === 'verified' && (
          <span className="inline-flex items-center text-[11px] font-medium text-semantic-success bg-semantic-success/10 px-2 py-0.5 rounded-full border border-semantic-success/20">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Verified
          </span>
        )}
        {status === 'processing' && (
          <span className="inline-flex items-center text-[11px] font-medium text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded-full border border-brand-primary/20">
            <Activity className="w-3 h-3 mr-1 animate-pulse" /> Processing
          </span>
        )}
        {status === 'missing' && (
          <span className="inline-flex items-center text-[11px] font-medium text-neutral-text-tertiary bg-neutral-text-tertiary/10 px-2 py-0.5 rounded-full border border-neutral-text-tertiary/20">
            Missing
          </span>
        )}
      </td>
      <td className="px-6 py-4">
        <div className="flex flex-col">
          <span className="text-xs text-neutral-text-secondary">{source}</span>
          <span className="text-[10px] text-neutral-text-tertiary font-mono">{date}</span>
        </div>
      </td>
      <td className="px-6 py-4 text-right">
        <button className="p-1 hover:bg-neutral-background rounded-md transition-colors text-neutral-text-tertiary hover:text-neutral-text-primary">
          <MoreVertical className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}
