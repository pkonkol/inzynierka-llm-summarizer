import type { FormEvent } from "react";
import { useState } from "react";

import { getSummaryPresets, getSupportedLanguages } from "../api/client";
import { Composer } from "../components/public/Composer";
import { PresetTabs } from "../components/public/PresetTabs";
import { PublicSummaryResult } from "../components/public/PublicSummaryResult";
import { buildSourcePayload, SourceField } from "../components/SourceField";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { RangeInput } from "../components/ui/Field";
import { LinkButton } from "../components/ui/LinkButton";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useFetchOnMount } from "../hooks/useFetchOnMount";
import { usePublicSummary } from "../hooks/usePublicSummary";
import type { SummarySpec } from "../types/api.generated";
import { MAX_PUBLIC_PASTED_CHARS } from "../utils/jobs";
import { LOGIN_PATH } from "../utils/routing";

const DEFAULT_LANGUAGE = "auto";
const DEFAULT_DENSITY = 0.5;

function densityLabel(density: number): string {
  if (density < 1 / 3) return "krótko";
  if (density < 2 / 3) return "średnio";
  return "długo";
}

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
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="shrink-0 border-b border-hairline">
        <div className="mx-auto flex h-nav max-w-frame items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <span className="font-bold">Podsumowania</span>
          <LinkButton href={LOGIN_PATH}>Zaloguj</LinkButton>
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-frame flex-1 flex-col gap-4 px-4 pt-6 pb-4 sm:gap-6 sm:px-6 sm:pt-10 sm:pb-6 lg:px-8">
        <div className="grid shrink-0 gap-1">
          <h1 className="text-display text-balance">Podsumuj dowolny artykuł</h1>
          <p className="text-mute">Wklej adres albo treść. Bez konta, bez instalacji.</p>
        </div>

        {/* The page is exactly one screen tall. Stacked, the composer takes its content height and the result the rest. */}
        <form
          onSubmit={handleSubmit}
          className="grid min-h-0 flex-1 grid-rows-[minmax(0,auto)_minmax(8rem,1fr)] gap-4 sm:gap-6 lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)]"
        >
          <Composer
            source={
              <SourceField
                content={content}
                onContentChange={setContent}
                maxLength={MAX_PUBLIC_PASTED_CHARS}
                disabled={isWorking}
                inComposer
              />
            }
          >
            {presetKey === null ? (
              <p className="text-mute">Ładowanie...</p>
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

            <div className="sticky bottom-0 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-hairline bg-canvas pt-3 pb-4">
              <div className="flex min-w-56 flex-1 items-center gap-3">
                <label htmlFor="density" className="whitespace-nowrap">
                  Długość: <span className="font-medium">{densityLabel(density)}</span>
                </label>
                <RangeInput
                  id="density"
                  min={0}
                  max={1}
                  step={0.05}
                  value={density}
                  onChange={(event) => setDensity(Number(event.target.value))}
                  aria-valuetext={densityLabel(density)}
                  disabled={isWorking}
                  className="min-w-24 flex-1"
                />
              </div>
              <label htmlFor="language" className="flex items-center gap-2 text-caption text-mute">
                Język
                <select
                  id="language"
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  disabled={isWorking || languages.data === null}
                  className="field-compact"
                >
                  {(languages.data ?? [DEFAULT_LANGUAGE]).map((code) => (
                    <option key={code} value={code}>
                      {code === DEFAULT_LANGUAGE ? "auto" : code.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
              <span className="flex flex-1 items-center justify-end gap-3">
                <kbd className="hidden text-caption text-mute sm:inline">ctrl+enter</kbd>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isWorking || !isReady}
                  className="min-w-36"
                >
                  {isWorking ? "Przetwarzanie..." : "Podsumuj"}
                </Button>
              </span>
            </div>
          </Composer>

          <PublicSummaryResult state={state} />
        </form>

        {validationError || loadError ? (
          <Alert tone="danger" className="shrink-0">
            {validationError ?? loadError}
          </Alert>
        ) : null}
      </main>
    </div>
  );
}
