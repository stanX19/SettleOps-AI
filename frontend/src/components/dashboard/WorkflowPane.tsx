"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  useNodesState,
  useEdgesState,
  Position,
  NodeProps,
  Handle,
  MarkerType,
  Edge,
  EdgeProps,
  Node,
  ReactFlowInstance,
  BaseEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@/components/primitives/Button';
import { Settings, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useCaseStore, RerunEvent } from '@/stores/case-store';
import { AgentId, AgentStatus, BlackboardSection, CaseStatus, Citation, RerunKind } from '@/lib/types';
import { useParams } from 'next/navigation';
import Link from 'next/link';

// ---- Custom Agent Node ----
function AgentNode({ data }: NodeProps) {
  const { label, status, detail, isStale, sourceHandles } = data as {
    label: string;
    status: AgentStatus;
    detail: string;
    isStale?: boolean;
    /** Named source handles — used by decision_gate to fan out rerun edges. */
    sourceHandles?: { id: string; left: string; position?: Position }[];
  };

  let statusClasses = "bg-neutral-surface border-neutral-border text-neutral-text-secondary";

  if (status === AgentStatus.WORKING) {
    statusClasses = "bg-brand-primary-light border-brand-primary text-brand-on-primary agent-node-running ring-2 ring-brand-primary ring-offset-2 ring-offset-neutral-background";
  } else if (status === AgentStatus.COMPLETED) {
    statusClasses = "bg-semantic-success/10 border-semantic-success text-semantic-success";
  } else if (status === AgentStatus.ERROR) {
    statusClasses = "bg-semantic-danger/10 border-semantic-danger text-semantic-danger";
  } else if (status === AgentStatus.WAITING) {
    statusClasses = "bg-semantic-warning/10 border-semantic-warning text-semantic-warning";
  }

  if (isStale) {
    statusClasses += " opacity-40 grayscale-[0.5]";
  }

  return (
    <div className={`px-3 py-2 rounded-md border w-[160px] shadow-card ${statusClasses} transition-all duration-300 relative group`}>
      {/* Normal flow edges enter at top */}
      <Handle type="target" position={Position.Top} className="opacity-0" />
      {/* Rerun edges from Review Decision enter at bottom */}
      <Handle type="target" position={Position.Bottom} id="bottom-target" className="opacity-0" />
      <Handle type="target" position={Position.Right} id="right-target" className="opacity-0" />
      <Handle type="target" position={Position.Left}  id="left-target"  className="opacity-0" />

      <div className="flex flex-col items-center justify-center">
        <div className="font-semibold text-[13px] mb-0.5 text-center leading-tight group-hover:scale-105 transition-transform duration-200 line-clamp-1">
          {label}
        </div>
        <div className="font-mono text-[9px] opacity-80 uppercase tracking-wider text-center line-clamp-1">
          {isStale ? 'STALE - RERUNNING' : detail}
        </div>
      </div>

      {/* Default bottom source — present only when no named sourceHandles */}
      {!sourceHandles && <Handle type="source" position={Position.Bottom} className="opacity-0" />}
      {/* Adjuster bypass lane: payout exits right, adjuster exits left */}
      <Handle type="source" position={Position.Right} id="right-source" className="opacity-0" />
      <Handle type="source" position={Position.Left}  id="left-source"  className="opacity-0" />
      {/* Distributed named source handles for decision_gate fan-out */}
      {sourceHandles?.map(h => (
        <Handle
          key={h.id}
          id={h.id}
          type="source"
          position={h.position ?? Position.Bottom}
          className="opacity-0"
          style={{ left: h.left, transform: 'translateX(-50%)' }}
        />
      ))}

      {status === AgentStatus.WORKING && (
        <div className="absolute -inset-1 rounded-md bg-brand-primary/20 animate-pulse -z-10" />
      )}
    </div>
  );
}

