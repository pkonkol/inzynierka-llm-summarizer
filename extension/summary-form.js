/** Loads presets and languages, restores the last settings, and calls onSubmit with the form's settings. */
export async function initSummaryForm(_handlers) {
  throw new Error("not implemented");
}

/** Current form values as { source, presetKey, density, language }. */
export function readSettings() {
  throw new Error("not implemented");
}

/** { url } in URL mode, or the active tab's Readability text, capped at the public input limit. */
export async function readSource(_tab, _sourceMode) {
  throw new Error("not implemented");
}
