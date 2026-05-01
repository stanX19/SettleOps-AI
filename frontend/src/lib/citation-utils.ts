import { Citation, DocumentInfo } from "./types";

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