// ---- Cluster Container Node ----
function ClusterNode({ data }: NodeProps) {
  const { label, isWorking } = data as { label: string; isWorking?: boolean };

  return (
    <div className={`bg-neutral-surface/60 dark:bg-neutral-surface/20 border border-dashed rounded-xl w-full h-full relative group transition-all duration-500 ${
      isWorking ? 'border-brand-primary/50 shadow-[0_0_20px_rgba(var(--color-brand-primary-rgb),0.15)] bg-brand-primary/5' : 'border-neutral-border/50'
    }`}>
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="target" position={Position.Bottom} id="bottom-target" className="opacity-0" />
      <div className={`absolute -top-5 left-1 font-mono text-[9px] font-bold uppercase tracking-widest transition-colors ${
        isWorking ? 'text-brand-primary animate-pulse' : 'text-neutral-text-tertiary group-hover:text-brand-primary'
      }`}>
        {label} Cluster
      </div>
      <Handle type="source" position={Position.Bottom} className="opacity-0" />

      {isWorking && (
        <div className="absolute inset-0 rounded-xl bg-brand-primary/5 animate-pulse -z-10" />
      )}
    </div>
  );
}

function RetryEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  style,
  data,
}: EdgeProps) {
  // Validation (in-cluster) retries curve just outside the right edge of the cluster.
  // Challenge-analysis retries (cluster/officer) route through the left lane.
  const lane = typeof data?.laneX === 'number'
    ? data.laneX
    : Math.max(sourceX, targetX) + 60;

  const path = `M ${sourceX},${sourceY} C ${lane},${sourceY} ${lane},${targetY} ${targetX},${targetY}`;

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      style={style}
    />
  );
}

const nodeTypes = {
  agent: AgentNode,
  cluster: ClusterNode,
};

const edgeTypes = {
  retry: RetryEdge,
};

const formatAgentName = (agentId: string) =>
  agentId.charAt(0).toUpperCase() + agentId.slice(1);

// Layout constants
const CANVAS_CENTER_X = 400;
const CLUSTER_SPACING = 240;
const Y_START = 50;
const Y_CLUSTER = 220;
const Y_PAYOUT = 600;
const Y_AUDITOR = 700;
const Y_DECISION_GATE = Y_AUDITOR + (Y_AUDITOR - Y_PAYOUT);

// Adjuster node sits to the far right, clear of all cluster columns.
// With 4 clusters: rightmost cluster container right edge ≈ 860px.
// CANVAS_CENTER_X + 560 = 960 keeps a 100px gap.
const X_ADJUSTER = CANVAS_CENTER_X + 560;
const Y_ADJUSTER = (Y_PAYOUT + Y_AUDITOR) / 2; // vertically centred between payout and auditor

import { AgentDetailsModal } from './AgentDetailsModal';
import { CitationEvidenceModal } from './CitationEvidenceModal';
import { AGENT_SECTION_MAP } from '@/lib/citation-utils';

