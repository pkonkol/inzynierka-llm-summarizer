import { fetchSummaryPresets, fetchSupportedLanguages } from "./api.js";
import { readArticleText } from "./page-text.js";
import { readSavedSettings, saveSettings } from "./summary-request.js";

// Mirrors public_max_input_chars in backend/app/core/config.py.
const MAX_PUBLIC_INPUT_CHARS = 30_000;

const form = document.getElementById("summary-form");
const presetSelect = document.getElementById("preset");
const densityInput = document.getElementById("density");
const densityLabel = document.getElementById("density-label");
const languageSelect = document.getElementById("language");
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

async function loadOptions() {
  const [presets, languages] = await Promise.all([
    fetchSummaryPresets(),
    fetchSupportedLanguages(),
  ]);
  presetSelect.replaceChildren(
    ...Object.entries(presets).map(([key, preset]) => new Option(preset.label, key)),
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
  if (Object.hasOwn(presets, settings.presetKey)) presetSelect.value = settings.presetKey;
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

/** Current form values as { source, presetKey, density, language }. */
export function readSettings() {
  return {
    source: form.elements.source.value,
    presetKey: presetSelect.value,
    density: Number(densityInput.value),
    language: languageSelect.value,
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
  const characterCount = [...articleText].length; // Code points, as the backend counts them; emoji are two UTF-16 units.
  if (characterCount > MAX_PUBLIC_INPUT_CHARS) {
    throw new Error(
      `artykuł ma ${characterCount.toLocaleString("pl-PL")} znaków, limit to ${MAX_PUBLIC_INPUT_CHARS.toLocaleString("pl-PL")}`,
    );
  }
  return { input_text: articleText };
}

/** Loads presets and languages, restores the last settings, and calls onSubmit(settings, presets) on submit. */
export async function initSummaryForm({ onSubmit }) {
  let presets = {};

  densityInput.addEventListener("input", showDensity);
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
    submitButton.textContent = "Podsumuj";
  });

  try {
    presets = await loadOptions();
    await restoreSettings(presets);
    submitButton.disabled = false;
  } catch (error) {
    showFormError(`Nie udało się wczytać opcji: ${error.message}`);
  }
}
