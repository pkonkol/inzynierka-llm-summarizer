import type { FormEvent } from "react";
import { useState } from "react";

import { getSummaryPresets, getSupportedLanguages } from "../api/client";
import { PresetCards } from "../components/public/PresetCards";
import { PublicSummaryResult } from "../components/public/PublicSummaryResult";
import { buildSourcePayload, SourceField } from "../components/SourceField";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { FieldLabel, RangeInput, Select } from "../components/ui/Field";
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

const LINE = "bg-ink h-6 w-px lg:h-px lg:w-8";

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

    // The preset supplies the character of the summary; the slider always decides its length.
    const summarySpec: SummarySpec = {
      ...presets.data[presetKey].spec,
      length: { policy: "scaled_to_input", slider: density },
    };
    void submit({ ...source, language, summary_spec: summarySpec });
  };

  return (
    <div className="mx-auto grid w-full max-w-app gap-8 px-3 py-4">
      <header className="flex items-center justify-between gap-4">
        <span className="font-semibold">Podsumowania</span>
        <LinkButton href={LOGIN_PATH} size="sm">
          Zaloguj
        </LinkButton>
      </header>

      <main className="grid gap-8">
        <div className="grid gap-2 text-center">
          <h1 className="hero-title text-balance">Podsumuj dowolny artykuł</h1>
          <p className="text-muted">Wklej adres albo treść. Bez konta, bez instalacji.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
        >
          <Panel padding="xl" className="grid gap-6">
            <SourceField
              content={content}
              onContentChange={setContent}
              maxLength={MAX_PUBLIC_PASTED_CHARS}
              disabled={isWorking}
            />

            {presetKey === null ? (
              <p className="text-muted">Ładowanie...</p>
            ) : (
              <PresetCards
                options={presetEntries.map(([key, preset]) => ({
                  key,
                  label: preset.label,
                  description: preset.description,
                }))}
                selectedKey={presetKey}
                onSelect={setSelectedPresetKey}
                disabled={isWorking}
              />
            )}

            <div className="grid gap-2">
              <FieldLabel htmlFor="density">Długość: {densityLabel(density)}</FieldLabel>
              <RangeInput
                id="density"
                min={0}
                max={1}
                step={0.05}
                value={density}
                onChange={(event) => setDensity(Number(event.target.value))}
                aria-valuetext={densityLabel(density)}
                disabled={isWorking}
              />
            </div>

            <div className="flex items-center justify-end gap-2 text-sm text-muted">
              <label htmlFor="language">Język podsumowania</label>
              <Select
                id="language"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                disabled={isWorking || languages.data === null}
                className="h-auto w-auto py-1 text-sm"
              >
                {(languages.data ?? [DEFAULT_LANGUAGE]).map((code) => (
                  <option key={code} value={code}>
                    {code === DEFAULT_LANGUAGE ? "auto" : code.toUpperCase()}
                  </option>
                ))}
              </Select>
            </div>
          </Panel>

          <div className="flex flex-col items-center gap-0 lg:flex-row">
            <span aria-hidden="true" className={LINE} />
            <Button type="submit" variant="primary" size="lg" disabled={isWorking || !isReady}>
              {isWorking ? "Przetwarzanie..." : "Podsumuj"}
            </Button>
            <span aria-hidden="true" className="flex flex-col items-center lg:flex-row">
              <span className={LINE} />
              <span className="rotate-90 leading-none lg:rotate-0">▶</span>
            </span>
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