export function WorkflowPane() {
  const params = useParams();
  const caseId = params?.caseId as string;

  // Zustand State
  const caseStatus    = useCaseStore(state => state.status);
  const agents        = useCaseStore(state => state.agents);
  const blackboard    = useCaseStore(state => state.blackboard);
  const topology      = useCaseStore(state => state.topology);
  const citations     = useCaseStore(state => state.citations);
  const documents     = useCaseStore(state => state.documents);
  const rerun_events  = useCaseStore(state => state.rerun_events);
  const setSelectedAgentId   = useCaseStore(state => state.setSelectedAgentId);
  const setBlackboardMode    = useCaseStore(state => state.setBlackboardMode);
  const setPendingChallengeAgent = useCaseStore(state => state.setPendingChallengeAgent);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAgentForModal, setSelectedAgentForModal]   = useState<AgentId | null>(null);
  const [selectedSubtaskForModal, setSelectedSubtaskForModal] = useState<string | null>(null);
  const [selectedModalTitle, setSelectedModalTitle]         = useState<string | null>(null);
  const [activeEvidenceCitation, setActiveEvidenceCitation] = useState<Citation | null>(null);

  // ── Initial layout ────────────────────────────────────────────────────────
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Static agents (main pipeline column)
    const staticPositions: Record<string, { x: number; y: number }> = {
      [AgentId.INTAKE]:  { x: CANVAS_CENTER_X - 80, y: Y_START },
      [AgentId.PAYOUT]:  { x: CANVAS_CENTER_X - 80, y: Y_PAYOUT },
      [AgentId.AUDITOR]: { x: CANVAS_CENTER_X - 80, y: Y_AUDITOR },
    };

    Object.entries(staticPositions).forEach(([id, pos]) => {
      nodes.push({
        id,
        type: 'agent',
        position: pos,
        data: { label: id.charAt(0).toUpperCase() + id.slice(1) + ' Agent', status: AgentStatus.IDLE, detail: 'Awaiting Run' }
      });
    });

    // Decision Gate — distributed top handles so rerun edges fan out without bundling
    nodes.push({
      id: 'decision_gate',
      type: 'agent',
      position: { x: CANVAS_CENTER_X - 80, y: Y_DECISION_GATE },
      data: {
        label: 'Review Decision',
        status: AgentStatus.IDLE,
        detail: 'Awaiting Auditor',
        sourceHandles: [
          { id: 'src-policy',    left: '8%',  position: Position.Top },
          { id: 'src-liability', left: '33%', position: Position.Top },
          { id: 'src-damage',    left: '67%', position: Position.Top },
          { id: 'src-fraud',     left: '92%', position: Position.Top },
        ],
      },
      hidden: true,
    });

    // Dynamic clusters
    if (topology) {
      const clusterIds = Object.keys(topology);
      const totalWidth = (clusterIds.length - 1) * CLUSTER_SPACING;
      const xStart = CANVAS_CENTER_X - totalWidth / 2;

      clusterIds.forEach((clusterId, i) => {
        const xPos = xStart + i * CLUSTER_SPACING;
        const subTasks = topology[clusterId];
        const validatorId  = `${clusterId}-validator`;
        const aggregatorId = `${clusterId}-aggregator`;

        nodes.push({
          id: `cluster-${clusterId}`,
          type: 'cluster',
          position: { x: xPos - 100, y: Y_CLUSTER - 10 },
          style: { width: 200, height: 160 + subTasks.length * 70 },
          data: { label: clusterId.charAt(0).toUpperCase() + clusterId.slice(1) },
          selectable: false,
          draggable: true,
        });

        subTasks.forEach((taskName, idx) => {
          const taskLabel = taskName.replace(/_task$/, '').replace(/_/g, ' ');
          nodes.push({
            id: taskName,
            parentId: `cluster-${clusterId}`,
            type: 'agent',
            position: { x: 20, y: 30 + idx * 60 },
            extent: 'parent',
            data: { label: taskLabel, status: AgentStatus.IDLE, detail: 'Pending' }
          });
          edges.push({
            id: `e-intake-${taskName}`,
            source: AgentId.INTAKE, target: taskName,
            style: { strokeWidth: 2, stroke: 'var(--color-neutral-border)', strokeDasharray: '5,5' },
            markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-neutral-border)' }
          });
          edges.push({
            id: `e-${taskName}-validator`,
            source: taskName, target: validatorId,
            style: { strokeWidth: 2, stroke: 'var(--color-neutral-border)' },
            markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-neutral-border)' }
          });
        });

        nodes.push({
          id: validatorId,
          parentId: `cluster-${clusterId}`,
          type: 'agent',
          position: { x: 20, y: 30 + subTasks.length * 60 },
          extent: 'parent',
          data: { label: 'Validator', status: AgentStatus.IDLE, detail: 'Checking Evidence' }
        });

        nodes.push({
          id: aggregatorId,
          parentId: `cluster-${clusterId}`,
          type: 'agent',
          position: { x: 20, y: 90 + subTasks.length * 60 },
          extent: 'parent',
          data: { label: 'Aggregator', status: AgentStatus.IDLE, detail: 'Finalizing Cluster' }
        });

        edges.push({
          id: `e-${validatorId}-aggregator`,
          source: validatorId, target: aggregatorId,
          style: { strokeWidth: 2, stroke: 'var(--color-neutral-border)' },
          markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-neutral-border)' }
        });
        edges.push({
          id: `e-${aggregatorId}-payout`,
          source: aggregatorId, target: AgentId.PAYOUT,
          style: { strokeWidth: 2, stroke: 'var(--color-neutral-border)', strokeDasharray: '5,5' },
          markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-neutral-border)' }
        });
      });
    }

    // Payout → Auditor (main path, no adjuster)
    edges.push({
      id: 'e-payout-auditor',
      source: AgentId.PAYOUT, target: AgentId.AUDITOR,
      style: { strokeWidth: 2, stroke: 'var(--color-neutral-border)' },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-neutral-border)' }
    });

    // Auditor → Decision Gate (hidden until first rerun/routing event)
    edges.push({
      id: 'e-auditor-decision',
      source: AgentId.AUDITOR, target: 'decision_gate',
      style: { strokeWidth: 2, stroke: 'var(--color-neutral-border)' },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-neutral-border)' },
      hidden: true,
    });

    // NOTE: Adjuster node + edges are injected dynamically on AWAITING_ADJUSTER.
    // NOTE: Decision Gate → cluster retry edges are driven by rerun_events (no static placeholders).

    return { initialNodes: nodes, initialEdges: edges };
  }, [topology]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const prevAgentStatesRef    = useRef<Record<string, { status: AgentStatus }>>({});
  const adjusterInjectedRef   = useRef(false);
  const reactFlowInstanceRef  = useRef<ReactFlowInstance | null>(null);

  // Reset layout when topology changes (new case)
  useEffect(() => {
    if (initialNodes.length > 0) {
      setNodes(initialNodes);
      setEdges(initialEdges);
      adjusterInjectedRef.current = false;
      prevAgentStatesRef.current  = {};
    }
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // ── Adjuster node injection ───────────────────────────────────────────────
  // Adjuster sits to the far RIGHT of the canvas (x=960) so its edges run
  // horizontally clear of the main column and all cluster containers.
  //
  //   payout ──(right-source)──→──(left-target)── adjuster
  //   adjuster ──(left-source)──→──(right-target)── auditor
  //
  // Both hops are clean horizontal smoothstep arcs that never cross the
  // vertical payout→auditor main edge.
  const shouldShowAdjuster =
    caseStatus === CaseStatus.AWAITING_ADJUSTER ||
    !!blackboard[BlackboardSection.ADJUSTER_REQUEST] ||
    [AgentStatus.WORKING, AgentStatus.WAITING, AgentStatus.COMPLETED, AgentStatus.ERROR].includes(
      agents[AgentId.ADJUSTER]?.status
    );

  useEffect(() => {
    if (shouldShowAdjuster && !adjusterInjectedRef.current) {
      adjusterInjectedRef.current = true;

      setNodes((nds) => {
        if (nds.some(n => n.id === AgentId.ADJUSTER)) return nds;
        const adjusterStatus = agents[AgentId.ADJUSTER]?.status ?? (
          caseStatus === CaseStatus.AWAITING_ADJUSTER ? AgentStatus.WAITING : AgentStatus.COMPLETED
        );
        return [...nds, {
          id: AgentId.ADJUSTER,
          type: 'agent',
          position: { x: X_ADJUSTER, y: Y_ADJUSTER },
          data: {
            label: 'Adjuster Request',
            status: adjusterStatus,
            detail: adjusterStatus === AgentStatus.WAITING ? 'Upload Required'
              : adjusterStatus === AgentStatus.WORKING ? 'Reviewing Report'
              : adjusterStatus === AgentStatus.ERROR ? 'Review Failed'
              : 'Task Finished',
          }
        }];
      });

      setEdges((eds) => {
        const toAdd: Edge[] = [];
        if (!eds.some(e => e.id === 'e-payout-adjuster')) {
          toAdd.push({
            id: 'e-payout-adjuster',
            source: AgentId.PAYOUT,
            sourceHandle: 'right-source',
            target: AgentId.ADJUSTER,
            targetHandle: 'left-target',
            type: 'smoothstep',
            animated: true,
            style: { strokeWidth: 2, stroke: 'var(--color-semantic-warning)' },
            markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-semantic-warning)' }
          });
        }
        if (!eds.some(e => e.id === 'e-adjuster-auditor')) {
          toAdd.push({
            id: 'e-adjuster-auditor',
            source: AgentId.ADJUSTER,
            sourceHandle: 'left-source',
            target: AgentId.AUDITOR,
            targetHandle: 'right-target',
            type: 'smoothstep',
            style: { strokeWidth: 1.5, stroke: 'var(--color-neutral-border)' },
            markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-neutral-border)' }
          });
        }
        return [...eds, ...toAdd];
      });
    }
  }, [shouldShowAdjuster, agents, caseStatus, setNodes, setEdges]);

  // ── Rerun edge injection (event-driven, one edge per RerunEvent) ──────────
  useEffect(() => {
    if (rerun_events.length === 0) {
      setEdges((eds) => eds.filter((edge) => !edge.id.startsWith('e-rerun-')));
      return;
    }

    setEdges((eds) => {
      const activeIds = new Set(rerun_events.map(ev => `e-rerun-${ev.id}`));
      const baseEdges = eds.filter(edge => !edge.id.startsWith('e-rerun-') || activeIds.has(edge.id));
      const existingIds = new Set(baseEdges.map(e => e.id));
      const toAdd: Edge[] = [];

      for (const ev of rerun_events) {
        const edgeId = `e-rerun-${ev.id}`;

        // Update resolved state on already-injected edges
        // (handled in the updatedEds pass below)
        if (existingIds.has(edgeId)) continue;

        let stroke: string;
        if (ev.kind === RerunKind.OFFICER_RERUN) {
          stroke = 'var(--color-brand-secondary, #6366f1)';
        } else if (ev.kind === RerunKind.AUDITOR_RERUN) {
          stroke = 'var(--color-semantic-warning)';
        } else {
          stroke = 'var(--color-semantic-danger)';
        }

        const targetAgent = ev.target_agent ?? ev.to_agent;
        const targetCluster = ev.target_cluster ?? targetAgent;
        const isCluster = ev.retry_scope === 'cluster';
        const isSubtask = ev.retry_scope === 'subtask';
        const targetNode =
          isSubtask && ev.target_subtask
            ? ev.target_subtask
            : isCluster
            ? `cluster-${targetCluster}`
            : targetAgent;

        const sourceNode = isSubtask ? `${targetCluster}-validator` : 'decision_gate';
        const sourceHandle = isSubtask ? 'right-source' : isCluster ? `src-${targetCluster}` : 'left-source';
        const targetHandle = isSubtask ? 'right-target' : 'bottom-target';

        // isSubtask: no laneX — RetryEdge uses max(sx,tx)+60, curving just outside the cluster
        // isCluster / officer: route through left challenge-analysis lane, clear of all nodes
        const laneX = isSubtask
          ? undefined
          : isCluster
          ? CANVAS_CENTER_X - 280
          : CANVAS_CENTER_X - 360;

        toAdd.push({
          id: edgeId,
          source: sourceNode,
          target: targetNode,
          ...(sourceHandle ? { sourceHandle } : {}),
          ...(targetHandle ? { targetHandle } : {}),
          type: 'retry',
          animated: !ev.resolved,
          style: {
            strokeWidth: 2,
            stroke,
            strokeDasharray: '6 3',
            opacity: ev.resolved ? 0.45 : 1,
          },
          data: {
            route: isSubtask ? 'validation' : isCluster ? 'cluster' : 'officer',
            ...(laneX !== undefined ? { laneX } : {}),
          },
          markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
        });
        existingIds.add(edgeId);
      }

      // Sync resolved state on previously-injected rerun edges
      const updatedEds = baseEdges.map((edge) => {
        if (!edge.id.startsWith('e-rerun-')) return edge;
        const ev = rerun_events.find(e => `e-rerun-${e.id}` === edge.id);
        if (!ev) return edge;
        return {
          ...edge,
          animated: !ev.resolved,
          style: { ...edge.style, opacity: ev.resolved ? 0.45 : 1 },
        };
      });

      return toAdd.length > 0 ? [...updatedEds, ...toAdd] : updatedEds;
    });
  }, [rerun_events, setEdges]);

  // ── Node + static edge updates from live agent state ─────────────────────
  useEffect(() => {
    const hasRerunHistory = rerun_events.length > 0;
    const auditorIsRouting =
      caseStatus === CaseStatus.RUNNING &&
      agents[AgentId.AUDITOR]?.status === AgentStatus.COMPLETED;
    const showDecisionGate = hasRerunHistory || auditorIsRouting;

    setNodes((nds) => nds.map((node) => {
      // Decision Gate
      if (node.id === 'decision_gate') {
        const gateStatus =
          caseStatus === CaseStatus.AWAITING_APPROVAL || caseStatus === CaseStatus.ESCALATED || caseStatus === CaseStatus.AWAITING_ADJUSTER
            ? AgentStatus.WAITING
            : caseStatus === CaseStatus.APPROVED || caseStatus === CaseStatus.DECLINED
            ? AgentStatus.COMPLETED
            : caseStatus === CaseStatus.RUNNING
            ? AgentStatus.WORKING
            : AgentStatus.IDLE;
        const gateDetail =
          gateStatus === AgentStatus.WAITING  ? 'Awaiting Decision'
          : gateStatus === AgentStatus.WORKING ? 'Routing...'
          : gateStatus === AgentStatus.COMPLETED ? 'Decision Made'
          : 'Awaiting Auditor';
        return { ...node, hidden: !showDecisionGate, data: { ...node.data, status: gateStatus, detail: gateDetail } };
      }

      // Cluster glow
      if (node.id.startsWith('cluster-')) {
        const clusterId = node.id.replace('cluster-', '');
        return { ...node, data: { ...node.data, isWorking: agents[clusterId]?.status === AgentStatus.WORKING } };
      }

      // Top-level agents
      if (agents[node.id]) {
        const s = agents[node.id];
        return {
          ...node,
          data: {
            ...node.data,
            status: s.status,
            detail: s.status === AgentStatus.WORKING ? 'Actively Processing'
                  : s.status === AgentStatus.COMPLETED ? 'Task Finished' : 'Pending'
          }
        };
      }

      // Sub-tasks, validators, aggregators
      for (const [parentId, parentState] of Object.entries(agents)) {
        if (parentState.sub_tasks && parentState.sub_tasks[node.id]) {
          const st = parentState.sub_tasks[node.id];
          return {
            ...node,
            data: {
              ...node.data,
              status: st.status,
              detail: st.status === AgentStatus.WORKING ? 'Analyzing...' : 'Done',
              isStale: parentState.status === AgentStatus.IDLE && st.status === AgentStatus.COMPLETED
            }
          };
        }

        if (node.id === `${parentId}-validator` && parentState.sub_tasks?.validator) {
          const vs = parentState.sub_tasks.validator;
          return {
            ...node,
            data: {
              ...node.data,
              status: vs.status,
              detail: vs.status === AgentStatus.WORKING ? 'Validating...'
                    : vs.status === AgentStatus.COMPLETED ? 'Evidence Checked' : 'Awaiting tasks',
              isStale: parentState.status === AgentStatus.IDLE && vs.status === AgentStatus.COMPLETED
            }
          };
        }

        if (node.id === `${parentId}-aggregator`) {
          const validatorDone = parentState.sub_tasks?.validator?.status === AgentStatus.COMPLETED;
          const isWorking = parentState.status === AgentStatus.WORKING && validatorDone;
          const isDone    = parentState.status === AgentStatus.COMPLETED;
          return {
            ...node,
            data: {
              ...node.data,
              status: isWorking ? AgentStatus.WORKING : isDone ? AgentStatus.COMPLETED : AgentStatus.IDLE,
              detail: isWorking ? 'Aggregating Results...' : isDone ? 'Cluster Complete' : 'Awaiting tasks'
            }
          };
        }
      }

      return node;
    }));

    setEdges((eds) => eds.map((edge) => {
      // Auditor → Decision Gate
      if (edge.id === 'e-auditor-decision') {
        return {
          ...edge,
          hidden: !showDecisionGate,
          animated: auditorIsRouting,
          style: {
            ...edge.style,
            stroke: auditorIsRouting ? 'var(--color-brand-primary)' : 'var(--color-neutral-border)',
            strokeWidth: auditorIsRouting ? 2.5 : 2,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: auditorIsRouting ? 'var(--color-brand-primary)' : 'var(--color-neutral-border)'
          }
        };
      }

      // Adjuster branch edges
      if (edge.id === 'e-payout-adjuster' || edge.id === 'e-adjuster-auditor') {
        const adj = agents[AgentId.ADJUSTER];
        const isActive = adj?.status === AgentStatus.WORKING;
        const isDone   = adj?.status === AgentStatus.COMPLETED;
        const color = isDone ? 'var(--color-semantic-success)' : isActive ? 'var(--color-brand-primary)' : 'var(--color-semantic-warning)';
        return {
          ...edge,
          animated: isActive,
          style: { ...edge.style, stroke: color, strokeWidth: isActive ? 2 : 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color }
        };
      }

      // Rerun edges are managed by the rerun_events effect; skip here
      if (edge.id.startsWith('e-rerun-')) return edge;

      // All other edges — colour by source agent state
      const sourceId = edge.source.startsWith('cluster-') ? edge.source.replace('cluster-', '') : edge.source;
      const agentState = agents[sourceId];
      if (!agentState) return edge;

      const isActive = agentState.status === AgentStatus.WORKING;
      const isDone   = agentState.status === AgentStatus.COMPLETED;
      const color = isDone ? 'var(--color-semantic-success)'
                  : isActive ? 'var(--color-brand-primary)'
                  : 'var(--color-neutral-border)';
      return {
        ...edge,
        animated: isActive,
        style: { ...edge.style, stroke: color, strokeWidth: isActive ? 3 : 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color }
      };
    }));

    prevAgentStatesRef.current = Object.fromEntries(
      Object.entries(agents).map(([id, s]) => [id, { status: s.status }])
    );
  }, [agents, caseStatus, rerun_events, setNodes, setEdges]);

  // Re-fit whenever visible node set changes
  const visibleNodeSignature = useMemo(
    () => nodes.filter(n => !n.hidden).map(n => n.id).sort().join('|'),
    [nodes]
  );
  useEffect(() => {
    if (!reactFlowInstanceRef.current) return;
    const id = requestAnimationFrame(() => {
      reactFlowInstanceRef.current?.fitView({ padding: 0.2, duration: 400 });
    });
    return () => cancelAnimationFrame(id);
  }, [visibleNodeSignature]);

  const onNodeClick = (_: React.MouseEvent, node: Node) => {
    let agentId: AgentId | null = null;
    let subtaskId: string | null = null;
    let modalTitle: string | null = null;

    if (agents[node.id]) {
      agentId = node.id as AgentId;
    } else {
      for (const [parentId, parentState] of Object.entries(agents)) {
        if (node.id === `${parentId}-aggregator`) {
          agentId = parentId as AgentId;
          modalTitle = `${formatAgentName(parentId)} → Cluster Aggregator`;
          break;
        }
        if (node.id === `${parentId}-validator`) {
          agentId = parentId as AgentId;
          subtaskId = 'validator';
          modalTitle = `${formatAgentName(parentId)} → Validator`;
          break;
        }
        if (parentState.sub_tasks && parentState.sub_tasks[node.id]) {
          agentId = parentId as AgentId;
          subtaskId = node.id;
          break;
        }
      }
    }

    if (agentId) {
      setSelectedAgentForModal(agentId);
      setSelectedSubtaskForModal(subtaskId);
      setSelectedModalTitle(modalTitle);
      setModalOpen(true);
    }
  };

  return (
    <div className="flex-1 w-full h-full relative">
      <AgentDetailsModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedSubtaskForModal(null);
          setSelectedModalTitle(null);
        }}
        agentId={selectedAgentForModal}
        agentInfo={selectedAgentForModal ? agents[selectedAgentForModal] : null}
        subtaskName={selectedSubtaskForModal ?? undefined}
        titleOverride={selectedModalTitle ?? undefined}
        citations={selectedAgentForModal ? citations[AGENT_SECTION_MAP[selectedAgentForModal]!] : null}
        documents={documents}
        onViewEvidence={(citation) => setActiveEvidenceCitation(citation)}
        onSelectForChat={(id) => {
          setSelectedAgentId(id);
          setBlackboardMode('chat');
        }}
        onChallenge={(id) => {
          setPendingChallengeAgent(id);
          setBlackboardMode('chat');
          useCaseStore.getState().setChatChallengeMode(true);
        }}
      />
      <CitationEvidenceModal
        citation={activeEvidenceCitation}
        documents={documents}
        onClose={() => setActiveEvidenceCitation(null)}
      />

      {!topology && caseStatus === CaseStatus.SUBMITTED && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-neutral-background/80 backdrop-blur-sm p-4">
          <div className="bg-neutral-surface p-6 rounded-lg border border-neutral-border shadow-card min-w-[300px] max-w-md text-center">
            <div className="w-12 h-12 bg-semantic-danger/10 text-semantic-danger rounded-full flex items-center justify-center mx-auto mb-4">
              <Settings className="w-6 h-6 animate-spin" />
            </div>
            <h3 className="text-lg font-semibold text-neutral-text-primary mb-2">Syncing with Backend...</h3>
            <p className="text-sm text-neutral-text-secondary mb-4">
              Please ensure the backend is running and reachable, then try again.
            </p>
            <Button onClick={() => window.location.reload()} variant="default" size="sm">
              Retry Connection
            </Button>
          </div>
        </div>
      )}

      <div className="absolute top-4 left-6 right-6 z-10 flex items-center justify-between pointer-events-none">
        <div>
          <h2 className="text-[20px] font-bold text-slate-800 dark:text-slate-100 tracking-tight leading-tight mb-1.5 drop-shadow-sm">
            Live Orchestration
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-slate-500 dark:text-slate-400">Workflow:</span>
            <div className={`flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wider border shadow-sm backdrop-blur-md ${
              caseStatus === CaseStatus.RUNNING           ? 'bg-blue-50/90 text-blue-600 border-blue-200/80 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30' :
              caseStatus === CaseStatus.AWAITING_APPROVAL ? 'bg-emerald-50/90 text-emerald-600 border-emerald-200/80 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30' :
              caseStatus === CaseStatus.AWAITING_ADJUSTER ? 'bg-amber-50/90 text-amber-600 border-amber-200/80 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30' :
              caseStatus === CaseStatus.AWAITING_DOCS     ? 'bg-red-50/90 text-red-600 border-red-200/80 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/30' :
              'bg-slate-50/90 text-slate-500 border-slate-200/80 dark:bg-slate-800/80 dark:text-slate-400 dark:border-slate-700/80'
            }`}>
              {caseStatus === CaseStatus.RUNNING           && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse mr-1.5" />}
              {caseStatus === CaseStatus.AWAITING_DOCS     && <AlertCircle className="w-3.5 h-3.5 mr-1" strokeWidth={2} />}
              {caseStatus === CaseStatus.AWAITING_ADJUSTER && <AlertCircle className="w-3.5 h-3.5 mr-1" strokeWidth={2} />}
              {caseStatus === CaseStatus.AWAITING_APPROVAL && <CheckCircle2 className="w-3.5 h-3.5 mr-1" strokeWidth={2} />}
              {(caseStatus || '').toUpperCase().replace(/_/g, ' ')}
            </div>
          </div>
        </div>

        <div className="pointer-events-auto flex items-center space-x-2">
          <Link href={`/workflow/${caseId}/manage`}>
            <Button variant="secondary" className="h-8 px-3 py-0 text-xs bg-neutral-surface shadow-card border border-neutral-border flex items-center space-x-2">
              <Settings className="w-3.5 h-3.5" />
              <span>Manage Hub</span>
            </Button>
          </Link>
          <button
            onClick={() => useCaseStore.getState().refreshCase(caseId)}
            title="Click to force sync with backend"
            className="h-8 px-3 text-[11px] font-semibold tracking-wide uppercase bg-neutral-surface shadow-card border border-neutral-border rounded-md text-neutral-text-tertiary flex items-center hover:bg-neutral-background transition-colors cursor-pointer active:scale-95"
          >
            <div className={`w-2 h-2 rounded-full mr-2 ${caseStatus === CaseStatus.RUNNING ? 'bg-brand-primary animate-pulse' : 'bg-semantic-success'}`} />
            SSE LIVE
          </button>
        </div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onInit={(instance) => { reactFlowInstanceRef.current = instance; }}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        className="bg-neutral-background"
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--color-neutral-border)" gap={16} />
      </ReactFlow>
    </div>
  );
}
