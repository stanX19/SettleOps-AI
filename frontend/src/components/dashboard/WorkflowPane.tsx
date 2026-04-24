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
import { Settings } from 'lucide-react';
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
  return (
    <div className="bg-neutral-surface/5 border border-dashed border-neutral-border/50 rounded-xl w-full h-full relative group">
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <div className="absolute -top-5 left-1 font-mono text-[9px] font-bold uppercase tracking-widest text-neutral-text-tertiary group-hover:text-brand-primary transition-colors">
        {data.label as string} Cluster
      </div>
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}

const nodeTypes = {
  agent: AgentNode,
  cluster: ClusterNode,
};

// Default layout offsets
const CLUSTER_WIDTH = 200;
const CLUSTER_HEIGHT = 180;
const POSITIONS: Record<string, { x: number, y: number }> = {
  [AgentId.INTAKE]: { x: 300, y: 50 },
  [AgentId.POLICY]: { x: 50, y: 220 },
  [AgentId.LIABILITY]: { x: 300, y: 220 },
  [AgentId.FRAUD]: { x: 550, y: 220 },
  [AgentId.PAYOUT]: { x: 300, y: 500 },
  [AgentId.AUDITOR]: { x: 300, y: 680 },
};

export function WorkflowPane() {
  const params = useParams();
  const caseId = params?.caseId as string;
  
  // Zustand State
  const caseStatus = useCaseStore(state => state.status);
  const agents = useCaseStore(state => state.agents);
  const topology = useCaseStore(state => state.topology);

  // Initial nodes/edges derived from topology
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // 1. Static Nodes
    const staticAgents = [AgentId.INTAKE, AgentId.PAYOUT, AgentId.AUDITOR];
    staticAgents.forEach(id => {
      nodes.push({
        id,
        type: 'agent',
        position: POSITIONS[id],
        data: { label: id.charAt(0).toUpperCase() + id.slice(1) + ' Agent', status: AgentStatus.IDLE, detail: 'Awaiting Run' }
      });
    });

    // 2. Dynamic Clusters from Topology
    if (topology) {
      Object.entries(topology).forEach(([clusterId, subTasks]) => {
        const clusterPos = POSITIONS[clusterId] || { x: 0, y: 0 };
        
        // Add Cluster Container
        nodes.push({
          id: `cluster-${clusterId}`,
          type: 'cluster',
          position: { x: clusterPos.x - 20, y: clusterPos.y - 10 },
          style: { width: CLUSTER_WIDTH, height: CLUSTER_HEIGHT },
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

        // Add Edges from Intake to Cluster Sub-tasks
        edges.push({
          id: `e-intake-${clusterId}`,
          source: AgentId.INTAKE,
          target: `cluster-${clusterId}`,
          style: { strokeWidth: 2, stroke: 'var(--color-neutral-border)', strokeDasharray: '5,5' },
          markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-neutral-border)' }
        });

        // Add Edges from Cluster Sub-tasks to Payout
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

  // Sync ReactFlow state when initial layout is recalculated (e.g. topology arrives)
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // Update nodes and edges based on dynamic agent state
  useEffect(() => {
    setNodes((nds) => nds.map((node) => {
      // Handle static agents
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

      // Handle sub-tasks nested in agents
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
      // Find source status
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
      <div className="absolute top-4 left-6 right-6 z-10 flex items-center justify-between pointer-events-none">
        <div>
          <h2 className="text-lg font-semibold text-neutral-text-primary">Live Orchestration</h2>
          <div className="text-sm font-mono text-neutral-text-secondary mt-1 flex items-center">
            Workflow:
            <span className={`ml-2 flex items-center ${caseStatus === CaseStatus.RUNNING ? 'text-brand-primary' :
              caseStatus === CaseStatus.AWAITING_APPROVAL ? 'text-semantic-success' : 'text-neutral-text-tertiary'
              }`}>
              {caseStatus === CaseStatus.RUNNING && <span className="w-2 h-2 rounded-full bg-brand-primary animate-pulse mr-2"></span>}
              {caseStatus.toUpperCase()}
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
