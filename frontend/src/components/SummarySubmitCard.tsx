import type { FormEvent } from "react";
import { useState } from "react";
import type { JobCreateRequest } from "../types/api.generated";
import { useSummarizationOptions } from "../utils/useSummarizationOptions";
import { useSummarySpecForm } from "../utils/useSummarySpecForm";
import { splitProviderModel } from "../utils/utils";
import { detectSourceMode, SourceField } from "./SourceField";
import { PresetSelect, ProcessingStrategySelect, SummarySpecFields } from "./SummarySpecFields";
import { Button } from "./ui/Button";
import { FieldLabel, ModelOptions, Select } from "./ui/Field";

interface SummarySubmitCardProps {
  /** Resolves false when the request failed, so the typed source is kept for a retry. */
  onSubmit: (payload: JobCreateRequest) => Promise<boolean>;
  isSubmitting: boolean;
}

type SourcePayload = Pick<JobCreateRequest, "url" | "input_text">;

function buildSourcePayload(content: string): {
  payload: SourcePayload | null;
  error: string | null;
} {
  if (detectSourceMode(content) === "url") {
    try {
      const parsed = new URL(content.trim());
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return { payload: null, error: "Adres musi zaczynać się od http:// lub https://" };
      }
    } catch {
      return { payload: null, error: "Wprowadź poprawny adres URL artykułu" };
    }
    return { payload: { url: content.trim() }, error: null };
  }

  if (!content.trim())
    return { payload: null, error: "Podaj adres artykułu albo wklej jego treść" };
  return { payload: { input_text: content }, error: null };
}

export function SummarySubmitCard({ onSubmit, isSubmitting }: SummarySubmitCardProps) {
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [runDeepeval, setRunDeepeval] = useState(false);
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

    const { payload: sourcePayload, error: validationError } = buildSourcePayload(content);
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
    setContent("");
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
          <SourceField content={content} onContentChange={setContent} disabled={isSubmitting} />
        </div>

        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <div className="grid shrink-0 gap-2">
            <FieldLabel htmlFor="model-select">Model</FieldLabel>
            <Select
              id="model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={isSubmitting || isLoadingMeta}
              className="max-w-56 truncate"
            >
              <ModelOptions models={models} />
            </Select>
          </div>

          <ProcessingStrategySelect
            processingStrategies={processingStrategies}
            selectedProcessingStrategy={selectedProcessingStrategy}
            onProcessingStrategyChange={setSelectedProcessingStrategy}
            disabled={isSubmitting || isLoadingMeta}
          />

          <div className="grid shrink-0 gap-2">
            <FieldLabel htmlFor="language-select">Język</FieldLabel>
            <Select
              id="language-select"
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              disabled={isSubmitting || isLoadingMeta}
            >
              {languages.map((lang) => (
                <option key={lang} value={lang}>
                  {lang === "auto" ? "auto" : lang.toUpperCase()}
                </option>
              ))}
            </Select>
          </div>

          <label className="flex h-control shrink-0 items-center gap-2 text-muted">
            <input
              type="checkbox"
              checked={runDeepeval}
              onChange={(e) => setRunDeepeval(e.target.checked)}
              disabled={isSubmitting || isLoadingMeta}
              className="h-4 w-4 border border-input-border"
            />
            Policz G-Eval
          </label>

          <PresetSelect
            form={specForm}
            presets={presets}
            disabled={isSubmitting || isLoadingMeta}
          />
        </div>

        <SummarySpecFields form={specForm} disabled={isSubmitting || isLoadingMeta} />

        {error || optionsError ? <p className="text-danger">{error ?? optionsError}</p> : null}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={isSubmitting || isLoadingMeta}
          className="justify-self-start"
        >
          {isSubmitting ? "Przetwarzanie..." : "Podsumuj"}
        </Button>
      </form>
    </section>
  );
}
