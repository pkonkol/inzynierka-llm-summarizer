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

const HISTORY_KEY = "summaryHistory";
const CURRENT_JOB_KEY = "currentJobId";

/** History entries, newest first. */
export async function readHistory() {
  const { [HISTORY_KEY]: history = [] } = await chrome.storage.local.get(HISTORY_KEY);
  return history;
}

/** Adds an entry at the top, drops the oldest past HISTORY_LIMIT, and makes it current. */
export async function addHistoryEntry(entry) {
  const history = await readHistory();
  await chrome.storage.local.set({
    [HISTORY_KEY]: [entry, ...history].slice(0, HISTORY_LIMIT),
    [CURRENT_JOB_KEY]: entry.jobId,
  });
}

/** Merges fields (status, title, summary, error) into the entry with this jobId. */
export async function updateHistoryEntry(jobId, fields) {
  const history = await readHistory();
  const updatedHistory = history.map((entry) =>
    entry.jobId === jobId ? { ...entry, ...fields } : entry,
  );
  await chrome.storage.local.set({ [HISTORY_KEY]: updatedHistory });
}

export async function setCurrentJobId(jobId) {
  await chrome.storage.local.set({ [CURRENT_JOB_KEY]: jobId });
}

export async function readCurrentJobId() {
  const { [CURRENT_JOB_KEY]: currentJobId = null } =
    await chrome.storage.local.get(CURRENT_JOB_KEY);
  return currentJobId;
}

/** Calls listener whenever the history or the current job changes in storage. */
export function onHistoryChanged(listener) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (Object.hasOwn(changes, HISTORY_KEY) || Object.hasOwn(changes, CURRENT_JOB_KEY)) listener();
  });
}
