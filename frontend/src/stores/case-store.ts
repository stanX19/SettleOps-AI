import { create } from "zustand";
import {
  CaseSnapshot,
  CaseStatus,
  AgentId,
  AgentStatus,
  OfficerMessageInfo,
  RerunKind,
  SseWorkflowStarted,
  SseAgentStatusChanged,
  SseAgentOutput,
  SseAgentMessageToAgent,
  SseArtifactCreated,
  SseWorkflowCompleted,
  BlackboardSection
} from "../lib/types";
import { normalizeCaseSnapshot, normalizeArtifact, getBackendUrl } from "../lib/utils";
import { api } from "../lib/api";

export interface RerunEvent {
  id: string;
  kind: RerunKind;
  from_agent: AgentId;
  to_agent: AgentId;
  target_agent?: AgentId;
  target_cluster?: string;
  target_subtask?: string;
  retry_scope: "cluster" | "agent" | "subtask";
  trigger_node_id?: string;
  loop_count: number;
  timestamp: string;
  /** Set to "completed" or "failed" when the target agent finishes. */
  resolved?: "completed" | "failed";
}

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
  handleAgentOutput: (data: Pick<SseAgentOutput, "section" | "data"> & Partial<SseAgentOutput>) => void;
  handleAgentMessageToAgent: (data: SseAgentMessageToAgent) => void;
  handleArtifactCreated: (data: SseArtifactCreated) => void;
  handleWorkflowCompleted: (data: SseWorkflowCompleted) => void;
  addOfficerMessage: (message: OfficerMessageInfo) => void;

  // Blackboard / Chat mode
  setBlackboardMode: (mode: 'blackboard' | 'chat') => void;
  blackboard_mode: 'blackboard' | 'chat';
  /** Whether the chat panel is in challenge-rerun mode vs AI-strategist mode. */
  chat_challenge_mode: boolean;
  setChatChallengeMode: (enabled: boolean) => void;

  // Rerun tracking
  rerun_events: RerunEvent[];
  active_workflow_trigger: SseWorkflowStarted["trigger"] | null;

  // Challenge flow
  /** Agent the officer wants to challenge — set when clicking a node's Challenge button. */
  pendingChallengeAgent: AgentId | null;
  setPendingChallengeAgent: (agent: AgentId | null) => void;

  // Audio
  audio_urls: Record<string, string>;
  addAudioUrl: (text: string, url: string) => void;

  refreshCase: (caseId: string) => Promise<void>;
}

const initialState: CaseSnapshot & {
  blackboard_mode: 'blackboard' | 'chat';
  chat_challenge_mode: boolean;
  selectedAgentId: AgentId | null;
  audio_urls: Record<string, string>;
  rerun_events: RerunEvent[];
  active_workflow_trigger: SseWorkflowStarted["trigger"] | null;
  pendingChallengeAgent: AgentId | null;
} = {
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
  pdf_ready: false,
  blackboard_mode: 'blackboard',
  chat_challenge_mode: false,
  audio_urls: {},
  current_agent: null,
  selectedAgentId: null,
  rerun_events: [],
  active_workflow_trigger: null,
  pendingChallengeAgent: null,
};

