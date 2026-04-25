import { create } from "zustand";
import { 
  CaseSnapshot, 
  CaseStatus, 
  AgentId, 
  AgentStatus,
  AgentStateInfo,
  DocumentInfo,
  ArtifactInfo,
  OfficerMessageInfo,
  SseWorkflowStarted,
  SseAgentStatusChanged,
  SseAgentOutput,
  SseAgentMessageToAgent,
  SseArtifactCreated,
  SseWorkflowCompleted
} from "../lib/types";

interface CaseState extends CaseSnapshot {
  // Store Actions
  setCase: (snapshot: CaseSnapshot) => void;
  reset: () => void;
  
  // SSE Event Handlers
  handleWorkflowStarted: (data: SseWorkflowStarted) => void;
  handleAgentStatusChanged: (data: SseAgentStatusChanged) => void;
  handleAgentOutput: (data: SseAgentOutput) => void;
  handleAgentMessageToAgent: (data: SseAgentMessageToAgent) => void;
  handleArtifactCreated: (data: SseArtifactCreated) => void;
  handleWorkflowCompleted: (data: SseWorkflowCompleted) => void;
  addOfficerMessage: (message: OfficerMessageInfo) => void;
  setBlackboardMode: (mode: 'blackboard' | 'chat') => void;
  blackboard_mode: 'blackboard' | 'chat';
}

const initialState: CaseSnapshot & { blackboard_mode: 'blackboard' | 'chat' } = {
  case_id: "",
  status: CaseStatus.SUBMITTED,
  submitted_at: "",
  documents: [],
  agents: {},
  blackboard: {},
  artifacts: [],
  officer_messages: [],
  auditor_loop_count: 0,
  officer_challenge_count: 0,
  awaiting_clarification: false,
  chatbox_enabled: false,
  blackboard_mode: 'blackboard',
  current_agent: null,
};

export const useCaseStore = create<CaseState>((set) => ({
  ...initialState,

  setCase: (snapshot) => set(snapshot),
  
  reset: () => set(initialState),

  setBlackboardMode: (mode) => set({ blackboard_mode: mode }),

  handleWorkflowStarted: (data) => set((state) => ({
    status: CaseStatus.RUNNING,
    current_agent: data.target_agent || null,
    // On officer rerun, we might want to clear downstream agent statuses, 
    // but the backend will send status_changed events anyway.
  })),

  handleAgentStatusChanged: (data) => set((state) => {
    const agentId = data.agent;
    const subTaskName = data.sub_task;
    
    const newAgents = { ...state.agents };
    
    if (subTaskName) {
      // Update sub-task status
      const parentState = newAgents[agentId] || { status: AgentStatus.IDLE, sub_tasks: {} };
      newAgents[agentId] = {
        ...parentState,
        sub_tasks: {
          ...(parentState.sub_tasks || {}),
          [subTaskName]: {
            ...(parentState.sub_tasks?.[subTaskName] || { status: AgentStatus.IDLE }),
            status: data.status,
          }
        }
      };
    } else {
      // Update parent agent status
      newAgents[agentId] = {
        ...(newAgents[agentId] || { status: AgentStatus.IDLE, sub_tasks: {} }),
        status: data.status,
      };
    }

    return {
      agents: newAgents,
      current_agent: data.status === AgentStatus.WORKING ? data.agent : state.current_agent
    };
  }),

  handleAgentOutput: (data) => set((state) => ({
    blackboard: {
      ...state.blackboard,
      [data.section]: data.data
    }
  })),

  handleAgentMessageToAgent: (data) => set((state) => ({
    auditor_loop_count: data.loop_count,
    // We could also add a system message to officer_messages here if we want to show agent talk
  })),

  handleArtifactCreated: (data) => set((state) => ({
    artifacts: [
      ...state.artifacts.map(a => 
        a.artifact_type === data.artifact_type ? { ...a, superseded: true } : a
      ),
      {
        artifact_type: data.artifact_type,
        filename: data.filename,
        url: data.url,
        ready: true,
        version: data.version,
        superseded: false
      }
    ]
  })),

  handleWorkflowCompleted: (data) => set((state) => ({
    status: data.status,
    pdf_ready: data.pdf_ready,
    auditor_loop_count: data.auditor_loop_count,
    officer_challenge_count: data.officer_challenge_count,
    chatbox_enabled: data.chatbox_enabled,
    topology: data.topology || state.topology,
    current_agent: null
  })),
  
  addOfficerMessage: (msg) => set((state) => ({
    officer_messages: [...state.officer_messages, msg]
  })),
}));
