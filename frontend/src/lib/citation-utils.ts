import { AgentId, BlackboardSection, Citation, CitationSummary, DocumentInfo } from "./types";

/**
 * Resolve a citation filename to its served URL by matching the exact stored
 * filename in the documents list. Stored filenames may include prefixes
 * (e.g. ``uploaded_0_police_report.pdf``) — the backend already cites the
 * stored name, so this is a direct lookup.
 */
export function resolveDocUrl(
  filename: string,
  documents: DocumentInfo[],
): string | null {
  const match = documents.find((d) => d.filename === filename);
  return match?.url ?? null;
}

export function resolveDocTextUrl(
  filename: string,
  documents: DocumentInfo[],
): string | null {
  const match = documents.find((d) => d.filename === filename);
  if (!match) return null;
  return match.text_url ?? `${match.url}/text`;
}

/**
 * Group citations by ``node_id`` so the panel can show which sub-task
 * produced each set (e.g. liability_narrative_task vs liability_poi_task).
 * Preserves the original order of first appearance for each node_id.
 */
export function groupCitationsByNode(
  citations: Citation[],
): Array<{ nodeId: string; citations: Citation[] }> {
  const order: string[] = [];
  const buckets = new Map<string, Citation[]>();
  for (const c of citations) {
    const key = c.node_id || "unknown";
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(c);
  }
  return order.map((nodeId) => ({ nodeId, citations: buckets.get(nodeId)! }));
}

const KEY_EVIDENCE_FIELDS = new Set([
  "max_payout_myr",
  "excess_myr",
  "verified_total",
  "final_payout_myr",
  "fault_split",
  "liability_percent",
  "adjuster_verdict",
]);

const NODE_TOPIC_MAP: Record<string, string> = {
  policy_analysis_task: "Policy Terms",
  liability_narrative_task: "Accident & Liability",
  liability_poi_task: "Accident & Liability",
  visual_damage_assessment_task: "Damage / Quotation",
  damage_quote_audit_task: "Damage / Quotation",
  pricing_validation_task: "Pricing Benchmark",
  fraud_assessment_task: "Fraud Assessment",
  wait_for_adjuster: "Adjuster Report",
  adjuster_request: "Adjuster Report",
  auditor_node: "Final Audit",
};

function topicForCitation(citation: Citation): string {
  if (NODE_TOPIC_MAP[citation.node_id]) return NODE_TOPIC_MAP[citation.node_id];
  const field = citation.field_path?.toLowerCase() ?? "";
  if (field.includes("policy") || field.includes("excess") || field.includes("payout_cap")) return "Policy Terms";
  if (field.includes("liability") || field.includes("fault")) return "Accident & Liability";
  if (field.includes("price") || field.includes("benchmark")) return "Pricing Benchmark";
  if (field.includes("adjuster")) return "Adjuster Report";
  if (field.includes("verified") || field.includes("damage") || field.includes("quote")) return "Damage / Quotation";
  return "Final Audit";
}

export function getKeyEvidence(citations: Citation[], limit = 5): Citation[] {
  const selected: Citation[] = [];
  const seen = new Set<string>();
  for (const citation of citations) {
    const field = citation.field_path;
    if (!KEY_EVIDENCE_FIELDS.has(field)) continue;
    if (seen.has(field)) continue;
    seen.add(field);
    selected.push(citation);
    if (selected.length >= limit) break;
  }
  return selected;
}

export function groupCitationsByTopic(
  citations: Citation[],
): Array<{ topic: string; citations: Citation[] }> {
  const order: string[] = [];
  const buckets = new Map<string, Citation[]>();
  for (const citation of citations) {
    const topic = topicForCitation(citation);
    if (!buckets.has(topic)) {
      buckets.set(topic, []);
      order.push(topic);
    }
    buckets.get(topic)!.push(citation);
  }
  return order.map((topic) => ({ topic, citations: buckets.get(topic)! }));
}

/**
 * Human-friendly label for a node_id (turns ``liability_narrative_task``
 * into ``Liability Narrative``).
 */
export function formatNodeLabel(nodeId: string): string {
  return nodeId
    .replace(/_task$/i, "")
    .replace(/_node$/i, "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Maps each agent to the blackboard section it writes — used to pull citations for the modal. */
export const AGENT_SECTION_MAP: Partial<Record<AgentId, BlackboardSection>> = {
  [AgentId.INTAKE]: BlackboardSection.CASE_FACTS,
  [AgentId.POLICY]: BlackboardSection.POLICY_VERDICT,
  [AgentId.LIABILITY]: BlackboardSection.LIABILITY_VERDICT,
  [AgentId.DAMAGE]: BlackboardSection.DAMAGE_RESULT,
  [AgentId.FRAUD]: BlackboardSection.FRAUD_ASSESSMENT,
  [AgentId.PAYOUT]: BlackboardSection.PAYOUT_RECOMMENDATION,
  [AgentId.ADJUSTER]: BlackboardSection.ADJUSTER_REQUEST,
  [AgentId.AUDITOR]: BlackboardSection.AUDIT_RESULT,
};

export function flattenCitationSummary(summary: CitationSummary): Citation[] {
  return [
    ...summary.key_evidence,
    ...summary.supporting_groups.flatMap((g) => g.citations),
    ...summary.audit_cross_check,
  ];
}

/** Flatten all tiers of a CitationSummary and find by deterministic id. */
export function findCitationById(id: string, summary: CitationSummary): Citation | null {
  return flattenCitationSummary(summary).find((c) => c.id === id) ?? null;
}

/** Find by field_path fallback. Prefer the first citation because explicit refs are field-scoped. */
export function findCitationByFieldPath(fieldPath: string, summary: CitationSummary): Citation | null {
  const normalized = fieldPath.trim().toLowerCase();
  if (!normalized) return null;
  return flattenCitationSummary(summary).find(
    (c) => (c.field_path || "").trim().toLowerCase() === normalized,
  ) ?? null;
}

/** Conservative text fallback for legacy string-only logs. */
export function findCitationMentionedInText(text: string, summary: CitationSummary): Citation | null {
  const normalizedText = text.toLowerCase();
  const matches = flattenCitationSummary(summary).filter((c) => {
    const field = (c.field_path || "").trim().toLowerCase();
    if (!field) return false;
    return normalizedText.includes(field) || normalizedText.includes(field.replace(/_/g, " "));
  });
  return matches.length === 1 ? matches[0] : null;
}

/** For subtask logs, fall back to that node's first citation if no field-level link exists. */
export function findFirstCitationByNodeId(nodeId: string, summary: CitationSummary): Citation | null {
  return flattenCitationSummary(summary).find((c) => c.node_id === nodeId) ?? null;
}

/** Type guard — distinguishes a CitationSummary from a legacy flat Citation[]. */
export function isCitationSummary(value: unknown): value is CitationSummary {
  return (
    typeof value === "object" &&
    value !== null &&
    "key_evidence" in value &&
    "supporting_groups" in value &&
    "audit_cross_check" in value
  );
}

/** Total visible citation count for a CitationSummary (excludes hidden duplicates). */
export function getTotalCitationCount(summary: CitationSummary): number {
  const supporting = summary.supporting_groups.reduce(
    (sum, g) => sum + g.citations.length,
    0,
  );
  return summary.key_evidence.length + supporting + summary.audit_cross_check.length;
}

/** Supporting citation count (non-key, non-audit) for badge display. */
export function getSupportingCount(summary: CitationSummary): number {
  return summary.supporting_groups.reduce((sum, g) => sum + g.citations.length, 0);
}
