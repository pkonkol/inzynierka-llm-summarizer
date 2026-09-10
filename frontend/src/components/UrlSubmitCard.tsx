import type { FormEvent } from "react";
import { useState } from "react";
import { useSummarizationOptions } from "../utils/useSummarizationOptions";
import { splitProviderModel } from "../utils/utils";
import { Button } from "./ui/Button";
import { FieldLabel, Input, ModelOptions, Select } from "./ui/Field";

interface UrlSubmitCardProps {
  onSubmit: (
    url: string,
    model_provider: string,
    model_name: string,
    language: string,
    summary_mode: string,
    run_deepeval: boolean,
  ) => Promise<void>;
  isSubmitting: boolean;
}

export function UrlSubmitCard({ onSubmit, isSubmitting }: UrlSubmitCardProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [runDeepeval, setRunDeepeval] = useState(false);
  const {
    models,
    modes,
    languages,
    selectedModel,
    setSelectedModel,
    selectedMode,
    setSelectedMode,
    selectedLanguage,
    setSelectedLanguage,
    isLoading: isLoadingMeta,
    errorMessage: optionsError,
  } = useSummarizationOptions();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Adres musi zaczynać się od http:// lub https://");
      }
    } catch {
      setError("Wprowadź poprawny adres URL artykułu");
      return;
    }

    const { provider, modelName } = splitProviderModel(selectedModel);
    await onSubmit(url.trim(), provider, modelName, selectedLanguage, selectedMode, runDeepeval);
    setUrl("");
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
        <div className="grid gap-2">
          <p className="max-w-measure text-muted">
            Wklej adres artykułu i wybierz model — system pobierze treść, wygeneruje podsumowanie i
            policzy metryki jakości.
          </p>
          <FieldLabel htmlFor="article-url">Adres do analizy</FieldLabel>
          <div className="grid grid-cols-[1fr_auto] gap-3 max-lg:grid-cols-1">
            <Input
              id="article-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/artykul"
              disabled={isSubmitting}
              required
              className="min-w-0"
            />
            <Button type="submit" variant="primary" size="lg" disabled={isSubmitting}>
              {isSubmitting ? "Przetwarzanie..." : "Start"}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
                  {lang.toUpperCase()}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-2">
            <FieldLabel htmlFor="mode-select">Tryb podsumowania</FieldLabel>
            <Select
              id="mode-select"
              value={selectedMode}
              onChange={(e) => setSelectedMode(e.target.value)}
              disabled={isSubmitting || isLoadingMeta}
            >
              {Object.entries(modes).map(([key, label]) => (
                <option key={key} value={key}>
                  {key} — {label.split(" — ")[1] ?? label}
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

        {error || optionsError ? <p className="text-danger">{error ?? optionsError}</p> : null}
      </form>
    </section>
  );
}
