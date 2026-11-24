import { fetchSummaryPresets, fetchSupportedLanguages } from "./api.js";
import { assertWithinInputLimit, readSavedSettings, saveSettings } from "./summary-request.js";

const CHECK_FACTS_ACTION = "check_facts";
const PASTED_LABEL_CHARS = 60;

const form = document.getElementById("summary-form");
const presetOptions = document.getElementById("preset-options");
const sourceField = document.getElementById("source-field");
const densityInput = document.getElementById("density");
const densityLabel = document.getElementById("density-label");
const languageSelect = document.getElementById("language");
const submitButtons = form.querySelectorAll('button[type="submit"]');
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

function setSubmitDisabled(isDisabled) {
  for (const button of submitButtons) button.disabled = isDisabled;
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
  // A preset or language removed from the API since the last visit keeps the first option selected.
  if (Object.hasOwn(presets, settings.presetKey)) form.elements.preset.value = settings.presetKey;
  if ([...languageSelect.options].some((option) => option.value === settings.language)) {
    languageSelect.value = settings.language;
  }
  densityInput.value = String(settings.density);
  showDensity();
}

function showFormError(message) {
  errorText.textContent = message;
  errorText.hidden = false;
}

/** Current form values as { presetKey, density, language }. */
export function readSettings() {
  return {
    presetKey: form.elements.preset.value,
    density: Number(densityInput.value),
    language: languageSelect.value,
  };
}

function isSummarizable(url) {
  return /^https?:\/\/\S+$/.test(url);
}

function pastedTextLabel(pastedText) {
  const firstLine = pastedText.split("\n", 1)[0];
  return firstLine.length > PASTED_LABEL_CHARS
    ? `${firstLine.slice(0, PASTED_LABEL_CHARS)}…`
    : firstLine;
}

/**
 * The source field as { apiSource, sourceUrl, sourceLabel }: empty means the active tab's address,
 * an http(s) address is summarized by that address, anything else as pasted text.
 */
export function readSourceField(tab) {
  const fieldText = sourceField.value.trim();
  if (fieldText === "") {
    if (tab.url === undefined || !isSummarizable(tab.url)) {
      throw new Error("tej strony nie da się podsumować, otwórz artykuł pod adresem http(s)");
    }
    return {
      apiSource: { url: tab.url },
      sourceUrl: tab.url,
      sourceLabel: tab.title || tab.url,
    };
  }
  if (isSummarizable(fieldText)) {
    return {
      apiSource: { url: fieldText },
      sourceUrl: fieldText,
      sourceLabel: fieldText,
    };
  }
  assertWithinInputLimit(fieldText, "tekst");
  return {
    apiSource: { input_text: fieldText },
    sourceUrl: null,
    sourceLabel: pastedTextLabel(fieldText),
  };
}

/**
 * Loads presets and languages, restores the last settings, and calls
 * onSubmit(settings, presets, { checkFacts }) when either action button submits the form.
 */
export async function initSummaryForm({ onSubmit }) {
  let presets = {};

  densityInput.addEventListener("input", showDensity);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorText.hidden = true;
    setSubmitDisabled(true);
    try {
      const settings = readSettings();
      await saveSettings(settings);
      await onSubmit(settings, presets, {
        checkFacts: event.submitter.value === CHECK_FACTS_ACTION,
      });
    } catch (error) {
      showFormError(`Nie udało się podsumować: ${error.message}`);
    }
    setSubmitDisabled(false);
  });

  try {
    presets = await loadOptions();
    await restoreSettings(presets);
    setSubmitDisabled(false);
  } catch (error) {
    showFormError(`Nie udało się wczytać opcji: ${error.message}`);
  }
}
