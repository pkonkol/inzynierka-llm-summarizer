export const DEFAULT_SETTINGS = { source: "url", presetKey: null, density: 0.5, language: "auto" };

/** Preset spec with the slider position applied; throws for a preset that does not scale. */
export function buildSummarySpec(_preset, _density) {
  throw new Error("not implemented");
}

/**
 * Creates the public job for a source and records it as the current history entry; resolves to the entry.
 * source is { url } or { input_text, pageUrl, pageTitle }.
 */
export async function startSummaryJob(_source, _settings, _presets) {
  throw new Error("not implemented");
}
