"use client";

import React, { useState, useEffect, useMemo } from 'react';
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
import { Settings, Wrench } from 'lucide-react';
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
    <div className={`bg-neutral-surface/5 border border-dashed rounded-xl w-full h-full relative group transition-all duration-500 ${
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
const Y_AUDITOR = 700;

export function WorkflowPane() {
  const params = useParams();
  const caseId = params?.caseId as string;
  
  // Zustand State
  const caseStatus = useCaseStore(state => state.status);
  const agents = useCaseStore(state => state.agents);
  const topology = useCaseStore(state => state.topology);

  // 1. Calculate the initial layout (nodes and edges)
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Static Agents
    const staticPositions = {
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

    // Dynamic Clusters
    if (topology) {
      const clusterIds = Object.keys(topology);
      const totalWidth = (clusterIds.length - 1) * CLUSTER_SPACING;
      const xStart = CANVAS_CENTER_X - (totalWidth / 2);

      clusterIds.forEach((clusterId, i) => {
        const xPos = xStart + (i * CLUSTER_SPACING);
        const subTasks = topology[clusterId];
        
        // Add Cluster Container
        nodes.push({
          id: `cluster-${clusterId}`,
          type: 'cluster',
          position: { x: xPos - 100, y: Y_CLUSTER - 10 },
          style: { width: 200, height: 40 + (subTasks.length * 70) },
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
        });

        // Edges from Intake to Cluster
        edges.push({
          id: `e-intake-${clusterId}`,
          source: AgentId.INTAKE,
          target: `cluster-${clusterId}`,
          style: { strokeWidth: 2, stroke: 'var(--color-neutral-border)', strokeDasharray: '5,5' },
          markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-neutral-border)' }
        });

        // Edges from Cluster to Payout
        edges.push({
          id: `e-${clusterId}-payout`,
          source: `cluster-${clusterId}`,
          target: AgentId.PAYOUT,
          style: { strokeWidth: 2, stroke: 'var(--color-neutral-border)', strokeDasharray: '5,5' },
          markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-neutral-border)' }
        });
      });
    }

    // Connect Payout to Auditor
    edges.push({
      id: `e-payout-auditor`,
      source: AgentId.PAYOUT,
      target: AgentId.AUDITOR,
      style: { strokeWidth: 2, stroke: 'var(--color-neutral-border)' },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-neutral-border)' }
    });

    return { initialNodes: nodes, initialEdges: edges };
  }, [topology]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update ReactFlow nodes/edges whenever the derived initial layout changes
  useEffect(() => {
    if (initialNodes.length > 0) {
      setNodes(initialNodes);
      setEdges(initialEdges);
    }
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // Update node DATA (status, processing) based on live agent state
  useEffect(() => {
    setNodes((nds) => nds.map((node) => {
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

      // 3. Handle Sub-tasks
      for (const [parentId, parentState] of Object.entries(agents)) {
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
      }

      return node;
    }));

    setEdges((eds) => eds.map((edge) => {
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
    }));
  }, [agents, setNodes, setEdges]);

  return (
    <div className="flex-1 w-full h-full relative border-r border-neutral-border">
      {/* Error Overlay for failed fetches */}
      {!topology && caseStatus === CaseStatus.SUBMITTED && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-neutral-background/80 backdrop-blur-sm p-4">
          <div className="bg-neutral-surface p-6 rounded-xl border border-neutral-border shadow-card min-w-[300px] max-w-md text-center">
            <div className="w-12 h-12 bg-semantic-danger/10 text-semantic-danger rounded-full flex items-center justify-center mx-auto mb-4">
              <Settings className="w-6 h-6 animate-spin" />
            </div>
            <h3 className="text-lg font-semibold text-neutral-text-primary mb-2">Syncing with Backend...</h3>
            <p className="text-sm text-neutral-text-secondary mb-4">
              We're having trouble fetching the case topology. Please ensure the backend is running at <code className="bg-neutral-background px-1 py-0.5 rounded">localhost:8000</code>.
            </p>
            <Button onClick={() => window.location.reload()} variant="primary" size="sm">
              Retry Connection
            </Button>
          </div>
        </div>
      )}

      <div className="absolute top-4 left-6 right-6 z-10 flex items-center justify-between pointer-events-none">
        <div>
          <h2 className="text-lg font-semibold text-neutral-text-primary">Live Orchestration</h2>
          <div className="text-sm font-mono text-neutral-text-secondary mt-1 flex items-center">
            Workflow:
            <span className={`ml-2 flex items-center ${caseStatus === CaseStatus.RUNNING ? 'text-brand-primary' :
              caseStatus === CaseStatus.AWAITING_APPROVAL ? 'text-semantic-success' : 'text-neutral-text-tertiary'
              }`}>
              {caseStatus === CaseStatus.RUNNING && <span className="w-2 h-2 rounded-full bg-brand-primary animate-pulse mr-2"></span>}
              {(caseStatus || '').toUpperCase()}
            </span>
          </div>
        </div>

        <div className="pointer-events-auto flex items-center space-x-2">
          <Link href={`/workflow/${caseId}/manage`}>
            <Button variant="secondary" size="sm" className="bg-neutral-surface shadow-card border border-neutral-border flex items-center space-x-2">
              <Settings className="w-3.5 h-3.5" />
              <span>Manage Hub</span>
            </Button>
          </Link>
          <div className="px-3 py-1.5 text-[11px] bg-neutral-surface shadow-card border border-neutral-border rounded-md text-neutral-text-tertiary flex items-center">
            <div className={`w-2 h-2 rounded-full mr-2 ${caseStatus === CaseStatus.RUNNING ? 'bg-brand-primary animate-pulse' : 'bg-neutral-border'}`}></div>
            SSE LIVE
          </div>
        </div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
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
