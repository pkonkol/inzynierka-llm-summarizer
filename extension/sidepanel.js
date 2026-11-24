import { fetchJobStatus, requestFactCheck } from "./api.js";
import {
  onHistoryChanged,
  readCurrentJobId,
  readHistory,
  setCurrentJobId,
  updateHistoryEntry,
} from "./history-store.js";
import { renderCurrentEntry, renderHistoryList, resultPageUrl } from "./result-view.js";
import { initSummaryForm, readSourceField } from "./summary-form.js";
import { startSummaryJob } from "./summary-request.js";

const POLL_INTERVAL_MS = 2000;
const MAX_CONSECUTIVE_POLL_FAILURES = 10;
const GENERATION_FAILED_MESSAGE = "Nie udało się wygenerować podsumowania. Spróbuj ponownie.";

const resultContainer = document.getElementById("result");
const historyContainer = document.getElementById("history");
const historyToggle = document.getElementById("history-toggle");
const openOnPageLink = document.getElementById("open-on-page");
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

function toFactCheckEntry(factCheck) {
  if (factCheck === null) return null;
  switch (factCheck.status) {
    case "pending":
    case "running":
      return { status: "working" };
    case "failed":
      return { status: "failed", error: factCheck.error };
    case "completed":
      return {
        status: "completed",
        text: factCheck.text,
        sources: factCheck.sources.map(({ url, title, channel, stance, review }) => ({
          url,
          title,
          channel,
          stance,
          review,
        })),
      };
    default:
      throw new Error(`unknown fact check status "${factCheck.status}"`);
  }
}

function waitForNextPoll() {
  return new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
}

// A dropped connection or a cold-start 503 must not fail a job the server is still finishing.
async function fetchJobStatusWithRetries(jobId) {
  for (let failureCount = 1; ; failureCount += 1) {
    try {
      return await fetchJobStatus(jobId);
    } catch (error) {
      if (failureCount === MAX_CONSECUTIVE_POLL_FAILURES) throw error;
      await waitForNextPoll();
    }
  }
}

/** Stores the completed summary; returns whether its fact check still runs and polling must go on. */
async function storeCompletedJob(jobId, job, lastStatus) {
  const { title, summary } = job.summary_data;
  const factCheck = toFactCheckEntry(job.fact_check);
  const isFactCheckWorking = factCheck?.status === "working";
  if (lastStatus !== "completed" || !isFactCheckWorking) {
    await updateHistoryEntry(jobId, { status: "completed", title, summary, factCheck });
  }
  return isFactCheckWorking;
}

// A summary already shown stays shown, and its fact check stays in progress: the server still
// finishes it, and the panel asks again the next time it opens.
async function storePollFailure(jobId, lastStatus, error) {
  if (lastStatus === "completed") return;
  await updateHistoryEntry(jobId, {
    status: "failed",
    error: `Nie udało się pobrać podsumowania: ${error.message}`,
    factCheck: null,
  });
}

async function pollUntilDone(entry) {
  const { jobId } = entry;
  if (jobsBeingPolled.has(jobId)) return;
  jobsBeingPolled.add(jobId);
  let lastStatus = entry.status;
  try {
    for (;;) {
      const job = await fetchJobStatusWithRetries(jobId);
      if (job.status === "completed") {
        const isFactCheckWorking = await storeCompletedJob(jobId, job, lastStatus);
        if (!isFactCheckWorking) return;
      } else if (job.status === "failed") {
        await updateHistoryEntry(jobId, {
          status: "failed",
          error: describeJobFailure(job),
          factCheck: null,
        });
        return;
      } else if (job.status !== lastStatus) {
        await updateHistoryEntry(jobId, { status: job.status });
      }
      lastStatus = job.status;
      await waitForNextPoll();
    }
  } catch (error) {
    await storePollFailure(jobId, lastStatus, error);
  } finally {
    jobsBeingPolled.delete(jobId);
  }
}

function isUnfinished(entry) {
  const isFactCheckWorking = entry.factCheck?.status === "working"; // entries saved before the fact check have no field
  return entry.status === "pending" || entry.status === "running" || isFactCheckWorking;
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
  renderCurrentEntry(resultContainer, currentEntry, { onCheckFacts: checkFacts });
  showOpenOnPage(currentEntry);
  renderHistoryList(historyContainer, history, { currentJobId, onSelect: selectEntry });
  for (const entry of history.filter(isUnfinished)) pollUntilDone(entry);
}

// Marked working only once the server has the fact check: the history change starts polling, and
// a poll before that would read no fact check and clear the entry.
async function checkFacts(entry) {
  try {
    await requestFactCheck(entry.jobId);
  } catch (error) {
    await updateHistoryEntry(entry.jobId, {
      factCheck: { status: "failed", error: `Nie udało się sprawdzić faktów: ${error.message}` },
    });
    return;
  }
  await updateHistoryEntry(entry.jobId, { factCheck: { status: "working" } });
}

async function summarizeFromPanel(settings, presets, { checkFacts }) {
  const source = readSourceField(await activeTab());
  await startSummaryJob(source, settings, presets, { checkFacts });
}

// Ctrl+A (Cmd+A) inside the result selects the result alone, ready to copy.
function selectResultOnly(event) {
  const isSelectAll = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a";
  if (!isSelectAll) return;
  event.preventDefault();
  const resultRange = document.createRange();
  resultRange.selectNodeContents(resultContainer);
  document.getSelection().removeAllRanges();
  document.getSelection().addRange(resultRange);
}

// A failed entry has no summary to show on the page.
function showOpenOnPage(entry) {
  const hasResultPage = entry !== null && entry.status !== "failed";
  openOnPageLink.hidden = !hasResultPage;
  if (hasResultPage) openOnPageLink.href = resultPageUrl(entry);
}

resultContainer.addEventListener("keydown", selectResultOnly);
historyToggle.addEventListener("click", () => {
  isHistoryOpen = !isHistoryOpen;
  showView();
});
onHistoryChanged(showHistory);
showHistory();
initSummaryForm({ onSubmit: summarizeFromPanel });
