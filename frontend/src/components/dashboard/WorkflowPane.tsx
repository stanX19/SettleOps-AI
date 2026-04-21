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
  const { label, status, detail, type } = data as { label: string, status: 'idle' | 'running' | 'success' | 'error' | 'warning', detail: string, type?:  string };
  
  let statusClasses = "bg-neutral-surface border-neutral-border text-neutral-text-secondary";
  
  if (status === 'running') {
    statusClasses = "bg-brand-primary-light border-brand-primary text-brand-on-primary agent-node-running";
  } else if (status === 'success') {
    statusClasses = "bg-semantic-success/10 border-semantic-success text-semantic-success";
  } else if (status === 'error') {
    statusClasses = "bg-semantic-danger/10 border-semantic-danger text-semantic-danger";
  } else if (status === 'warning') {
    statusClasses = "bg-semantic-warning/10 border-semantic-warning text-semantic-warning";
  }

  return (
    <div className={`px-4 py-3 rounded-md border w-[160px] shadow-card ${statusClasses} transition-all duration-300`}>
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <div className="flex flex-col items-center justify-center">
        <div className="font-semibold text-sm mb-1 text-center leading-tight">{label}</div>
        <div className="font-mono text-[10px] opacity-80 uppercase tracking-wider text-center">{detail}</div>
      </div>
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}

const nodeTypes = {
  agent: AgentNode,
};

// ---- Graph Logic ----
const getInitialNodes = () => [
  { id: '1', type: 'agent', position: { x: 250, y: 50 }, data: { label: 'Intake Agent', status: 'idle', detail: 'Awaiting Run' } },
  { id: '2', type: 'agent', position: { x: 50,  y: 200 }, data: { label: 'Policy Agent', status: 'idle', detail: 'Awaiting Intake' } },
  { id: '3', type: 'agent', position: { x: 250, y: 200 }, data: { label: 'Liability Agent', status: 'idle', detail: 'Awaiting Intake' } },
  { id: '4', type: 'agent', position: { x: 450, y: 200 }, data: { label: 'Fraud Agent', status: 'idle', detail: 'Awaiting Intake' } },
  { id: '5', type: 'agent', position: { x: 250, y: 350 }, data: { label: 'Payout Agent', status: 'idle', detail: 'Awaiting Agents' } },
  { id: '6', type: 'agent', position: { x: 250, y: 500 }, data: { label: 'Auditor Agent', status: 'idle', detail: 'Awaiting Payout' } },
];

const getInitialEdges = (): Edge[] => [
  { id: 'e1-2', source: '1', target: '2', style: { strokeWidth: 2, stroke: '#E5E7EB' } as React.CSSProperties, animated: false },
  { id: 'e1-3', source: '1', target: '3', style: { strokeWidth: 2, stroke: '#E5E7EB' } as React.CSSProperties, animated: false },
  { id: 'e1-4', source: '1', target: '4', style: { strokeWidth: 2, stroke: '#E5E7EB' } as React.CSSProperties, animated: false },
  { id: 'e2-5', source: '2', target: '5', style: { strokeWidth: 2, stroke: '#E5E7EB' } as React.CSSProperties, animated: false },
  { id: 'e3-5', source: '3', target: '5', style: { strokeWidth: 2, stroke: '#E5E7EB' } as React.CSSProperties, animated: false },
  { id: 'e4-5', source: '4', target: '5', style: { strokeWidth: 2, stroke: '#E5E7EB' } as React.CSSProperties, animated: false },
  { id: 'e5-6', source: '5', target: '6', style: { strokeWidth: 2, stroke: '#E5E7EB' } as React.CSSProperties, animated: false },
];

