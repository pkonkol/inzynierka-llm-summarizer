import { createPublicSummaryJob, fetchSummaryPresets } from "./api.js";
import { addHistoryEntry } from "./history-store.js";

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
 * Creates the public job for a source and records it as the current history entry.
 * source.apiSource is { url } or { input_text }, as the public endpoint takes it; sourceUrl and
 * sourceLabel name the page in the history until the summary brings its own title.
 */
export async function startSummaryJob(source, settings, presets) {
  const jobId = await createPublicSummaryJob({
    ...source.apiSource,
    language: settings.language,
    summary_spec: buildSummarySpec(presets[settings.presetKey], settings.density),
  });
  await addHistoryEntry({
    jobId,
    presetKey: settings.presetKey,
    sourceUrl: source.sourceUrl,
    sourceLabel: source.sourceLabel,
    status: "pending",
    title: null,
    summary: null,
    error: null,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Summarizes a link by its address with the settings of the last panel submit. A failure to
 * create the job becomes a failed history entry, since the context menu has nowhere else to show it.
 */
export async function startLinkSummaryJob(linkUrl) {
  const settings = { ...(await readSavedSettings()), source: "url" };
  const source = { apiSource: { url: linkUrl }, sourceUrl: linkUrl, sourceLabel: linkUrl };
  try {
    const presets = await fetchSummaryPresets();
    // No saved settings yet, or a preset removed from the API since: the first one, as in the form.
    if (!Object.hasOwn(presets, settings.presetKey)) settings.presetKey = Object.keys(presets)[0];
    await startSummaryJob(source, settings, presets);
  } catch (error) {
    await addHistoryEntry({
      jobId: `failed-${crypto.randomUUID()}`,
      presetKey: settings.presetKey,
      sourceUrl: linkUrl,
      sourceLabel: linkUrl,
      status: "failed",
      title: null,
      summary: null,
      error: `Nie udało się podsumować: ${error.message}`,
      createdAt: new Date().toISOString(),
    });
  }
}