export const useCaseStore = create<CaseState>((set) => ({
  ...initialState,

  setCase: (snapshot) => set(normalizeCaseSnapshot(snapshot)),

  reset: () => set(initialState),

  refreshCase: async (caseId) => {
    try {
      const snapshot = await api.getCaseSnapshot(caseId);
      set(normalizeCaseSnapshot(snapshot));
    } catch (error) {
      console.error("Failed to refresh case:", error);
    }
  },

  setBlackboardMode: (mode) => set({ blackboard_mode: mode }),

  setChatChallengeMode: (enabled) => set({ chat_challenge_mode: enabled }),

  setSelectedAgentId: (id) => set({ selectedAgentId: id }),

  setPendingChallengeAgent: (agent) => set({ pendingChallengeAgent: agent }),

  handleWorkflowStarted: (data) => set(() => ({
    status: CaseStatus.RUNNING,
    current_agent: data.target_agent || null,
    active_workflow_trigger: data.trigger,
    ...(data.trigger === "officer_rerun" ? { rerun_events: [] } : {}),
  })),

  handleAgentStatusChanged: (data) => set((state) => {
    const agentId = data.agent;
    const subTaskName = data.sub_task;

    const newAgents = { ...state.agents };

    if (subTaskName) {
      const parentState = newAgents[agentId] || { status: AgentStatus.IDLE, sub_tasks: {} };
      const prevSubTask = parentState.sub_tasks?.[subTaskName] || { status: AgentStatus.IDLE };
      const incomingLogs = data.logs && data.logs.length > 0 ? data.logs : undefined;
      const incomingLogEntries = data.log_entries && data.log_entries.length > 0 ? data.log_entries : undefined;
      newAgents[agentId] = {
        ...parentState,
        sub_tasks: {
          ...(parentState.sub_tasks || {}),
          [subTaskName]: {
            ...prevSubTask,
            status: data.status,
            ...(incomingLogs ? { logs: [...(prevSubTask.logs ?? []), ...incomingLogs] } : {}),
            ...(incomingLogEntries
              ? { log_entries: [...(prevSubTask.log_entries ?? []), ...incomingLogEntries] }
              : {}),
          }
        }
      };
    } else {
      newAgents[agentId] = {
        ...(newAgents[agentId] || { status: AgentStatus.IDLE, sub_tasks: {} }),
        status: data.status,
      };
    }

    // Resolve pending rerun_events whose target matches this agent/subtask completing/erroring
    let nextRerunEvents = state.rerun_events;
    const isTerminal = data.status === AgentStatus.COMPLETED || data.status === AgentStatus.ERROR;
    if (isTerminal && state.rerun_events.length > 0) {
      const resolution: "completed" | "failed" =
        data.status === AgentStatus.COMPLETED ? "completed" : "failed";
      nextRerunEvents = state.rerun_events.map((ev) => {
        if (ev.resolved) return ev;
        const agentMatches = ev.to_agent === agentId;
        const subtaskMatches = ev.retry_scope === "subtask"
          ? ev.target_subtask === subTaskName
          : !subTaskName;
        if (agentMatches && subtaskMatches) {
          return { ...ev, resolved: resolution };
        }
        return ev;
      });
    }

    return {
      agents: newAgents,
      rerun_events: nextRerunEvents,
      current_agent: data.status === AgentStatus.WORKING ? data.agent : state.current_agent
    };
  }),

  handleAgentOutput: (data) => set((state) => {
    const nextBlackboard = {
      ...state.blackboard,
      [data.section]: data.data
    };

    const newAgents = { ...state.agents };
    if (data.agent && (data.logs?.length || data.log_entries?.length)) {
      const agentId = data.agent;
      newAgents[agentId] = {
        ...(newAgents[agentId] || { status: AgentStatus.IDLE, sub_tasks: {} }),
        ...(data.logs?.length ? { logs: data.logs } : {}),
        ...(data.log_entries?.length ? { log_entries: data.log_entries } : {}),
      };
    }

    let nextDocuments = state.documents;

    if (data.section === BlackboardSection.CASE_FACTS) {
      const caseFacts = data.data as { tagged_documents?: Record<string, string | string[]> };
      const taggedDocs = caseFacts.tagged_documents || {};
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

    const incomingCitations = data.citation_summary;
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

  handleAgentMessageToAgent: (data) => set((state) => {
    const next: Partial<typeof state> = { auditor_loop_count: data.loop_count };
    if (data.rerun_kind) {
      if (
        state.active_workflow_trigger === "officer_rerun" &&
        data.rerun_kind === RerunKind.AUDITOR_RERUN
      ) {
        return next;
      }
      const event: RerunEvent = {
        id: `${data.rerun_kind}-${data.to_agent}-${data.loop_count}-${data.timestamp}`,
        kind: data.rerun_kind,
        from_agent: data.from_agent,
        to_agent: data.to_agent,
        target_agent: data.target_agent,
        target_cluster: data.target_cluster,
        target_subtask: data.target_subtask,
        retry_scope: data.retry_scope ?? "cluster",
        trigger_node_id: data.trigger_node_id,
        loop_count: data.loop_count,
        timestamp: data.timestamp,
      };
      next.rerun_events = [...state.rerun_events, event];
    }
    return next;
  }),

  handleArtifactCreated: (data) => set((state) => ({
    artifacts: [
      ...state.artifacts.map(a =>
        a.artifact_type === data.artifact_type ? { ...a, superseded: true } : a
      ),
      normalizeArtifact({
        artifact_type: data.artifact_type,
        filename: data.filename,
        url: data.url,
        ready: true,
        version: data.version,
        superseded: false
      })
    ]
  })),

  handleWorkflowCompleted: (data) => set((state) => {
    const newAgents = { ...state.agents };
    Object.keys(newAgents).forEach(agentId => {
      if (newAgents[agentId].status !== AgentStatus.COMPLETED) {
        newAgents[agentId] = { ...newAgents[agentId], status: AgentStatus.COMPLETED };
      }
      if (newAgents[agentId].sub_tasks) {
        const newSubTasks = { ...newAgents[agentId].sub_tasks };
        let updated = false;
        Object.keys(newSubTasks).forEach(subTaskId => {
          if (newSubTasks[subTaskId].status !== AgentStatus.COMPLETED) {
            newSubTasks[subTaskId] = { ...newSubTasks[subTaskId], status: AgentStatus.COMPLETED };
            updated = true;
          }
        });
        if (updated) {
          newAgents[agentId] = { ...newAgents[agentId], sub_tasks: newSubTasks };
        }
      }
    });

    // When a rerun finishes (RUNNING → AWAITING_APPROVAL/ESCALATED), auto-switch back
    // to blackboard so the officer sees the updated section immediately.
    const wasRunning = state.status === CaseStatus.RUNNING;
    const rerunCompleted =
      wasRunning &&
      (data.status === CaseStatus.AWAITING_APPROVAL || data.status === CaseStatus.ESCALATED);

    return {
      status: data.status,
      pdf_ready: data.pdf_ready,
      auditor_loop_count: data.auditor_loop_count,
      officer_challenge_count: data.officer_challenge_count,
      chatbox_enabled: data.chatbox_enabled,
      topology: data.topology || state.topology,
      current_agent: null,
      agents: newAgents,
      active_workflow_trigger: null,
      ...(rerunCompleted
        ? { blackboard_mode: 'blackboard' as const, chat_challenge_mode: false }
        : {}),
    };
  }),

  addOfficerMessage: (msg) => set((state) => {
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
