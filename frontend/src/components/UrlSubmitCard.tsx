import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import { getSupportedLanguages, getSupportedModels, getSupportedModes } from "../api/client";
import { Button } from "./ui/Button";
import { FieldLabel, Input, Select } from "./ui/Field";

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
  const [models, setModels] = useState<Record<string, string[]>>({});
  const [selectedModel, setSelectedModel] = useState("");
  const [isLoadingMeta, setIsLoadingMeta] = useState(true);
  const [languages, setLanguages] = useState<string[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [modes, setModes] = useState<Record<string, string>>({});
  const [selectedMode, setSelectedMode] = useState("simple");
  const [runDeepeval, setRunDeepeval] = useState(false);

  useEffect(() => {
    const loadMeta = async () => {
      try {
        const [data, langs, modeMap] = await Promise.all([
          getSupportedModels(),
          getSupportedLanguages(),
          getSupportedModes(),
        ]);
        setModels(data);
        setLanguages(langs);
        setModes(modeMap);
        if (langs[0]) setSelectedLanguage(langs[0]);
        if (Object.keys(modeMap)[0]) setSelectedMode(Object.keys(modeMap)[0]);
        const firstProvider = Object.keys(data)[0];
        const firstModel = data[firstProvider]?.[0];
        if (firstProvider && firstModel) setSelectedModel(`${firstProvider}:${firstModel}`);
      } catch (err) {
        setError(`Nie udało się pobrać konfiguracji: ${String(err)}`);
      } finally {
        setIsLoadingMeta(false);
      }
    };
    void loadMeta();
  }, []);

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

    const [provider, ...modelParts] = selectedModel.split(":");
    const model = modelParts.join(":");
    await onSubmit(url.trim(), provider, model, selectedLanguage, selectedMode, runDeepeval);
    setUrl("");
  };

  return (
    <section className="grid animate-[riseIn_.55s_ease_both] gap-6">
      <div className="grid gap-3">
        <h1 className="m-0 text-balance font-mono text-hero tracking-[-0.04em]">
          Praca Inżynierska - Podsumowanie Artykułów z LLM
        </h1>
        <p className="m-0 max-w-170 text-lg text-muted">
          Wklej link do artykułu, a system wygeneruje podsumowanie i zapisze wynik do listy.
        </p>
      </div>
      <form
        className="grid gap-4 border border-panel-border bg-panel-solid p-6"
        onSubmit={handleSubmit}
      >
        <div className="grid gap-2">
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
              {Object.entries(models).map(([provider, modelList]) =>
                modelList.map((model) => (
                  <option key={`${provider}:${model}`} value={`${provider}:${model}`}>
                    {provider} – {model}
                  </option>
                )),
              )}
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

          <label className="flex items-center gap-2 self-end text-base text-muted sm:h-11">
            <input
              type="checkbox"
              checked={runDeepeval}
              onChange={(e) => setRunDeepeval(e.target.checked)}
              disabled={isSubmitting || isLoadingMeta}
              className="h-4 w-4 border border-input-border"
            />
            Run G-Eval
          </label>
        </div>

        {error ? <p className="m-0 text-md text-danger">{error}</p> : null}
      </form>
    </section>
  );
}
