import type { FormEvent } from "react";
import { useId, useState } from "react";
import type { JobCreateRequest } from "../types/api.generated";
import { useSummarizationOptions } from "../utils/useSummarizationOptions";
import { useSummarySpecForm } from "../utils/useSummarySpecForm";
import { splitProviderModel } from "../utils/utils";
import { PastedTextSourceFields } from "./PastedTextSourceFields";
import { type SourceMode, SourceTabs, sourceTabId } from "./SourceTabs";
import { SummarySpecFields } from "./SummarySpecFields";
import { UrlSourceFields } from "./UrlSourceFields";
import { Button } from "./ui/Button";
import { FieldLabel, ModelOptions, Select } from "./ui/Field";

interface SummarySubmitCardProps {
  /** Resolves false when the request failed, so the typed source is kept for a retry. */
  onSubmit: (payload: JobCreateRequest) => Promise<boolean>;
  isSubmitting: boolean;
}

type SourcePayload = Pick<JobCreateRequest, "url" | "input_text" | "source_title">;

function buildSourcePayload(
  sourceMode: SourceMode,
  url: string,
  pastedTitle: string,
  pastedText: string,
): { payload: SourcePayload | null; error: string | null } {
  if (sourceMode === "url") {
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return { payload: null, error: "Adres musi zaczynać się od http:// lub https://" };
      }
    } catch {
      return { payload: null, error: "Wprowadź poprawny adres URL artykułu" };
    }
    return { payload: { url: url.trim() }, error: null };
  }

  if (!pastedTitle.trim()) return { payload: null, error: "Podaj tytuł" };
  if (!pastedText.trim()) return { payload: null, error: "Wklej treść do podsumowania" };
  return {
    payload: { source_title: pastedTitle.trim(), input_text: pastedText },
    error: null,
  };
}

export function SummarySubmitCard({ onSubmit, isSubmitting }: SummarySubmitCardProps) {
  const [sourceMode, setSourceMode] = useState<SourceMode>("url");
  const [url, setUrl] = useState("");
  const [pastedTitle, setPastedTitle] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [runDeepeval, setRunDeepeval] = useState(false);
  const panelId = useId();
  const {
    models,
    processingStrategies,
    languages,
    presets,
    selectedModel,
    setSelectedModel,
    selectedProcessingStrategy,
    setSelectedProcessingStrategy,
    selectedLanguage,
    setSelectedLanguage,
    isLoading: isLoadingMeta,
    errorMessage: optionsError,
  } = useSummarizationOptions();
  const specForm = useSummarySpecForm(presets, { offerMatchReference: false });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const { payload: sourcePayload, error: validationError } = buildSourcePayload(
      sourceMode,
      url,
      pastedTitle,
      pastedText,
    );
    if (!sourcePayload) {
      setError(validationError);
      return;
    }
    const specError = specForm.validationError();
    if (specError) {
      setError(specError);
      return;
    }

    const { provider, modelName } = splitProviderModel(selectedModel);
    const isCreated = await onSubmit({
      ...sourcePayload,
      model_provider: provider,
      model_name: modelName,
      language: selectedLanguage,
      // The select's options come straight from GET /meta/processing-strategies, so the value is
      // always one the backend supports — the hook just doesn't narrow the string literal.
      processing_strategy: selectedProcessingStrategy as JobCreateRequest["processing_strategy"],
      summary_spec: specForm.buildSpec(),
      run_deepeval: runDeepeval,
    });
    if (!isCreated) return;
    setUrl("");
    setPastedTitle("");
    setPastedText("");
  };

  return (
    <section className="grid gap-6">
      <div className="grid gap-3">
        <h1 className="hero-title text-balance">
          Praca Inżynierska - Podsumowanie Artykułów z LLM
        </h1>
      </div>
      <form
        className="grid gap-4 border border-panel-border bg-panel-solid p-6"
        onSubmit={handleSubmit}
      >
        <div className="grid gap-3">
          <p className="max-w-full text-muted">
            Podaj adres artykułu albo wklej gotowy tekst i wybierz model — system wygeneruje
            podsumowanie i policzy metryki jakości.
          </p>
          <SourceTabs activeMode={sourceMode} onChange={setSourceMode} panelId={panelId} />
          <div
            id={panelId}
            role="tabpanel"
            aria-labelledby={sourceTabId(panelId, sourceMode)}
            className="grid gap-3"
          >
            {sourceMode === "url" ? (
              <UrlSourceFields url={url} onUrlChange={setUrl} disabled={isSubmitting} />
            ) : (
              <PastedTextSourceFields
                title={pastedTitle}
                onTitleChange={setPastedTitle}
                text={pastedText}
                onTextChange={setPastedText}
                disabled={isSubmitting}
              />
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-2">
            <FieldLabel htmlFor="model-select">Model</FieldLabel>
            <Select
              id="model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={isSubmitting || isLoadingMeta}
            >
              <ModelOptions models={models} />
            </Select>
          </div>

          <div className="grid gap-2">
            <FieldLabel htmlFor="language-select">Język podsumowania</FieldLabel>
            <Select
              id="language-select"
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              disabled={isSubmitting || isLoadingMeta}
            >
              {languages.map((lang) => (
                <option key={lang} value={lang}>
                  {lang === "auto" ? "Automatyczny (jak źródło)" : lang.toUpperCase()}
                </option>
              ))}
            </Select>
          </div>

          <label className="flex items-center gap-2 self-end text-muted sm:h-control">
            <input
              type="checkbox"
              checked={runDeepeval}
              onChange={(e) => setRunDeepeval(e.target.checked)}
              disabled={isSubmitting || isLoadingMeta}
              className="h-4 w-4 border border-input-border"
            />
            Policz G-Eval
          </label>
        </div>

        <SummarySpecFields
          form={specForm}
          presets={presets}
          processingStrategies={processingStrategies}
          selectedProcessingStrategy={selectedProcessingStrategy}
          onProcessingStrategyChange={setSelectedProcessingStrategy}
          disabled={isSubmitting || isLoadingMeta}
        />

        {error || optionsError ? <p className="text-danger">{error ?? optionsError}</p> : null}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={isSubmitting || isLoadingMeta}
          className="justify-self-start"
        >
          {isSubmitting ? "Przetwarzanie..." : "Start"}
        </Button>
      </form>
    </section>
  );
}
