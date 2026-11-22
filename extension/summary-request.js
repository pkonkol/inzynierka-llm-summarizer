import { createPublicSummaryJob, fetchSummaryPresets } from "./api.js";
import { addHistoryEntry } from "./history-store.js";

const SETTINGS_KEY = "lastSettings";
// Mirrors public_max_input_chars in backend/app/core/config.py.
const MAX_PUBLIC_INPUT_CHARS = 30_000;

export const DEFAULT_SETTINGS = {
  source: "url",
  presetKey: null,
  density: 0.5,
  language: "auto",
  checkFacts: false,
};

/** The settings of the last submit, or the defaults when nothing was submitted yet. */
export async function readSavedSettings() {
  const { [SETTINGS_KEY]: savedSettings } = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...savedSettings };
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

/** Throws when the text is longer than the public endpoint accepts; subject names it in the message ("artykuł"). */
export function assertWithinInputLimit(text, subject) {
  const characterCount = [...text].length; // Code points, as the backend counts them; emoji are two UTF-16 units.
  if (characterCount > MAX_PUBLIC_INPUT_CHARS) {
    throw new Error(
      `${subject} ma ${characterCount.toLocaleString("pl-PL")} znaków, limit to ${MAX_PUBLIC_INPUT_CHARS.toLocaleString("pl-PL")}`,
    );
  }
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
    check_facts: settings.checkFacts,
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
    factCheck: settings.checkFacts ? { status: "working" } : null,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Starts a job from the context menu with the settings of the last panel submit. A failure to
 * create the job becomes a failed history entry, since the context menu has nowhere else to show it.
 */
async function startMenuSummaryJob(source) {
  const settings = await readSavedSettings();
  try {
    if (source.apiSource.input_text !== undefined) {
      assertWithinInputLimit(source.apiSource.input_text, "zaznaczenie");
    }
    const presets = await fetchSummaryPresets();
    // No saved settings yet, or a preset removed from the API since: the first one, as in the form.
    if (!Object.hasOwn(presets, settings.presetKey)) settings.presetKey = Object.keys(presets)[0];
    await startSummaryJob(source, settings, presets);
  } catch (error) {
    await addHistoryEntry({
      jobId: `failed-${crypto.randomUUID()}`,
      presetKey: settings.presetKey,
      sourceUrl: source.sourceUrl,
      sourceLabel: source.sourceLabel,
      status: "failed",
      title: null,
      summary: null,
      error: `Nie udało się podsumować: ${error.message}`,
      factCheck: null,
      createdAt: new Date().toISOString(),
    });
  }
}

/** Summarizes a link by its address. */
export async function startLinkSummaryJob(linkUrl) {
  await startMenuSummaryJob({
    apiSource: { url: linkUrl },
    sourceUrl: linkUrl,
    sourceLabel: linkUrl,
  });
}

/** Summarizes the text selected on a page; the history names the page it came from. */
export async function startSelectionSummaryJob(selectionText, pageUrl, pageTitle) {
  await startMenuSummaryJob({
    apiSource: { input_text: selectionText },
    sourceUrl: pageUrl,
    sourceLabel: `Zaznaczenie: ${pageTitle || pageUrl}`,
  });
}
