export type DocKey =
  | "police_report"
  | "policy_pdf"
  | "repair_quotation"
  | "photos"
  | "adjuster_report";

export interface DocSlot {
  key: DocKey;
  label: string;
  accept: string;
  multiple: boolean;
  required: boolean;
  hint: string;
}

export const DOC_SLOTS: DocSlot[] = [
  {
    key: "police_report",
    label: "Police Report",
    accept: "application/pdf",
    multiple: false,
    required: true,
    hint: "Official police report PDF",
  },
  {
    key: "policy_pdf",
    label: "Insurance Policy",
    accept: "application/pdf",
    multiple: false,
    required: true,
    hint: "Policy schedule PDF",
  },
  {
    key: "repair_quotation",
    label: "Repair Quotation",
    accept: "application/pdf",
    multiple: false,
    required: true,
    hint: "Workshop repair quotation PDF",
  },
  {
    key: "photos",
    label: "Damage Photos",
    accept: "image/jpeg,image/png",
    multiple: true,
    required: true,
    hint: "At least one photo of the damage",
  },
  {
    key: "adjuster_report",
    label: "Adjuster Report",
    accept: "application/pdf",
    multiple: false,
    required: false,
    hint: "Loss adjuster report (optional)",
  },
];

export interface UploadedDocs {
  police_report?: File;
  policy_pdf?: File;
  repair_quotation?: File;
  photos: File[];
  adjuster_report?: File;
}

export interface ChatAttachment {
  key: DocKey;
  files: File[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "bot";
  text: string;
  attachments?: ChatAttachment[];
  missingDocs?: DocKey[];
}

export function getMissingRequired(docs: UploadedDocs): DocKey[] {
  const missing: DocKey[] = [];
  if (!docs.police_report) missing.push("police_report");
  if (!docs.policy_pdf) missing.push("policy_pdf");
  if (!docs.repair_quotation) missing.push("repair_quotation");
  if (docs.photos.length === 0) missing.push("photos");
  return missing;
}

export function isReadyToSubmit(docs: UploadedDocs): boolean {
  return getMissingRequired(docs).length === 0;
}

export function getSlot(key: DocKey): DocSlot {
  return DOC_SLOTS.find((s) => s.key === key)!;
}
