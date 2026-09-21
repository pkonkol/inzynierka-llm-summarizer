import type { FormEvent } from "react";
import { useState } from "react";

import { getSummaryPresets, getSupportedLanguages } from "../api/client";
import { PresetTabs } from "../components/public/PresetTabs";
import { PublicSummaryResult } from "../components/public/PublicSummaryResult";
import { buildSourcePayload, SourceField } from "../components/SourceField";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { FieldLabel, RangeInput } from "../components/ui/Field";
import { LinkButton } from "../components/ui/LinkButton";
import { Panel } from "../components/ui/Panel";
import type { SummarySpec } from "../types/api.generated";
import { LOGIN_PATH } from "../utils/routing";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { useFetchOnMount } from "../utils/useFetchOnMount";
import { usePublicSummary } from "../utils/usePublicSummary";
import { MAX_PUBLIC_PASTED_CHARS } from "../utils/utils";

const DEFAULT_LANGUAGE = "auto";
const DEFAULT_DENSITY = 0.5;

function densityLabel(density: number): string {
  if (density < 1 / 3) return "krótko";
  if (density < 2 / 3) return "średnio";
  return "długo";
}

// One stroke of the arrow; the same element is horizontal beside the panels and vertical below.
const ARROW_STEM = "h-8 w-px bg-ink lg:h-px lg:w-auto lg:flex-1";

export function PublicHomePage() {
  useDocumentTitle("Podsumuj artykuł");
  const presets = useFetchOnMount(getSummaryPresets, "presets", "Nie udało się pobrać rodzajów");
  const languages = useFetchOnMount(
    getSupportedLanguages,
    "languages",
    "Nie udało się pobrać języków",
  );
  const { state, submit } = usePublicSummary();

  const [content, setContent] = useState("");
  const [selectedPresetKey, setSelectedPresetKey] = useState<string | null>(null);
  const [density, setDensity] = useState(DEFAULT_DENSITY);
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const [validationError, setValidationError] = useState<string | null>(null);

  const isWorking = state.phase === "working";
  const presetEntries = Object.entries(presets.data ?? {});
  const presetKey = selectedPresetKey ?? presetEntries[0]?.[0] ?? null;
  const loadError = presets.errorMessage ?? languages.errorMessage;
  const isReady = presetKey !== null && languages.data !== null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (presetKey === null || presets.data === null) return;

    const { payload: source, error } = buildSourcePayload(content);
    setValidationError(error);
    if (source === null) return;

    // The preset supplies the character of the summary and whatever shape its length takes (a
    // sentence cap, a word scale); the slider only moves the position along that length.
    const presetSpec = presets.data[presetKey].spec;
    const presetLength = presetSpec.length;
    if (presetLength?.policy !== "scaled_to_input") {
      throw new Error(`summary kind "${presetKey}" does not scale with the slider`);
    }
    const summarySpec: SummarySpec = {
      ...presetSpec,
      length: { ...presetLength, slider: density },
    };
    void submit({ ...source, language, summary_spec: summarySpec });
  };

  return (
    <div className="mx-auto grid w-full max-w-app gap-4 px-3 py-4">
      <header className="flex items-center justify-between gap-4">
        <span className="font-semibold">Podsumowania</span>
        <LinkButton href={LOGIN_PATH} size="sm">
          Zaloguj
        </LinkButton>
      </header>

      <main className="grid gap-4">
        <div className="grid gap-1 text-center">
          <h1 className="hero-title text-balance">Podsumuj dowolny artykuł</h1>
          <p className="text-muted">Wklej adres albo treść. Bez konta, bez instalacji.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="grid gap-4 lg:h-[calc(100vh-17rem)] lg:min-h-[34rem] lg:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)_minmax(0,1fr)]"
        >
          <Panel className="grid gap-4 lg:h-full lg:grid-rows-[1fr_auto]">
            <SourceField
              content={content}
              onContentChange={setContent}
              maxLength={MAX_PUBLIC_PASTED_CHARS}
              disabled={isWorking}
              fillHeight
            />

            <div className="grid gap-3">
              {presetKey === null ? (
                <p className="text-muted">Ładowanie...</p>
              ) : (
                <PresetTabs
                  options={presetEntries.map(([key, preset]) => ({
                    key,
                    label: preset.label,
                    description: preset.description,
                    example: preset.example,
                  }))}
                  selectedKey={presetKey}
                  onSelect={setSelectedPresetKey}
                  disabled={isWorking}
                />
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <FieldLabel htmlFor="density" className="whitespace-nowrap">
                  Długość: {densityLabel(density)}
                </FieldLabel>
                <RangeInput
                  id="density"
                  min={0}
                  max={1}
                  step={0.05}
                  value={density}
                  onChange={(event) => setDensity(Number(event.target.value))}
                  aria-valuetext={densityLabel(density)}
                  disabled={isWorking}
                  className="min-w-32 flex-1"
                />
                <label htmlFor="language" className="flex items-center gap-2 text-sm text-muted">
                  Język
                  <select
                    id="language"
                    value={language}
                    onChange={(event) => setLanguage(event.target.value)}
                    disabled={isWorking || languages.data === null}
                    className="border border-input-border bg-subtle px-2 py-1 text-ink disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {(languages.data ?? [DEFAULT_LANGUAGE]).map((code) => (
                      <option key={code} value={code}>
                        {code === DEFAULT_LANGUAGE ? "auto" : code.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </Panel>

          <div className="flex flex-col items-center lg:flex-row">
            <span aria-hidden="true" className={ARROW_STEM} />
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={isWorking || !isReady}
              className="min-w-36 shrink-0"
            >
              {isWorking ? "Przetwarzanie..." : "Podsumuj"}
            </Button>
            <span aria-hidden="true" className={ARROW_STEM} />
            <svg
              aria-hidden="true"
              viewBox="0 0 12 16"
              className="h-4 w-3 shrink-0 rotate-90 text-ink lg:rotate-0"
            >
              <path d="M0 0L12 8L0 16Z" fill="currentColor" />
            </svg>
          </div>

          <PublicSummaryResult state={state} />
        </form>

        {validationError || loadError ? (
          <Alert tone="danger">{validationError ?? loadError}</Alert>
        ) : null}
      </main>
    </div>
  );
}
