import { useCaseStore } from "../stores/case-store";
import { CaseSseEventName } from "./types";

let API_BASE = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

// Senior Trick: In local dev, if NEXT_PUBLIC_API_URL is missing, we bypass the 
// Next.js proxy for SSE by connecting directly to the backend port (8000).
// This avoids "Scenario C" (silent connection) caused by proxy buffering.
if (!API_BASE && typeof window !== "undefined" && window.location.hostname === "localhost") {
  API_BASE = "http://localhost:8000";
}

export class SseClient {
  private eventSource: EventSource | null = null;
  private caseId: string;
  private lastDataMap: Record<string, string> = {};
  private onConnect?: () => void;

  constructor(caseId: string, onConnect?: () => void) {
    this.caseId = caseId;
    this.onConnect = onConnect;
  }

  connect() {
    if (this.eventSource) {
      this.disconnect();
    }
    this.lastDataMap = {};

    const url = `${API_BASE}/api/v1/cases/${this.caseId}/stream`;
    this.eventSource = new EventSource(url);

    this.eventSource.onopen = () => {
      console.log("SSE Connected for case:", this.caseId);
      this.onConnect?.();
    };

    this.eventSource.addEventListener("ping", () => {
      console.log("SSE Heartbeat (ping) received");
    });

    this.eventSource.addEventListener("workflow.started", (e) => {
      console.log("SSE: workflow.started", e.data);
      const data = JSON.parse(e.data);
      useCaseStore.getState().handleWorkflowStarted(data);
    });

    this.eventSource.addEventListener("agent.status_changed", (e) => {
      console.log("SSE: agent.status_changed", e.data);
      const data = JSON.parse(e.data);
      useCaseStore.getState().handleAgentStatusChanged(data);
    });

    this.eventSource.addEventListener("agent.output", (e) => {
      console.log("SSE: agent.output", e.data);
      const data = JSON.parse(e.data);
      useCaseStore.getState().handleAgentOutput(data);
    });

    this.eventSource.addEventListener("agent.message_to_agent", (e) => {
      console.log("SSE: agent.message_to_agent", e.data);
      const data = JSON.parse(e.data);
      useCaseStore.getState().handleAgentMessageToAgent(data);
    });

    this.eventSource.addEventListener("artifact.created", (e) => {
      console.log("SSE: artifact.created", e.data);
      const data = JSON.parse(e.data);
      useCaseStore.getState().handleArtifactCreated(data);
    });

    this.eventSource.addEventListener("workflow.completed", (e) => {
      console.log("SSE: workflow.completed", e.data);
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
      // We do NOT call disconnect() here. EventSource natively auto-reconnects
      // on connection loss unless close() is explicitly called.
    };
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}
