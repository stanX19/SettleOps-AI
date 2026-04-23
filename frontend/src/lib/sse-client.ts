import { useCaseStore } from "../stores/case-store";
import { CaseSseEventName } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class SseClient {
  private eventSource: EventSource | null = null;
  private caseId: string;

  constructor(caseId: string) {
    this.caseId = caseId;
  }

  connect() {
    if (this.eventSource) {
      this.disconnect();
    }

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

    this.eventSource.onerror = (error) => {
      console.error("SSE Connection Error:", error);
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
