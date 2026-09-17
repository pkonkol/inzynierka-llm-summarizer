import { useState } from "react";
import type { SummaryPresetOut, SummarySpec } from "../types/api.generated";

export const CUSTOM_PRESET_KEY = "custom";
const DEFAULT_PRESET_KEY = "standard";

export type LengthSpec = NonNullable<SummarySpec["length"]>;

export const DEFAULT_SCALED_LENGTH: LengthSpec = { policy: "scaled_to_input", slider: 0.5 };
export const DEFAULT_EXPLICIT_LENGTH: LengthSpec = {
  policy: "explicit",
  target_words: 100,
  target_sentences: null,
};

interface SummarySpecFormOptions {
  // Evaluation runs start matched to each entry's golden summary; the home page has no reference.
  offerMatchReference: boolean;
}

// A named preset fills every spec field and locks them; "custom" unlocks them, starting from
// whatever the preset held. Shared by the home page and the evaluation set's new-run panel.
export function useSummarySpecForm(
  presets: Record<string, SummaryPresetOut>,
  { offerMatchReference }: SummarySpecFormOptions,
) {
  const [presetKey, setPresetKey] = useState(DEFAULT_PRESET_KEY);
  const [customSpec, setCustomSpec] = useState<SummarySpec | null>(null);
  const [matchReference, setMatchReference] = useState(offerMatchReference);

  const isCustom = presetKey === CUSTOM_PRESET_KEY;
  const spec: SummarySpec | undefined = isCustom
    ? (customSpec ?? undefined)
    : presets[presetKey]?.spec;

  const selectPreset = (key: string) => {
    if (key === CUSTOM_PRESET_KEY && spec) setCustomSpec(spec);
    setPresetKey(key);
  };

  const updateSpec = (patch: Partial<SummarySpec>) => {
    if (!isCustom || !customSpec) throw new Error("spec fields are editable only in custom mode");
    setCustomSpec({ ...customSpec, ...patch });
  };

  // Null when the form can be submitted; otherwise the reason, in the form's own language.
  const validationError = (): string | null => {
    if (!spec) return "Ustawienia podsumowania jeszcze się ładują";
    const length = spec.length;
    if (!matchReference && length?.policy === "explicit" && !length.target_words) {
      return "Podaj docelową liczbę słów";
    }
    return null;
  };

  const buildSpec = (): SummarySpec => {
    if (!spec) throw new Error(`summary preset "${presetKey}" is not loaded`);
    if (offerMatchReference && matchReference) {
      return { ...spec, length: { policy: "match_reference", tolerance_pct: 15 } };
    }
    return spec;
  };

  return {
    presetKey,
    selectPreset,
    spec,
    isLocked: !isCustom,
    updateSpec,
    offerMatchReference,
    matchReference,
    setMatchReference,
    validationError,
    buildSpec,
  };
}

export type SummarySpecForm = ReturnType<typeof useSummarySpecForm>;
