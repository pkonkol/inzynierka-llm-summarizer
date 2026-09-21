import type { JobStatusValue } from "../types/local";

// Mirrors JobCreateRequest._MAX_PASTED_CHARS in backend/app/schemas/job_api.py.
export const MAX_PASTED_CHARS = 500_000;

// Mirrors _MAX_PUBLIC_CHARS in backend/app/routers/public_summarize.py.
export const MAX_PUBLIC_PASTED_CHARS = 30_000;

// Jobs whose source is pasted text carry this prefix on source_url instead of a real address.
const MANUAL_SOURCE_PREFIX = "manual:";

export function isManualSource(sourceUrl: string): boolean {
  return sourceUrl.startsWith(MANUAL_SOURCE_PREFIX);
}

export function manualSourceTitle(sourceUrl: string): string {
  return sourceUrl.slice(MANUAL_SOURCE_PREFIX.length);
}

export function splitProviderModel(value: string): { provider: string; modelName: string } {
  const [provider, ...rest] = value.split(":");
  return {
    provider,
    modelName: rest.join(":"),
  };
}

// A job is in progress from the moment it is queued until it reaches a terminal state. Every
// caller needs both halves, and treating `running` as finished is what silently stops polling.
export function isJobInProgress(status: JobStatusValue): boolean {
  return status === "pending" || status === "running";
}
