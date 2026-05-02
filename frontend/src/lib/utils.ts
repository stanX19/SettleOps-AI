import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { CaseSnapshot, ArtifactInfo } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Returns an absolute URL for a backend path.
 * If the path is already absolute (starts with http), it's returned as is.
 */
export function getBackendUrl(path: string | undefined): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  
  const apiBase = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${apiBase}${normalizedPath}`;
}

/**
 * Normalizes an artifact's URL to be absolute.
 */
export function normalizeArtifact(art: ArtifactInfo): ArtifactInfo {
  return {
    ...art,
    url: getBackendUrl(art.url)
  };
}

/**
 * Ensures all document and artifact URLs in a snapshot are absolute.
 * This handles the mapping between backend relative paths and frontend absolute URLs.
 */
export function normalizeCaseSnapshot(snapshot: CaseSnapshot): CaseSnapshot {
  return {
    ...snapshot,
    documents: (snapshot.documents || []).map(doc => ({
      ...doc,
      url: getBackendUrl(doc.url)
    })),
    artifacts: (snapshot.artifacts || []).map(normalizeArtifact)
  };
}
