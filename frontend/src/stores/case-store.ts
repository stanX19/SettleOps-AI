import { create } from "zustand";
import {
  CaseSnapshot,
  CaseStatus,
  AgentId,
  AgentStatus,
  OfficerMessageInfo,
  SseWorkflowStarted,
  SseAgentStatusChanged,
  SseAgentOutput,
  SseAgentMessageToAgent,
  SseArtifactCreated,
  SseWorkflowCompleted,
  BlackboardSection
} from "../lib/types";

interface CaseState extends CaseSnapshot {
  // Store Actions
  setCase: (snapshot: CaseSnapshot) => void;
  reset: () => void;
  
  // Selection
  selectedAgentId: AgentId | null;
  setSelectedAgentId: (id: AgentId | null) => void;

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
  audio_urls: Record<string, string>;
  addAudioUrl: (text: string, url: string) => void;
}

const initialState: CaseSnapshot & { blackboard_mode: 'blackboard' | 'chat'; selectedAgentId: AgentId | null } = {
  case_id: "",
  status: CaseStatus.SUBMITTED,
  submitted_at: "",
  documents: [],
  agents: {},
  blackboard: {},
  citations: {},
  artifacts: [],
  officer_messages: [],
  auditor_loop_count: 0,
  officer_challenge_count: 0,
  awaiting_clarification: false,
  chatbox_enabled: false,
  blackboard_mode: 'blackboard',
  audio_urls: {},
  current_agent: null,
  selectedAgentId: null,
};

export const useCaseStore = create<CaseState>((set) => ({
  ...initialState,

  setCase: (snapshot) => set(snapshot),
  
  reset: () => set(initialState),

  setBlackboardMode: (mode) => set({ blackboard_mode: mode }),

  setSelectedAgentId: (id) => set({ selectedAgentId: id }),

  handleWorkflowStarted: (data) => set(() => ({
    status: CaseStatus.RUNNING,
    current_agent: data.target_agent || null,
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

  handleAgentOutput: (data) => set((state) => {
    const nextBlackboard = {
      ...state.blackboard,
      [data.section]: data.data
    };

    // Update logs for the agent if provided
    const newAgents = { ...state.agents };
    if (data.logs && data.logs.length > 0) {
      const agentId = data.agent;
      newAgents[agentId] = {
        ...(newAgents[agentId] || { status: AgentStatus.IDLE, sub_tasks: {} }),
        logs: data.logs
      };
    }

    let nextDocuments = state.documents;

    // PROBLEM 1 FIX: If CaseFacts changed, we must update the doc_type/tags in the documents array
    // so that the left pane (InputsPane) refreshes immediately.
    if (data.section === BlackboardSection.CASE_FACTS) {
      const taggedDocs = data.data.tagged_documents || {};
      nextDocuments = state.documents.map(doc => {
        if (doc.index !== undefined) {
          const rawTags = taggedDocs[String(doc.index)];
          if (rawTags) {
            return {
              ...doc,
              doc_type: Array.isArray(rawTags) ? (rawTags[0] || "uploaded") : rawTags,
              tags: Array.isArray(rawTags) ? rawTags : [rawTags]
            };
          }
        }
        return doc;
      });
    }

    // Citations are top-level on the event, not nested under data.
    // Replace (not merge) the section's citations so reruns overwrite cleanly.
    const incomingCitations = data.citations;
    const nextCitations =
      incomingCitations !== undefined
        ? { ...state.citations, [data.section]: incomingCitations }
        : state.citations;

    return {
      blackboard: nextBlackboard,
      documents: nextDocuments,
      agents: newAgents,
      citations: nextCitations,
    };
  }),

  handleAgentMessageToAgent: (data) => set(() => ({
    auditor_loop_count: data.loop_count,
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
  
  addOfficerMessage: (msg) => set((state) => {
    // Deduplicate by message_id
    if (state.officer_messages.some(m => m.message_id === msg.message_id)) {
      return state;
    }
    return {
      officer_messages: [...state.officer_messages, msg]
    };
  }),

  addAudioUrl: (text, url) => set((state) => ({
    audio_urls: { ...state.audio_urls, [text]: url }
  })),
}));
