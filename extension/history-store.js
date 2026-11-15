/**
 * @typedef {{
 *   jobId: string,
 *   presetKey: string,
 *   sourceUrl: string,
 *   sourceLabel: string,
 *   status: "pending" | "running" | "completed" | "failed",
 *   title: string | null,
 *   summary: string | null,
 *   error: string | null,
 *   createdAt: string,
 * }} HistoryEntry
 */

export const HISTORY_LIMIT = 20;

/** Adds an entry at the top, drops the oldest past HISTORY_LIMIT, and makes it current. */
export async function addHistoryEntry(_entry) {
  throw new Error("not implemented");
}

/** Merges fields (status, title, summary, error) into the entry with this jobId. */
export async function updateHistoryEntry(_jobId, _fields) {
  throw new Error("not implemented");
}

/** History entries, newest first. */
export async function readHistory() {
  throw new Error("not implemented");
}

export async function setCurrentJobId(_jobId) {
  throw new Error("not implemented");
}

export async function readCurrentJobId() {
  throw new Error("not implemented");
}

/** Calls listener with { history, currentJobId } whenever either changes in storage. */
export function onHistoryChanged(_listener) {
  throw new Error("not implemented");
}
