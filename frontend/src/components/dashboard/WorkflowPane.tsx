"use client";

import React, { useState, useEffect, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  Position,
  NodeProps,
  Handle,
  MarkerType,
  Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@/components/primitives/Button';
import { Play, RotateCcw } from 'lucide-react';

// ---- Custom Agent Node ----
function AgentNode({ data }: NodeProps) {
  const { label, status, detail } = data as { label: string, status: 'idle' | 'working' | 'waiting' | 'completed' | 'error', detail: string };

  let statusClasses = "bg-neutral-surface border-neutral-border text-neutral-text-secondary";

  if (status === 'working') {
    statusClasses = "bg-brand-primary-light border-brand-primary text-brand-on-primary agent-node-running ring-2 ring-brand-primary ring-offset-2 ring-offset-neutral-background";
  } else if (status === 'completed') {
    statusClasses = "bg-semantic-success/10 border-semantic-success text-semantic-success";
  } else if (status === 'error') {
    statusClasses = "bg-semantic-danger/10 border-semantic-danger text-semantic-danger";
  } else if (status === 'waiting') {
    statusClasses = "bg-semantic-warning/10 border-semantic-warning text-semantic-warning";
  }

  return (
    <div className={`px-4 py-3 rounded-md border w-[180px] shadow-card ${statusClasses} transition-all duration-300 relative group`}>
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <div className="flex flex-col items-center justify-center">
        <div className="font-semibold text-sm mb-1 text-center leading-tight group-hover:scale-105 transition-transform duration-200">{label}</div>
        <div className="font-mono text-[10px] opacity-80 uppercase tracking-wider text-center line-clamp-1">{detail}</div>
      </div>
      <Handle type="source" position={Position.Bottom} className="opacity-0" />

      {/* Animated active state pulse */}
      {status === 'working' && (
        <div className="absolute -inset-1 rounded-md bg-brand-primary/20 animate-pulse -z-10" />
      )}
    </div>
  );
}

const nodeTypes = {
  agent: AgentNode,
};

import { useCaseStore } from '@/stores/case-store';
import { AgentId, AgentStatus, CaseStatus } from '@/lib/types';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Settings } from 'lucide-react';

// ---- Graph Logic ----
const agentIdToNodeId: Record<string, string> = {
  [AgentId.INTAKE]: '1',
  [AgentId.POLICY]: '2',
  [AgentId.LIABILITY]: '3',
  [AgentId.FRAUD]: '4',
  [AgentId.PAYOUT]: '5',
  [AgentId.AUDITOR]: '6',
};

const getInitialNodes = () => [
  { id: '1', type: 'agent', position: { x: 250, y: 50 }, data: { label: 'Intake Agent', status: 'idle', detail: 'Awaiting Run' } },
  { id: '2', type: 'agent', position: { x: 50, y: 200 }, data: { label: 'Policy Agent', status: 'idle', detail: 'Awaiting Intake' } },
  { id: '3', type: 'agent', position: { x: 250, y: 200 }, data: { label: 'Liability Agent', status: 'idle', detail: 'Awaiting Intake' } },
  { id: '4', type: 'agent', position: { x: 450, y: 200 }, data: { label: 'Fraud Agent', status: 'idle', detail: 'Awaiting Intake' } },
  { id: '5', type: 'agent', position: { x: 250, y: 350 }, data: { label: 'Payout Agent', status: 'idle', detail: 'Awaiting Agents' } },
  { id: '6', type: 'agent', position: { x: 250, y: 500 }, data: { label: 'Auditor Agent', status: 'idle', detail: 'Awaiting Payout' } },
];

const getInitialEdges = (): Edge[] => [
  { id: 'e1-2', source: '1', target: '2', style: { strokeWidth: 2, stroke: 'var(--color-neutral-border)' } as React.CSSProperties, animated: false, markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-neutral-border)' } },
  { id: 'e1-3', source: '1', target: '3', style: { strokeWidth: 2, stroke: 'var(--color-neutral-border)' } as React.CSSProperties, animated: false, markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-neutral-border)' } },
  { id: 'e1-4', source: '1', target: '4', style: { strokeWidth: 2, stroke: 'var(--color-neutral-border)' } as React.CSSProperties, animated: false, markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-neutral-border)' } },
  { id: 'e2-5', source: '2', target: '5', style: { strokeWidth: 2, stroke: 'var(--color-neutral-border)' } as React.CSSProperties, animated: false, markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-neutral-border)' } },
  { id: 'e3-5', source: '3', target: '5', style: { strokeWidth: 2, stroke: 'var(--color-neutral-border)' } as React.CSSProperties, animated: false, markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-neutral-border)' } },
  { id: 'e4-5', source: '4', target: '5', style: { strokeWidth: 2, stroke: 'var(--color-neutral-border)' } as React.CSSProperties, animated: false, markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-neutral-border)' } },
  { id: 'e5-6', source: '5', target: '6', style: { strokeWidth: 2, stroke: 'var(--color-neutral-border)' } as React.CSSProperties, animated: false, markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-neutral-border)' } },
];

export function WorkflowPane() {
  const params = useParams();
  const caseId = params?.caseId as string;
  const [nodes, setNodes, onNodesChange] = useNodesState(getInitialNodes());
  const [edges, setEdges, onEdgesChange] = useEdgesState(getInitialEdges());

  // Zustand State
  const caseStatus = useCaseStore(state => state.status);
  const agents = useCaseStore(state => state.agents);
  const currentAgent = useCaseStore(state => state.current_agent);

  // Sync Zustand agents to nodes
  useEffect(() => {
    setNodes((nds) => nds.map((node) => {
      // Find the agent ID that corresponds to this node ID
      const agentId = Object.entries(agentIdToNodeId).find(([_, nodeId]) => nodeId === node.id)?.[0] as AgentId;
      if (!agentId) return node;

      const agentState = agents[agentId];
      if (!agentState) return node;

      let detail = agentState.status === AgentStatus.IDLE ? 'Awaiting Pipeline' :
        agentState.status === AgentStatus.WORKING ? 'Actively Processing' :
          agentState.status === AgentStatus.COMPLETED ? 'Tasks Finished' :
            agentState.status === AgentStatus.ERROR ? 'System Error' : 'Waiting...';

      return {
        ...node,
        data: {
          ...node.data,
          status: agentState.status,
          detail: detail
        }
      };
    }));

    // Update edges based on agent status
    setEdges((eds) => eds.map((edge) => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      if (!sourceNode) return edge;

      const isSourceActive = sourceNode.data.status === AgentStatus.WORKING || sourceNode.data.status === AgentStatus.COMPLETED;
      const color = sourceNode.data.status === AgentStatus.COMPLETED ? 'var(--color-semantic-success)' :
        sourceNode.data.status === AgentStatus.WORKING ? 'var(--color-brand-primary)' : 'var(--color-neutral-border)';

      return {
        ...edge,
        animated: sourceNode.data.status === AgentStatus.WORKING,
        style: {
          ...edge.style,
          stroke: color,
          strokeWidth: sourceNode.data.status === AgentStatus.WORKING ? 3 : 2
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: color
        }
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

          <div className="flex items-center bg-neutral-surface shadow-card border border-neutral-border p-1 rounded-md">
            <div className="px-3 py-1.5 text-xs text-neutral-text-tertiary flex items-center">
              <div className={`w-2 h-2 rounded-full mr-2 ${caseStatus === CaseStatus.RUNNING ? 'bg-brand-primary animate-pulse' : 'bg-neutral-border'}`}></div>
              SSE Connected
            </div>
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
        fitViewOptions={{ padding: 0.5 }}
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
