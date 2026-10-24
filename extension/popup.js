import { createPublicSummaryJob, fetchSummaryPresets, fetchSupportedLanguages } from "./api.js";
import { ACTIVE_ENVIRONMENT } from "./config.js";

const SETTINGS_KEY = "lastSettings";
const DEFAULT_SETTINGS = { source: "url", presetKey: null, density: 0.5, language: "auto" };

const form = document.getElementById("summary-form");
const presetSelect = document.getElementById("preset");
const densityInput = document.getElementById("density");
const densityLabel = document.getElementById("density-label");
const languageSelect = document.getElementById("language");
const submitButton = document.getElementById("submit");
const errorText = document.getElementById("error");

let presets = {};

// Same thresholds as the public page, so the popup and the page name a length the same way.
function describeDensity(density) {
  if (density < 1 / 3) return "krótko";
  if (density < 2 / 3) return "średnio";
  return "długo";
}

function showDensity() {
  densityLabel.textContent = describeDensity(Number(densityInput.value));
}

async function loadOptions() {
  const [loadedPresets, languages] = await Promise.all([
    fetchSummaryPresets(),
    fetchSupportedLanguages(),
  ]);
  presets = loadedPresets;
  presetSelect.replaceChildren(
    ...Object.entries(presets).map(([key, preset]) => new Option(preset.label, key)),
  );
  languageSelect.replaceChildren(
    ...languages.map((code) => new Option(code === "auto" ? "auto" : code.toUpperCase(), code)),
  );
}

async function restoreSettings() {
  const { [SETTINGS_KEY]: savedSettings } = await chrome.storage.local.get(SETTINGS_KEY);
  const settings = { ...DEFAULT_SETTINGS, ...savedSettings };
  form.elements.source.value = settings.source;
  // A preset or language removed from the API since the last visit keeps the first option selected.
  if (settings.presetKey in presets) presetSelect.value = settings.presetKey;
  if ([...languageSelect.options].some((option) => option.value === settings.language)) {
    languageSelect.value = settings.language;
  }
  densityInput.value = String(settings.density);
  showDensity();
}

function readSettings() {
  return {
    source: form.elements.source.value,
    presetKey: presetSelect.value,
    density: Number(densityInput.value),
    language: languageSelect.value,
  };
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

// The preset supplies the character of the summary and its length shape; the slider only moves
// the position along that length, as on the public page.
function buildSummarySpec(preset, density) {
  const presetLength = preset.spec.length;
  if (presetLength?.policy !== "scaled_to_input") {
    throw new Error(`summary kind "${preset.label}" does not scale with the slider`);
  }
  return { ...preset.spec, length: { ...presetLength, slider: density } };
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isSummarizable(tab) {
  return tab.url !== undefined && /^https?:\/\//.test(tab.url);
}

async function openResultTab(jobId, presetKey) {
  const resultUrl = new URL("/", ACTIVE_ENVIRONMENT.appUrl);
  resultUrl.searchParams.set("job", jobId);
  resultUrl.searchParams.set("preset", presetKey);
  await chrome.tabs.create({ url: resultUrl.href });
}

function showError(message) {
  errorText.textContent = message;
  errorText.hidden = false;
}

async function submit(event) {
  event.preventDefault();
  errorText.hidden = true;
  submitButton.disabled = true;
  submitButton.textContent = "Wysyłanie...";

  try {
    const settings = readSettings();
    await saveSettings(settings);
    const tab = await activeTab();
    const jobId = await createPublicSummaryJob({
      url: tab.url,
      language: settings.language,
      summary_spec: buildSummarySpec(presets[settings.presetKey], settings.density),
    });
    await openResultTab(jobId, settings.presetKey);
    window.close();
  } catch (error) {
    showError(`Nie udało się podsumować: ${error.message}`);
    submitButton.disabled = false;
    submitButton.textContent = "Podsumuj";
  }
}

async function start() {
  densityInput.addEventListener("input", showDensity);
  form.addEventListener("submit", submit);

  const tab = await activeTab();
  if (!isSummarizable(tab)) {
    showError("Tej strony nie da się podsumować. Otwórz artykuł pod adresem http(s).");
    return;
  }

  try {
    await loadOptions();
    await restoreSettings();
    submitButton.disabled = false;
  } catch (error) {
    showError(`Nie udało się wczytać opcji: ${error.message}`);
  }
}

start();