export function WorkflowPane() {
  const [nodes, setNodes] = useNodesState(getInitialNodes());
  const [edges, setEdges] = useEdgesState(getInitialEdges());
  const [demoState, setDemoState] = useState<'idle' | 'running' | 'completed'>('idle');

  const updateNode = useCallback((id: string, status: string, detail: string) => {
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, status, detail } } : n));
  }, [setNodes]);

  const updateEdge = useCallback((id: string, active: boolean, color: string, addAuditorLoop = false) => {
    //@ts-ignore
    setEdges((eds) => {
      let updatedEds = eds.map((e) => e.id === id ? { ...e, animated: active, style: { strokeWidth: 2, stroke: color } } : e);
      if (addAuditorLoop && !updatedEds.find(e => e.id === 'e6-3')) {
        updatedEds.push({
          id: 'e6-3',
          source: '6',
          target: '3',
          animated: true,
          type: 'smoothstep',
          label: 'Needs Review',
          labelBgPadding: [8, 4] as [number, number],
          labelBgBorderRadius: 4,
          labelBgStyle: { fill: '#FFF8E1', color: '#111827', stroke: '#EF4444' },
          style: { strokeWidth: 2, stroke: '#EF4444', strokeDasharray: '5, 5' } as React.CSSProperties,
          markerEnd: { type: MarkerType.ArrowClosed, color: '#EF4444' }
        } as Edge);
      }
      if (!addAuditorLoop) {
        updatedEds = updatedEds.filter(e => e.id !== 'e6-3');
      }
      return updatedEds;
    });
  }, [setEdges]);

  const runDemo = () => {
    setDemoState('running');
    setNodes(getInitialNodes());
    setEdges(getInitialEdges());
    
    // Intake
    setTimeout(() => { updateNode('1', 'running', 'Parsing PDFs...'); }, 500);
    setTimeout(() => { 
      updateNode('1', 'success', 'Parsed 1.2s');
      updateEdge('e1-2', true, '#FFC107'); updateEdge('e1-3', true, '#FFC107'); updateEdge('e1-4', true, '#FFC107');
      updateNode('2', 'running', 'Checking rules...');
      updateNode('3', 'running', 'Evaluating fault...');
      updateNode('4', 'running', 'Scoring risk...');
    }, 2000);

    // Parallel Branch 1: Policy
    setTimeout(() => { 
      updateNode('2', 'success', 'Clause 4.2(a) Match'); 
      updateEdge('e1-2', false, '#10B981');
      updateEdge('e2-5', true, '#FFC107');
    }, 3500);

    // Parallel Branch 2: Fraud
    setTimeout(() => { 
      updateNode('4', 'success', 'Suspicion 0.18');
      updateEdge('e1-4', false, '#10B981');
      updateEdge('e4-5', true, '#FFC107'); 
    }, 4500);

    // Parallel Branch 3: Liability
    setTimeout(() => { 
      updateNode('3', 'success', 'TP 100% Fault'); 
      updateEdge('e1-3', false, '#10B981');
      updateEdge('e3-5', true, '#FFC107');
    }, 5500);

    // Payout Reconciles
    setTimeout(() => {
      updateEdge('e2-5', false, '#10B981'); updateEdge('e3-5', false, '#10B981'); updateEdge('e4-5', false, '#10B981');
      updateNode('5', 'running', 'Computing logic...');
    }, 6000);

    setTimeout(() => {
      updateNode('5', 'success', 'Payout RM 4,200');
      updateEdge('e5-6', true, '#FFC107');
      updateNode('6', 'running', 'Challenging draft...');
    }, 7500);

    // Auditor Rejects (Wow Moment)
    setTimeout(() => {
      updateNode('6', 'error', 'Error Caught');
      updateEdge('e5-6', false, '#EF4444');
      updateEdge('e6-3', false, '#EF4444', true); // Show backward arrow
      updateNode('3', 'warning', 'Re-evaluating...');
    }, 9000);

    // Liability Fixes it
    setTimeout(() => {
      updateEdge('e6-3', false, '#EF4444', false); // Hide backward arrow
      updateNode('3', 'success', 'TP 50% / Claim 50%');
      updateEdge('e3-5', true, '#FFC107');
      updateNode('5', 'running', 'Re-computing...');
      updateNode('6', 'idle', 'Awaiting Payout');
    }, 11500);

    // Final Approval
    setTimeout(() => {
      updateEdge('e3-5', false, '#10B981');
      updateNode('5', 'success', 'Payout RM 2,100');
      updateEdge('e5-6', true, '#FFC107');
      updateNode('6', 'running', 'Reviewing...');
    }, 13000);

    setTimeout(() => {
      updateEdge('e5-6', false, '#10B981');
      updateNode('6', 'success', 'All Checks Passed');
      setDemoState('completed');
    }, 14500);
  };

  return (
    <div className="flex-1 w-full h-full relative border-r border-neutral-border">
      <div className="absolute top-4 left-6 right-6 z-10 flex items-center justify-between pointer-events-none">
        <div>
          <h2 className="text-lg font-semibold text-neutral-text-primary">Live Orchestration</h2>
          <div className="text-sm font-mono text-neutral-text-secondary mt-1 flex items-center">
            Status: 
            {demoState === 'running' ? (
              <span className="text-brand-primary ml-2 flex items-center"><span className="w-2 h-2 rounded-full bg-brand-primary animate-pulse mr-2"></span>Running LangGraph DAG</span>
            ) : demoState === 'completed' ? (
              <span className="text-semantic-success ml-2 flex items-center">Awaiting Human Approval</span>
            ) : (
              <span className="text-neutral-text-secondary ml-2 flex items-center">Awaiting SSE Trigger</span>
            )}
          </div>
        </div>
        
        <div className="pointer-events-auto flex items-center bg-neutral-surface shadow-card border border-neutral-border p-1 rounded-md">
          {demoState !== 'running' ? (
            <Button size="sm" variant="ghost" onClick={runDemo} className="text-brand-primary hover:text-brand-primary hover:bg-brand-primary-light h-8">
              <Play className="w-4 h-4 mr-1.5" /> Start Agent SSE Loop
            </Button>
          ) : (
            <Button size="sm" variant="ghost" disabled className="text-neutral-text-tertiary h-8">
              <RotateCcw className="w-4 h-4 mr-1.5 animate-spin" /> Processing...
            </Button>
          )}
        </div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
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
