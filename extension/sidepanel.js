import { fetchJobStatus } from "./api.js";
import {
  onHistoryChanged,
  readCurrentJobId,
  readHistory,
  updateHistoryEntry,
} from "./history-store.js";
import { renderCurrentEntry } from "./result-view.js";
import { initSummaryForm, readSource } from "./summary-form.js";
import { startSummaryJob } from "./summary-request.js";

const POLL_INTERVAL_MS = 2000;
const GENERATION_FAILED_MESSAGE = "Nie udało się wygenerować podsumowania. Spróbuj ponownie.";

const resultContainer = document.getElementById("result");
const jobsBeingPolled = new Set();

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
      await updateHistoryEntry(jobId, { status: job.status });
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

async function showHistory() {
  const [history, currentJobId] = await Promise.all([readHistory(), readCurrentJobId()]);
  const currentEntry = history.find((entry) => entry.jobId === currentJobId) ?? null;
  renderCurrentEntry(resultContainer, currentEntry);
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

onHistoryChanged(showHistory);
showHistory();
initSummaryForm({ onSubmit: summarizeActiveTab });
