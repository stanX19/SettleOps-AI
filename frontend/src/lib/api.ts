import {
  CaseSnapshot,
  CaseStatus,
  OfficerMessageType,
  AgentId
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }
  return response.json();
}

export const api = {
  /**
   * List all cases for the dashboard queue
   */
  async listCases(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/api/v1/cases`);
    return handleResponse(res);
  },

  /**
   * Fetch a full snapshot of a specific case
   */
  async getCaseSnapshot(caseId: string): Promise<CaseSnapshot> {
    const res = await fetch(`${API_BASE}/api/v1/cases/${caseId}`);
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
    type: OfficerMessageType = OfficerMessageType.FREEFORM
  ): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/cases/${caseId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, type }),
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
    files: {
      police_report: File;
      policy_pdf: File;
      repair_quotation: File;
      photos: File[];
      adjuster_report?: File;
    }
  ): Promise<{ case_id: string; status: CaseStatus }> {
    const form = new FormData();
    form.append("police_report", files.police_report);
    form.append("policy_pdf", files.policy_pdf);
    form.append("repair_quotation", files.repair_quotation);
    for (const photo of files.photos) {
      form.append("photos", photo);
    }
    if (files.adjuster_report) {
      form.append("adjuster_report", files.adjuster_report);
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
  async createCase(files: {
    police_report: File;
    policy_pdf: File;
    repair_quotation: File;
    photos: File[];
    adjuster_report?: File;
  }): Promise<{ case_id: string }> {
    const draft = await this.initiateDraftCase();
    return this.submitDocuments(draft.case_id, files);
  },
};
