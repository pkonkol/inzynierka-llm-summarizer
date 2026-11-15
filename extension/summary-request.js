import { createPublicSummaryJob } from "./api.js";

const SETTINGS_KEY = "lastSettings";

export const DEFAULT_SETTINGS = { source: "url", presetKey: null, density: 0.5, language: "auto" };

/** The settings of the last submit, or the defaults when nothing was submitted yet. */
export async function readSavedSettings() {
  const { [SETTINGS_KEY]: savedSettings } = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...savedSettings };
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

// The preset supplies the character of the summary and its length shape; the slider only moves
// the position along that length, as on the public page.
/** Preset spec with the slider position applied; throws for a preset that does not scale. */
export function buildSummarySpec(preset, density) {
  const presetLength = preset.spec.length;
  if (presetLength?.policy !== "scaled_to_input") {
    throw new Error(`summary kind "${preset.label}" does not scale with the slider`);
  }
  return { ...preset.spec, length: { ...presetLength, slider: density } };
}

/**
 * Creates the public job for a source; resolves to its job id.
 * source.apiSource is { url } or { input_text }, as the public endpoint takes it.
 */
export async function startSummaryJob(source, settings, presets) {
  return createPublicSummaryJob({
    ...source.apiSource,
    language: settings.language,
    summary_spec: buildSummarySpec(presets[settings.presetKey], settings.density),
  });
}
