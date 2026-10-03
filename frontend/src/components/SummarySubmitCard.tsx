import type { FormEvent } from "react";
import { useState } from "react";
import { useSummarizationOptions } from "../hooks/useSummarizationOptions";
import { useSummarySpecForm } from "../hooks/useSummarySpecForm";
import type { JobCreateRequest } from "../types/api.generated";
import { MAX_PASTED_CHARS, splitProviderModel } from "../utils/jobs";
import { buildSourcePayload, SourceField } from "./SourceField";
import { ProcessingStrategySelect, SummarySpecFields } from "./SummarySpecFields";
import { Button } from "./ui/Button";
import { Checkbox } from "./ui/Checkbox";
import { FieldLabel, ModelOptions, Select } from "./ui/Field";

interface SummarySubmitCardProps {
  /** Resolves false when the request failed, so the typed source is kept for a retry. */
  onSubmit: (payload: JobCreateRequest) => Promise<boolean>;
  isSubmitting: boolean;
}

export function SummarySubmitCard({ onSubmit, isSubmitting }: SummarySubmitCardProps) {
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [runDeepeval, setRunDeepeval] = useState(false);
  const {
    models,
    processingStrategies,
    languages,
    selectedModel,
    setSelectedModel,
    selectedProcessingStrategy,
    setSelectedProcessingStrategy,
    selectedLanguage,
    setSelectedLanguage,
    isLoading: isLoadingMeta,
    errorMessage: optionsError,
  } = useSummarizationOptions();
  const specForm = useSummarySpecForm({ offerMatchReference: false });

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
      <h1 className="text-title text-balance">Praca Inżynierska - Podsumowanie Artykułów z LLM</h1>
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <div className="grid gap-3">
          <SourceField
            content={content}
            onContentChange={setContent}
            maxLength={MAX_PASTED_CHARS}
            disabled={isSubmitting}
          />
        </div>

        <div className="grid items-end gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="grid shrink-0 gap-2">
            <FieldLabel htmlFor="model-select">Model</FieldLabel>
            <Select
              id="model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={isSubmitting || isLoadingMeta}
              className="truncate"
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

          <Checkbox
            checked={runDeepeval}
            onChange={(e) => setRunDeepeval(e.target.checked)}
            disabled={isSubmitting || isLoadingMeta}
          >
            Policz G-Eval
          </Checkbox>
        </div>

        <SummarySpecFields form={specForm} disabled={isSubmitting || isLoadingMeta} />

        {error || optionsError ? (
          <p className="text-danger-hover">{error ?? optionsError}</p>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          disabled={isSubmitting || isLoadingMeta}
          className="justify-self-start"
        >
          {isSubmitting ? "Przetwarzanie..." : "Podsumuj"}
        </Button>
      </form>
    </section>
  );
}
