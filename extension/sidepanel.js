import { fetchJobStatus } from "./api.js";
import {
  onHistoryChanged,
  readCurrentJobId,
  readHistory,
  setCurrentJobId,
  updateHistoryEntry,
} from "./history-store.js";
import { renderCurrentEntry, renderHistoryList } from "./result-view.js";
import { initSummaryForm, readSource } from "./summary-form.js";
import { startSummaryJob } from "./summary-request.js";

const POLL_INTERVAL_MS = 2000;
const GENERATION_FAILED_MESSAGE = "Nie udało się wygenerować podsumowania. Spróbuj ponownie.";

const resultContainer = document.getElementById("result");
const historyContainer = document.getElementById("history");
const historyToggle = document.getElementById("history-toggle");
const jobsBeingPolled = new Set();

let isHistoryOpen = false;
let shownCurrentJobId = null;

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function describeJobFailure(job) {
  if (job.error_code === "source_too_long") return "Artykuł jest za długi.";
  return GENERATION_FAILED_MESSAGE;
}

function waitForNextPoll() {
  return new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
}

async function pollUntilDone(jobId) {
  if (jobsBeingPolled.has(jobId)) return;
  jobsBeingPolled.add(jobId);
  let lastStatus = null;
  try {
    for (;;) {
      const job = await fetchJobStatus(jobId);
      if (job.status === "completed") {
        const { title, summary } = job.summary_data;
        await updateHistoryEntry(jobId, { status: "completed", title, summary });
        return;
      }
      if (job.status === "failed") {
        await updateHistoryEntry(jobId, { status: "failed", error: describeJobFailure(job) });
        return;
      }
      if (job.status !== lastStatus) await updateHistoryEntry(jobId, { status: job.status });
      lastStatus = job.status;
      await waitForNextPoll();
    }
  } catch (error) {
    await updateHistoryEntry(jobId, {
      status: "failed",
      error: `Nie udało się pobrać podsumowania: ${error.message}`,
    });
  } finally {
    jobsBeingPolled.delete(jobId);
  }
}

function isUnfinished(entry) {
  return entry.status === "pending" || entry.status === "running";
}

function showView() {
  resultContainer.hidden = isHistoryOpen;
  historyContainer.hidden = !isHistoryOpen;
  historyToggle.setAttribute("aria-expanded", String(isHistoryOpen));
}

async function selectEntry(jobId) {
  await setCurrentJobId(jobId);
  isHistoryOpen = false;
  showView();
}

async function showHistory() {
  const [history, currentJobId] = await Promise.all([readHistory(), readCurrentJobId()]);

  // a new summary, or one picked from the history, always brings the current view forward
  if (currentJobId !== shownCurrentJobId) {
    shownCurrentJobId = currentJobId;
    isHistoryOpen = false;
    showView();
  }

  const currentEntry = history.find((entry) => entry.jobId === currentJobId) ?? null;
  renderCurrentEntry(resultContainer, currentEntry);
  renderHistoryList(historyContainer, history, { currentJobId, onSelect: selectEntry });
  for (const entry of history.filter(isUnfinished)) pollUntilDone(entry.jobId);
}

async function summarizeActiveTab(settings, presets) {
  const tab = await activeTab();
  const apiSource = await readSource(tab, settings.source);
  await startSummaryJob(
    { apiSource, sourceUrl: tab.url, sourceLabel: tab.title || tab.url },
    settings,
    presets,
  );
}

historyToggle.addEventListener("click", () => {
  isHistoryOpen = !isHistoryOpen;
  showView();
});
onHistoryChanged(showHistory);
showHistory();
initSummaryForm({ onSubmit: summarizeActiveTab });
