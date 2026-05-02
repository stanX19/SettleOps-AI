import {
  CaseSnapshot,
  CaseStatus,
  OfficerMessageType,
  AgentId,
  CaseListItem
} from "./types";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

/**
 * Typed error thrown for non-2xx API responses. Callers can branch on
 * `status` (e.g. show a "not found" UI for 404s) instead of pattern-matching
 * the message string.
 */
export class ApiError extends Error {
  status: number;
  url: string;
  constructor(status: number, url: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.url = url;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorDetail = "Unknown error";
    // Clone the response so we can read it twice (json then text)
    const cloned = response.clone();
    try {
      const error = await response.json();
      errorDetail = error.detail || JSON.stringify(error);
    } catch (e) {
      errorDetail = (await cloned.text()) || response.statusText;
    }
    // NOTE: We deliberately don't `console.error` here — Next.js dev mode
    // promotes console.errors into a full-screen overlay even when the
    // caller already handles the failure. Callers should log/render based
    // on `ApiError.status` instead.
    throw new ApiError(response.status, response.url, errorDetail);
  }
  return response.json();
}

export const api = {
  /**
   * List all cases for the dashboard queue
   */
  async listCases(): Promise<CaseListItem[]> {
    const res = await fetch(`${API_BASE}/api/v1/cases`);
    return handleResponse(res);
  },

  /**
   * Fetch a full snapshot of a specific case
   */
  async getCaseSnapshot(caseId: string): Promise<CaseSnapshot> {
    if (!caseId) {
      throw new Error("caseId is required for getCaseSnapshot");
    }
    const baseUrl = API_BASE.replace(/\/$/, "");
    const res = await fetch(`${baseUrl}/api/v1/cases/${caseId}`);
    return handleResponse(res);
  },

  /**
   * Approve a case
   */
  async approveCase(caseId: string): Promise<{ status: CaseStatus; pdf_ready: boolean }> {
    const res = await fetch(`${API_BASE}/api/v1/cases/${caseId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    return handleResponse(res);
  },

  /**
   * Approve a case with a signature
   */
  async approveWithSignature(caseId: string, data: { signer_name: string, designation: string, sign_date: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/signature/${caseId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  /**
   * Render a signed PDF preview without persisting it as an artifact.
   * Returns the raw PDF as a Blob — the caller is responsible for the
   * object-URL lifecycle. Used by the Signature Modal to render the
   * "Final Review (Signed)" step before the operator commits to final
   * approval.
   */
  async previewSignedPdf(caseId: string, data: { signer_name: string, designation: string, sign_date: string }): Promise<Blob> {
    const res = await fetch(`${API_BASE}/api/v1/signature/${caseId}/preview-signed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      let errorDetail = "Unknown error";
      const cloned = res.clone();
      try {
        const error = await res.json();
        errorDetail = error.detail || JSON.stringify(error);
      } catch {
        errorDetail = (await cloned.text()) || res.statusText;
      }
      console.error(`[API Error] ${res.status} ${res.url}:`, errorDetail);
      throw new Error(errorDetail);
    }
    return res.blob();
  },

  /**
   * Decline a case with a reason
   */
  async declineCase(caseId: string, reason: string): Promise<{ status: CaseStatus }> {
    const res = await fetch(`${API_BASE}/api/v1/cases/${caseId}/decline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    return handleResponse(res);
  },

  /**
   * Send an officer message (challenge)
   */
  async sendMessage(
    caseId: string,
    message: string,
    type: OfficerMessageType = OfficerMessageType.FREEFORM,
    targetAgent?: AgentId
  ): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/cases/${caseId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        type,
        ...(targetAgent ? { target_agent: targetAgent } : {}),
      }),
    });
    return handleResponse(res);
  },

  /**
   * Initialize a draft case and get a case ID
   */
  async initiateDraftCase(): Promise<{ case_id: string; status: CaseStatus }> {
    const res = await fetch(`${API_BASE}/api/v1/cases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    return handleResponse(res);
  },

  /**
   * Submit documents for a specific case ID and start the workflow
   */
  async submitDocuments(
    caseId: string,
    documents: File[]
  ): Promise<{ case_id: string; status: CaseStatus }> {
    const form = new FormData();
    for (const doc of documents) {
      form.append("documents", doc);
    }

    const res = await fetch(`${API_BASE}/api/v1/cases/${caseId}/documents`, {
      method: "POST",
      body: form,
    });
    return handleResponse(res);
  },

  /**
   * Legacy wrapper: Submit a new case with required documents.
   * Now performs draft creation then document submission.
   */
  async createCase(documents: File[]): Promise<{ case_id: string }> {
    const draft = await this.initiateDraftCase();
    return this.submitDocuments(draft.case_id, documents);
  },

  /**
   * Send a general chat message to the AI Strategist (RAG)
   */
  async sendChatMessage(topicId: string, message: string, agentId?: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic_id: topicId, message, agent_id: agentId }),
    });
    return handleResponse(res);
  },

  /**
   * Transcribe audio blob to text (STT)
   */
  async transcribeAudio(audioBlob: Blob): Promise<{ text: string }> {
    const form = new FormData();
    form.append("file", audioBlob, "recording.webm");
    const res = await fetch(`${API_BASE}/api/v1/speech/stt`, {
      method: "POST",
      body: form,
    });
    return handleResponse(res);
  },

  async updateBlackboardSection(caseId: string, section: string, data: any): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/cases/${caseId}/blackboard/${section}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  /**
   * Upload an adjuster report to resume the workflow from AWAITING_ADJUSTER.
   */
  async uploadAdjusterReport(
    caseId: string,
    file: File
  ): Promise<{ case_id: string; status: CaseStatus }> {
    const form = new FormData();
    form.append("adjuster_report", file);
    const res = await fetch(`${API_BASE}/api/v1/cases/${caseId}/adjuster-report`, {
      method: "POST",
      body: form,
    });
    return handleResponse(res);
  },

  // -- Agent Prompt Overrides -----------------------------------------------

  async getAgentPrompt(agentId: string): Promise<{
    agent_id: string;
    default_prompt: string;
    custom_prompt: string | null;
    is_customized: boolean;
  }> {
    const res = await fetch(`${API_BASE}/api/v1/agent-prompts/${agentId}`);
    return handleResponse(res);
  },

  async updateAgentPrompt(agentId: string, customPrompt: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/agent-prompts/${agentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ custom_prompt: customPrompt }),
    });
    return handleResponse(res);
  },

  async resetAgentPrompt(agentId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/agent-prompts/${agentId}`, {
      method: "DELETE",
    });
    return handleResponse(res);
  },
};
