import { fetchSummaryPresets, fetchSupportedLanguages } from "./api.js";
import { readArticleText } from "./page-text.js";
import { assertWithinInputLimit, readSavedSettings, saveSettings } from "./summary-request.js";

const SUBMIT_LABELS = {
  url: "Podsumuj tę stronę",
  pageText: "Podsumuj tę stronę",
  pastedText: "Podsumuj tekst",
};

const form = document.getElementById("summary-form");
const presetOptions = document.getElementById("preset-options");
const pastedTextInput = document.getElementById("pasted-text");
const densityInput = document.getElementById("density");
const densityLabel = document.getElementById("density-label");
const languageSelect = document.getElementById("language");
const checkFactsInput = document.getElementById("check-facts");
const submitButton = document.getElementById("submit");
const errorText = document.getElementById("error");

// Same thresholds as the public page, so the panel and the page name a length the same way.
function describeDensity(density) {
  if (density < 1 / 3) return "krótko";
  if (density < 2 / 3) return "średnio";
  return "długo";
}

function showDensity() {
  densityLabel.textContent = describeDensity(Number(densityInput.value));
}

function showSourceMode() {
  const sourceMode = form.elements.source.value;
  pastedTextInput.hidden = sourceMode !== "pastedText";
  submitButton.textContent = SUBMIT_LABELS[sourceMode];
}

function presetRadio(key, preset, isChecked) {
  const radio = Object.assign(document.createElement("input"), {
    type: "radio",
    name: "preset",
    value: key,
    checked: isChecked,
  });
  const label = document.createElement("label");
  label.title = preset.description;
  label.append(radio, ` ${preset.label}`);
  return label;
}

async function loadOptions() {
  const [presets, languages] = await Promise.all([
    fetchSummaryPresets(),
    fetchSupportedLanguages(),
  ]);
  const presetLegend = presetOptions.querySelector("legend");
  presetOptions.replaceChildren(
    presetLegend,
    ...Object.entries(presets).map(([key, preset], index) => presetRadio(key, preset, index === 0)),
  );
  languageSelect.replaceChildren(
    ...languages.map((code) => new Option(code === "auto" ? "auto" : code.toUpperCase(), code)),
  );
  return presets;
}

async function restoreSettings(presets) {
  const settings = await readSavedSettings();
  form.elements.source.value = settings.source;
  // A preset or language removed from the API since the last visit keeps the first option selected.
  if (Object.hasOwn(presets, settings.presetKey)) form.elements.preset.value = settings.presetKey;
  if ([...languageSelect.options].some((option) => option.value === settings.language)) {
    languageSelect.value = settings.language;
  }
  densityInput.value = String(settings.density);
  checkFactsInput.checked = settings.checkFacts;
  showDensity();
  showSourceMode();
}

function showFormError(message) {
  errorText.textContent = message;
  errorText.hidden = false;
}

/** Current form values as { source, presetKey, density, language, checkFacts }. */
export function readSettings() {
  return {
    source: form.elements.source.value,
    presetKey: form.elements.preset.value,
    density: Number(densityInput.value),
    language: languageSelect.value,
    checkFacts: checkFactsInput.checked,
  };
}

function isSummarizable(tab) {
  return tab.url !== undefined && /^https?:\/\//.test(tab.url);
}

/** { url } in URL mode, or the tab's Readability text, capped at the public input limit. */
export async function readSource(tab, sourceMode) {
  if (!isSummarizable(tab)) {
    throw new Error("tej strony nie da się podsumować, otwórz artykuł pod adresem http(s)");
  }
  if (sourceMode === "url") return { url: tab.url };

  const articleText = await readArticleText(tab.id);
  assertWithinInputLimit(articleText, "artykuł");
  return { input_text: articleText };
}

/** The text pasted into the panel, trimmed; throws when it is empty or over the public input limit. */
export function readPastedText() {
  const pastedText = pastedTextInput.value.trim();
  if (pastedText === "") throw new Error("wklej tekst do pola nad ustawieniami");
  assertWithinInputLimit(pastedText, "tekst");
  return pastedText;
}

/** Loads presets and languages, restores the last settings, and calls onSubmit(settings, presets) on submit. */
export async function initSummaryForm({ onSubmit }) {
  let presets = {};

  densityInput.addEventListener("input", showDensity);
  for (const sourceRadio of form.elements.source) {
    sourceRadio.addEventListener("change", showSourceMode);
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorText.hidden = true;
    submitButton.disabled = true;
    submitButton.textContent = "Wysyłanie...";
    try {
      const settings = readSettings();
      await saveSettings(settings);
      await onSubmit(settings, presets);
    } catch (error) {
      showFormError(`Nie udało się podsumować: ${error.message}`);
    }
    submitButton.disabled = false;
    showSourceMode();
  });

  try {
    presets = await loadOptions();
    await restoreSettings(presets);
    submitButton.disabled = false;
  } catch (error) {
    showFormError(`Nie udało się wczytać opcji: ${error.message}`);
  }
}
