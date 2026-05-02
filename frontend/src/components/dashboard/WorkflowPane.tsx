"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@/components/primitives/Button';
import { Settings, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useCaseStore } from '@/stores/case-store';
import { AgentId, AgentStatus, CaseStatus } from '@/lib/types';
import { useParams } from 'next/navigation';
import Link from 'next/link';

// ---- Custom Agent Node ----
function AgentNode({ data }: NodeProps) {
  const { label, status, detail, isStale } = data as { 
    label: string, 
    status: AgentStatus, 
    detail: string,
    isStale?: boolean 
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
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <div className="flex flex-col items-center justify-center">
        <div className="font-semibold text-[13px] mb-0.5 text-center leading-tight group-hover:scale-105 transition-transform duration-200 line-clamp-1">
          {label}
        </div>
        <div className="font-mono text-[9px] opacity-80 uppercase tracking-wider text-center line-clamp-1">
          {isStale ? 'STALE - RERUNNING' : detail}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
      
      {status === AgentStatus.WORKING && (
        <div className="absolute -inset-1 rounded-md bg-brand-primary/20 animate-pulse -z-10" />
      )}
    </div>
  );
}

// ---- Cluster Container Node ----
function ClusterNode({ data }: NodeProps) {
  const { label, isWorking } = data as { label: string, isWorking?: boolean };
  
  return (
    <div className={`bg-neutral-surface/60 dark:bg-neutral-surface/20 border border-dashed rounded-xl w-full h-full relative group transition-all duration-500 ${
      isWorking ? 'border-brand-primary/50 shadow-[0_0_20px_rgba(var(--color-brand-primary-rgb),0.15)] bg-brand-primary/5' : 'border-neutral-border/50'
    }`}>
      <Handle type="target" position={Position.Top} className="opacity-0" />
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

const nodeTypes = {
  agent: AgentNode,
  cluster: ClusterNode,
};

// Layout engine constants
const CANVAS_CENTER_X = 400;
const CLUSTER_SPACING = 240;
const Y_START = 50;
const Y_CLUSTER = 220;
const Y_PAYOUT = 520;
const Y_ADJUSTER = 620;
const Y_AUDITOR = 720;
const Y_DECISION_GATE = 900;

import { AgentDetailsModal } from './AgentDetailsModal';

export function WorkflowPane() {
  const params = useParams();
  const caseId = params?.caseId as string;
  
  // Zustand State
  const caseStatus = useCaseStore(state => state.status);
  const agents = useCaseStore(state => state.agents);
  const topology = useCaseStore(state => state.topology);
  const setSelectedAgentId = useCaseStore(state => state.setSelectedAgentId);
  const setBlackboardMode = useCaseStore(state => state.setBlackboardMode);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAgentForModal, setSelectedAgentForModal] = useState<AgentId | null>(null);

  // 1. Calculate the initial layout (nodes and edges)
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Static Agents (main pipeline column)
    const staticPositions: Record<string, { x: number; y: number }> = {
      [AgentId.INTAKE]: { x: CANVAS_CENTER_X - 80, y: Y_START },
      [AgentId.PAYOUT]: { x: CANVAS_CENTER_X - 80, y: Y_PAYOUT },
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

    // NOTE: Adjuster node is NOT in the initial layout.
    // It is dynamically added when the workflow enters AWAITING_ADJUSTER state.

    // Decision Gate node — below Auditor
    nodes.push({
      id: 'decision_gate',
      type: 'agent',
      position: { x: CANVAS_CENTER_X - 80, y: Y_DECISION_GATE },
      data: { label: 'Decision Gate', status: AgentStatus.IDLE, detail: 'Awaiting Auditor' }
    });

    // Dynamic Clusters
    if (topology) {
      const clusterIds = Object.keys(topology);
      const totalWidth = (clusterIds.length - 1) * CLUSTER_SPACING;
      const xStart = CANVAS_CENTER_X - (totalWidth / 2);

      clusterIds.forEach((clusterId, i) => {
        const xPos = xStart + (i * CLUSTER_SPACING);
        const subTasks = topology[clusterId];
        const validatorId = `${clusterId}-validator`;
        const aggregatorId = `${clusterId}-aggregator`;
        
        // Add Cluster Container
        nodes.push({
          id: `cluster-${clusterId}`,
          type: 'cluster',
          position: { x: xPos - 100, y: Y_CLUSTER - 10 },
          style: { width: 200, height: 160 + (subTasks.length * 70) }, // Taller to fit validator + aggregator
          data: { label: clusterId.charAt(0).toUpperCase() + clusterId.slice(1) },
          selectable: false,
          draggable: true,
        });

        // Add Sub-task Nodes
        subTasks.forEach((taskName, idx) => {
          const taskLabel = taskName.replace(/_task$/, '').replace(/_/g, ' ');
          nodes.push({
            id: taskName,
            parentId: `cluster-${clusterId}`,
            type: 'agent',
            position: { x: 20, y: 30 + (idx * 60) },
            extent: 'parent',
            data: { label: taskLabel, status: AgentStatus.IDLE, detail: 'Pending' }
          });

          // Edges from Intake to each Sub-task (Fan-out)
          edges.push({
            id: `e-intake-${taskName}`,
            source: AgentId.INTAKE,
            target: taskName,
            style: { strokeWidth: 2, stroke: 'var(--color-neutral-border)', strokeDasharray: '5,5' },
            markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-neutral-border)' }
          });

          // Edges from Sub-task to Validator (Fan-in)
          edges.push({
            id: `e-${taskName}-validator`,
            source: taskName,
            target: validatorId,
            style: { strokeWidth: 2, stroke: 'var(--color-neutral-border)' },
            markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-neutral-border)' }
          });
        });

        // Add per-cluster Validator Node
        nodes.push({
          id: validatorId,
          parentId: `cluster-${clusterId}`,
          type: 'agent',
          position: { x: 20, y: 30 + (subTasks.length * 60) },
          extent: 'parent',
          data: { label: 'Validator', status: AgentStatus.IDLE, detail: 'Checking Evidence' }
        });

        // Add Aggregator Node
        nodes.push({
          id: aggregatorId,
          parentId: `cluster-${clusterId}`,
          type: 'agent',
          position: { x: 20, y: 90 + (subTasks.length * 60) },
          extent: 'parent',
          data: { label: 'Aggregator', status: AgentStatus.IDLE, detail: 'Finalizing Cluster' }
        });

        edges.push({
          id: `e-${validatorId}-aggregator`,
          source: validatorId,
          target: aggregatorId,
          style: { strokeWidth: 2, stroke: 'var(--color-neutral-border)' },
          markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-neutral-border)' }
        });

        // Edges from Aggregator to Payout
        edges.push({
          id: `e-${aggregatorId}-payout`,
          source: aggregatorId,
          target: AgentId.PAYOUT,
          style: { strokeWidth: 2, stroke: 'var(--color-neutral-border)', strokeDasharray: '5,5' },
          markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-neutral-border)' }
        });
      });
    }

    // Payout → Auditor (main path)
    edges.push({
      id: `e-payout-auditor`,
      source: AgentId.PAYOUT,
      target: AgentId.AUDITOR,
      style: { strokeWidth: 2, stroke: 'var(--color-neutral-border)' },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-neutral-border)' }
    });

    // NOTE: Adjuster edges (payout→adjuster, adjuster→auditor) are NOT in the initial layout.
    // They are dynamically added when the workflow triggers the adjuster path.

    // Auditor → Decision Gate
    edges.push({
      id: 'e-auditor-decision',
      source: AgentId.AUDITOR,
      target: 'decision_gate',
      style: { strokeWidth: 2, stroke: 'var(--color-neutral-border)' },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-neutral-border)' }
    });

    // Decision Gate → cluster retry edges (hidden by default, shown only when retry is triggered)
    if (topology) {
      Object.keys(topology).forEach(clusterId => {
        edges.push({
          id: `e-decision-retry-${clusterId}`,
          source: 'decision_gate',
          target: `${clusterId}-aggregator`,
          type: 'smoothstep',
          label: 'retry',
          labelStyle: { fontSize: 9, fill: 'var(--color-semantic-warning)' },
          labelBgStyle: { fill: 'transparent' },
          style: { strokeWidth: 1.5, stroke: 'var(--color-semantic-warning)', strokeDasharray: '4,4', opacity: 0 },
          markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-semantic-warning)' },
          hidden: true,
        });
      });
    }

    return { initialNodes: nodes, initialEdges: edges };
  }, [topology]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Refs for tracking retry state (COMPLETED → WORKING transitions)
  const prevAgentStatesRef = useRef<Record<string, { status: AgentStatus }>>({});
  const retriedClustersRef = useRef<Set<string>>(new Set());

  // Track whether adjuster node has been injected
  const adjusterInjectedRef = useRef(false);

  // Update ReactFlow nodes/edges whenever the derived initial layout changes
  useEffect(() => {
    if (initialNodes.length > 0) {
      setNodes(initialNodes);
      setEdges(initialEdges);
      // Reset dynamic state when topology changes (new case)
      adjusterInjectedRef.current = false;
      retriedClustersRef.current = new Set();
      prevAgentStatesRef.current = {};
    }
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // Dynamic adjuster node injection: when case status becomes AWAITING_ADJUSTER,
  // add the adjuster node + edges to the graph
  useEffect(() => {
    if (caseStatus === CaseStatus.AWAITING_ADJUSTER && !adjusterInjectedRef.current) {
      adjusterInjectedRef.current = true;

      setNodes((nds) => {
        // Don't add if already present
        if (nds.some(n => n.id === AgentId.ADJUSTER)) return nds;
        return [...nds, {
          id: AgentId.ADJUSTER,
          type: 'agent',
          position: { x: CANVAS_CENTER_X + 120, y: Y_ADJUSTER },
          data: { label: 'Adjuster Request', status: AgentStatus.WAITING, detail: 'Upload Required' }
        }];
      });

      setEdges((eds) => {
        const newEdges: Edge[] = [];
        if (!eds.some(e => e.id === 'e-payout-adjuster')) {
          newEdges.push({
            id: 'e-payout-adjuster',
            source: AgentId.PAYOUT,
            target: AgentId.ADJUSTER,
            type: 'smoothstep',
            animated: true,
            style: { strokeWidth: 2, stroke: 'var(--color-semantic-warning)', strokeDasharray: '5,5' },
            markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-semantic-warning)' }
          });
        }
        if (!eds.some(e => e.id === 'e-adjuster-auditor')) {
          newEdges.push({
            id: 'e-adjuster-auditor',
            source: AgentId.ADJUSTER,
            target: AgentId.AUDITOR,
            type: 'smoothstep',
            style: { strokeWidth: 1.5, stroke: 'var(--color-neutral-border)', strokeDasharray: '5,5' },
            markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-neutral-border)' }
          });
        }
        return [...eds, ...newEdges];
      });
    }
  }, [caseStatus, setNodes, setEdges]);

  // Update node DATA (status, processing) based on live agent state
  useEffect(() => {
    setNodes((nds) => nds.map((node) => {
      // 0. Handle Decision Gate — derive status from case status
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
          gateStatus === AgentStatus.WAITING ? 'Awaiting Decision'
            : gateStatus === AgentStatus.WORKING ? 'Routing...'
            : gateStatus === AgentStatus.COMPLETED ? 'Decision Made'
            : 'Awaiting Auditor';
        return { ...node, data: { ...node.data, status: gateStatus, detail: gateDetail } };
      }

      // 1. Handle Clusters (Glow)
      if (node.id.startsWith('cluster-')) {
        const clusterId = node.id.replace('cluster-', '');
        const clusterState = agents[clusterId];
        return {
          ...node,
          data: {
            ...node.data,
            isWorking: clusterState?.status === AgentStatus.WORKING
          }
        };
      }

      // 2. Handle Top-level Agents
      if (agents[node.id]) {
        const agentState = agents[node.id];
        return {
          ...node,
          data: {
            ...node.data,
            status: agentState.status,
            detail: agentState.status === AgentStatus.WORKING ? 'Actively Processing' :
                    agentState.status === AgentStatus.COMPLETED ? 'Task Finished' : 'Pending'
          }
        };
      }

      // 3. Handle Sub-tasks and Aggregators
      for (const [parentId, parentState] of Object.entries(agents)) {
        // Handle Sub-tasks
        if (parentState.sub_tasks && parentState.sub_tasks[node.id]) {
          const subTaskState = parentState.sub_tasks[node.id];
          return {
            ...node,
            data: {
              ...node.data,
              status: subTaskState.status,
              detail: subTaskState.status === AgentStatus.WORKING ? 'Analyzing...' : 'Done',
              isStale: parentState.status === AgentStatus.IDLE && subTaskState.status === AgentStatus.COMPLETED
            }
          };
        }

        if (node.id === `${parentId}-validator` && parentState.sub_tasks?.validator) {
          const validatorState = parentState.sub_tasks.validator;
          return {
            ...node,
            data: {
              ...node.data,
              status: validatorState.status,
              detail: validatorState.status === AgentStatus.WORKING ? 'Validating...' :
                      validatorState.status === AgentStatus.COMPLETED ? 'Evidence Checked' : 'Awaiting tasks',
              isStale: parentState.status === AgentStatus.IDLE && validatorState.status === AgentStatus.COMPLETED
            }
          };
        }

        // Handle Aggregators (working after validator completes while parent cluster is still running)
        if (node.id === `${parentId}-aggregator`) {
          const validatorDone = parentState.sub_tasks?.validator?.status === AgentStatus.COMPLETED;
          const isWorking = parentState.status === AgentStatus.WORKING && validatorDone;
          const isDone = parentState.status === AgentStatus.COMPLETED;

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

    setEdges((eds) => {
      // Determine which clusters are being retried (COMPLETED → WORKING transition)
      const retriedClusters = new Set<string>();
      for (const [agentId, state] of Object.entries(agents)) {
        if (state.status === AgentStatus.WORKING) {
          // Check if the previous state was completed (meaning this is a retry)
          const prevStatus = prevAgentStatesRef.current[agentId]?.status;
          if (prevStatus === AgentStatus.COMPLETED) {
            retriedClusters.add(agentId);
            retriedClustersRef.current.add(agentId);
          }
        }
      }

      return eds.map((edge) => {
        // Retry edges: show only when a retry was triggered
        if (edge.id.startsWith('e-decision-retry-')) {
          const clusterId = edge.id.replace('e-decision-retry-', '');
          const hasBeenRetried = retriedClustersRef.current.has(clusterId);
          const isActivelyRetrying = agents[clusterId]?.status === AgentStatus.WORKING && hasBeenRetried;

          if (!hasBeenRetried) return edge; // Stay hidden

          return {
            ...edge,
            hidden: false,
            animated: isActivelyRetrying,
            style: {
              ...edge.style,
              stroke: isActivelyRetrying ? 'var(--color-brand-primary)' : 'var(--color-semantic-warning)',
              strokeWidth: isActivelyRetrying ? 2 : 1.5,
              opacity: isActivelyRetrying ? 1 : 0.7,
            },
            markerEnd: { type: MarkerType.ArrowClosed, color: isActivelyRetrying ? 'var(--color-brand-primary)' : 'var(--color-semantic-warning)' }
          };
        }

        // Adjuster branch edges: animate when adjuster is active
        if (edge.id === 'e-payout-adjuster' || edge.id === 'e-adjuster-auditor') {
          const adjusterState = agents[AgentId.ADJUSTER];
          const isActive = adjusterState?.status === AgentStatus.WORKING;
          const isDone = adjusterState?.status === AgentStatus.COMPLETED;
          const color = isDone ? 'var(--color-semantic-success)' : isActive ? 'var(--color-brand-primary)' : 'var(--color-semantic-warning)';
          return {
            ...edge,
            animated: isActive,
            style: { ...edge.style, stroke: color, strokeWidth: isActive ? 2 : 1.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color }
          };
        }

        const sourceId = edge.source.startsWith('cluster-') ? edge.source.replace('cluster-', '') : edge.source;
        const agentState = agents[sourceId];

        if (!agentState) return edge;

        const isActive = agentState.status === AgentStatus.WORKING;
        const isDone = agentState.status === AgentStatus.COMPLETED;
        const color = isDone ? 'var(--color-semantic-success)' :
                      isActive ? 'var(--color-brand-primary)' : 'var(--color-neutral-border)';

        return {
          ...edge,
          animated: isActive,
          style: { ...edge.style, stroke: color, strokeWidth: isActive ? 3 : 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: color }
        };
      });
    });

    // Save previous agent states for retry detection on next render
    prevAgentStatesRef.current = Object.fromEntries(
      Object.entries(agents).map(([id, state]) => [id, { status: state.status }])
    );
  }, [agents, caseStatus, setNodes, setEdges]);

  const onNodeClick = (_: React.MouseEvent, node: Node) => {
    // If it's a top-level agent or cluster ID that exists in agents store
    let agentId: AgentId | null = null;
    if (agents[node.id]) {
      agentId = node.id as AgentId;
    } else {
      // Check if it's an aggregator or subtask by finding the parent
      for (const [parentId, parentState] of Object.entries(agents)) {
        if (
          node.id === `${parentId}-aggregator` ||
          node.id === `${parentId}-validator` ||
          (parentState.sub_tasks && parentState.sub_tasks[node.id])
        ) {
          agentId = parentId as AgentId;
          break;
        }
      }
    }

    if (agentId) {
      setSelectedAgentForModal(agentId);
      setModalOpen(true);
    }
  };

  return (
    <div className="flex-1 w-full h-full relative">
      {/* Agent Details Modal */}
      <AgentDetailsModal 
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        agentId={selectedAgentForModal}
        agentInfo={selectedAgentForModal ? agents[selectedAgentForModal] : null}
        onSelectForChat={(id) => {
          setSelectedAgentId(id);
          setBlackboardMode('chat');
        }}
      />

      {/* Error Overlay for failed fetches */}
      {!topology && caseStatus === CaseStatus.SUBMITTED && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-neutral-background/80 backdrop-blur-sm p-4">
          <div className="bg-neutral-surface p-6 rounded-lg border border-neutral-border shadow-card min-w-[300px] max-w-md text-center">
            <div className="w-12 h-12 bg-semantic-danger/10 text-semantic-danger rounded-full flex items-center justify-center mx-auto mb-4">
              <Settings className="w-6 h-6 animate-spin" />
            </div>
            <h3 className="text-lg font-semibold text-neutral-text-primary mb-2">Syncing with Backend...</h3>
            <p className="text-sm text-neutral-text-secondary mb-4">
              We're having trouble fetching the case topology. Please ensure the backend is running and reachable, then try again.
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
            <span className="text-[13px] font-medium text-slate-500 dark:text-slate-400">
              Workflow:
            </span>
            <div className={`flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wider border shadow-sm backdrop-blur-md ${
              caseStatus === CaseStatus.RUNNING ? 'bg-blue-50/90 text-blue-600 border-blue-200/80 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30' :
              caseStatus === CaseStatus.AWAITING_APPROVAL ? 'bg-emerald-50/90 text-emerald-600 border-emerald-200/80 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30' :
              caseStatus === CaseStatus.AWAITING_ADJUSTER ? 'bg-amber-50/90 text-amber-600 border-amber-200/80 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30' :
              caseStatus === CaseStatus.AWAITING_DOCS ? 'bg-red-50/90 text-red-600 border-red-200/80 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/30' :
              'bg-slate-50/90 text-slate-500 border-slate-200/80 dark:bg-slate-800/80 dark:text-slate-400 dark:border-slate-700/80'
            }`}>
              {caseStatus === CaseStatus.RUNNING && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse mr-1.5"></span>}
              {caseStatus === CaseStatus.AWAITING_DOCS && <AlertCircle className="w-3.5 h-3.5 mr-1" strokeWidth={2} />}
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
            <div className={`w-2 h-2 rounded-full mr-2 ${caseStatus === CaseStatus.RUNNING ? 'bg-brand-primary animate-pulse' : 'bg-semantic-success'}`}></div>
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
        fitView
        fitViewOptions={{ padding: 0.2 }}
        className="bg-neutral-background"
        minZoom={0.5}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--color-neutral-border)" gap={16} />
      </ReactFlow>
    </div>
  );
}
