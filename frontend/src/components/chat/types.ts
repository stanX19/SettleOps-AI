export type DocKey =
  | "car_photo_plate"
  | "damage_closeup"
  | "driver_license"
  | "road_tax_reg"
  | "nric"
  | "policy_covernote"
  | "police_report"
  | "workshop_quote"
  | "unknown";

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
    key: "car_photo_plate",
    label: "Vehicle Photo (Plate)",
    accept: "image/*",
    multiple: true,
    required: true,
    hint: "Photo of the vehicle showing the license plate",
  },
  {
    key: "damage_closeup",
    label: "Damage Close-up",
    accept: "image/*",
    multiple: true,
    required: true,
    hint: "Close-up photos of the damaged areas",
  },
  {
    key: "driver_license",
    label: "Driver's License",
    accept: "image/*,application/pdf",
    multiple: false,
    required: true,
    hint: "Copy of the driver's license",
  },
  {
    key: "road_tax_reg",
    label: "Road Tax / Registration",
    accept: "image/*,application/pdf",
    multiple: false,
    required: true,
    hint: "Road tax or vehicle registration card",
  },
  {
    key: "nric",
    label: "NRIC / ID",
    accept: "image/*,application/pdf",
    multiple: false,
    required: true,
    hint: "NRIC or identity document",
  },
  {
    key: "policy_covernote",
    label: "Policy Covernote",
    accept: "application/pdf",
    multiple: false,
    required: true,
    hint: "Insurance policy covernote",
  },
  {
    key: "police_report",
    label: "Police Report",
    accept: "application/pdf,image/*",
    multiple: false,
    required: true,
    hint: "Official police report",
  },
  {
    key: "workshop_quote",
    label: "Workshop Quotation",
    accept: "application/pdf,image/*",
    multiple: false,
    required: true,
    hint: "Repair estimate or workshop quotation",
  },
];

export interface UploadedDocs {
  files: File[];
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
  missingDocs?: string[]; // Backend returns strings
}

export function getSlot(key: string): DocSlot {
  return DOC_SLOTS.find((s) => s.key === key) || {
    key: "unknown" as DocKey,
    label: "Document",
    accept: "*/*",
    multiple: true,
    required: false,
    hint: "Additional evidence document"
  };
}
