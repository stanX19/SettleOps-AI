import { useCaseStore } from "../stores/case-store";
import { CaseSseEventName } from "./types";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

export class SseClient {
  private eventSource: EventSource | null = null;
  private caseId: string;
  private lastDataMap: Record<string, string> = {};

  constructor(caseId: string) {
    this.caseId = caseId;
  }

  connect() {
    if (this.eventSource) {
      this.disconnect();
    }
    this.lastDataMap = {};

    const url = `${API_BASE}/api/v1/cases/${this.caseId}/stream`;
    this.eventSource = new EventSource(url);

    this.eventSource.addEventListener("workflow.started", (e) => {
      const data = JSON.parse(e.data);
      useCaseStore.getState().handleWorkflowStarted(data);
    });

    this.eventSource.addEventListener("agent.status_changed", (e) => {
      const data = JSON.parse(e.data);
      useCaseStore.getState().handleAgentStatusChanged(data);
    });

    this.eventSource.addEventListener("agent.output", (e) => {
      const data = JSON.parse(e.data);
      useCaseStore.getState().handleAgentOutput(data);
    });

    this.eventSource.addEventListener("agent.message_to_agent", (e) => {
      const data = JSON.parse(e.data);
      useCaseStore.getState().handleAgentMessageToAgent(data);
    });

    this.eventSource.addEventListener("artifact.created", (e) => {
      const data = JSON.parse(e.data);
      useCaseStore.getState().handleArtifactCreated(data);
    });

    this.eventSource.addEventListener("workflow.completed", (e) => {
      const data = JSON.parse(e.data);
      useCaseStore.getState().handleWorkflowCompleted(data);
    });

    // Chat Events (AI Strategist)
    this.eventSource.addEventListener("Notif", (e) => {
      if (this.lastDataMap["Notif"] === e.data) return;
      this.lastDataMap["Notif"] = e.data;
      
      const data = JSON.parse(e.data);
      useCaseStore.getState().addOfficerMessage({
        message_id: `notif-${data.message}`, // Deterministic ID for deduplication
        role: "assistant",
        message: data.message,
        timestamp: new Date().toISOString()
      });
    });

    this.eventSource.addEventListener("Replies", (e) => {
      if (this.lastDataMap["Replies"] === e.data) return;
      this.lastDataMap["Replies"] = e.data;

      const data = JSON.parse(e.data);
      useCaseStore.getState().addOfficerMessage({
        message_id: data.message_id,
        role: "assistant",
        message: data.text,
        timestamp: new Date().toISOString()
      });
    });

    this.eventSource.addEventListener("ToolCall", (e) => {
      if (this.lastDataMap["ToolCall"] === e.data) return;
      this.lastDataMap["ToolCall"] = e.data;

      const data = JSON.parse(e.data);
      useCaseStore.getState().addOfficerMessage({
        message_id: `tool-${data.tool_name}`, // Deterministic ID for deduplication
        role: "assistant",
        message: `*Calling tool: ${data.tool_name}...*`,
        timestamp: new Date().toISOString()
      });
    });

    this.eventSource.addEventListener("TTSResult", (e) => {
      const data = JSON.parse(e.data);
      useCaseStore.getState().addAudioUrl(data.text, data.audio_url);
    });

    this.eventSource.onerror = (error) => {
      console.error("SSE Connection Error for case:", this.caseId, "State:", this.eventSource?.readyState, error);
      this.disconnect();
      // Auto-reconnect could be implemented here with a timeout
    };
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}
