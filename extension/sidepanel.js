import { ACTIVE_ENVIRONMENT } from "./config.js";
import { initSummaryForm, readSource } from "./summary-form.js";
import { startSummaryJob } from "./summary-request.js";

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function openResultTab(jobId, presetKey) {
  const resultUrl = new URL("/", ACTIVE_ENVIRONMENT.appUrl);
  resultUrl.searchParams.set("job", jobId);
  resultUrl.searchParams.set("preset", presetKey);
  await chrome.tabs.create({ url: resultUrl.href });
}

async function summarizeActiveTab(settings, presets) {
  const tab = await activeTab();
  const apiSource = await readSource(tab, settings.source);
  const jobId = await startSummaryJob({ apiSource }, settings, presets);
  await openResultTab(jobId, settings.presetKey);
}

initSummaryForm({ onSubmit: summarizeActiveTab });
