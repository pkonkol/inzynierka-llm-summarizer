import type { JobStatusValue } from "../types/local";

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
