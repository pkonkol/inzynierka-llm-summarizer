import { useState } from "react";
import type { SummarySpec } from "../types/api.generated";

export type LengthSpec = NonNullable<SummarySpec["length"]>;

export const DEFAULT_SCALED_LENGTH: LengthSpec = {
  policy: "scaled_to_input",
  slider: 0.5,
  words_multiplier: 1,
};
export const DEFAULT_EXPLICIT_LENGTH: LengthSpec = {
  policy: "explicit",
  target_words: 100,
  target_sentences: null,
};

// Mirrors the SummarySpec defaults in backend/app/schemas/summary_spec.py.
const DEFAULT_SPEC: SummarySpec = {
  narrative_stance: "voice_of_document",
  summary_function: "informative",
  output_format: "prose",
  length: DEFAULT_SCALED_LENGTH,
  extra_instructions: null,
};

interface SummarySpecFormOptions {
  // Evaluation runs start matched to each entry's golden summary; the home page has no reference.
  offerMatchReference: boolean;
}

// Every spec field is editable from the start. Shared by the admin home page and the evaluation
// set's new-run panel.
export function useSummarySpecForm({ offerMatchReference }: SummarySpecFormOptions) {
  const [spec, setSpec] = useState<SummarySpec>(DEFAULT_SPEC);
  const [matchReference, setMatchReference] = useState(offerMatchReference);

  const updateSpec = (patch: Partial<SummarySpec>) => setSpec({ ...spec, ...patch });

  // Null when the form can be submitted; otherwise the reason, in the form's own language.
  const validationError = (): string | null => {
    const length = spec.length;
    if (!matchReference && length?.policy === "explicit" && !length.target_words) {
      return "Podaj docelową liczbę słów";
    }
    return null;
  };

  const buildSpec = (): SummarySpec => {
    if (offerMatchReference && matchReference) {
      return { ...spec, length: { policy: "match_reference", tolerance_pct: 15 } };
    }
    return spec;
  };

  return {
    spec,
    updateSpec,
    offerMatchReference,
    matchReference,
    setMatchReference,
    validationError,
    buildSpec,
  };
}

export type SummarySpecForm = ReturnType<typeof useSummarySpecForm>;
