import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import { getSupportedLanguages, getSupportedModels, getSupportedModes } from "../api/client";

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

    const selectClass =
        "w-full border border-input-border bg-panel-solid px-4.5 py-3 text-base text-ink transition-[border-color,box-shadow] duration-200 focus:border-input-focus focus:outline-none focus:ring-[2px] focus:ring-accent-500/20 disabled:opacity-65";

    return (
        <section className="animate-[riseIn_.55s_ease_both]">
            <h1 className="m-0 text-balance font-display text-[clamp(2rem,5vw,3.7rem)] tracking-[-0.04em]">
                Praca Inżynierska - Podsumowanie Artykułów z LLM
            </h1>
            <p className="mt-3 max-w-170 text-[1.05rem] text-muted">
                Wklej link do artykułu, a system wygeneruje podsumowanie i zapisze wynik do listy.
            </p>
            <form
                className="mt-5.5 border border-panel-border bg-panel-bg p-6 shadow-panel"
                onSubmit={handleSubmit}
            >
                <label
                    htmlFor="article-url"
                    className="mb-3 block text-[0.95rem] font-semibold text-muted"
                >
                    Adres do analizy
                </label>
                <div className="grid grid-cols-[1fr_auto] gap-3 max-[980px]:grid-cols-1">
                    <input
                        id="article-url"
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://example.com/artykul"
                        disabled={isSubmitting}
                        required
                        className="h-14 min-w-0 border border-input-border bg-panel-solid px-4.5 text-base text-ink transition-[border-color,box-shadow] duration-200 focus:border-input-focus focus:outline-none focus:ring-[2px] focus:ring-accent-500/20"
                    />
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="h-14 cursor-pointer border border-accent-700 bg-accent-700 px-5.5 font-display text-[0.95rem] text-accent-50 transition-[opacity] duration-200 hover:enabled:opacity-90 disabled:cursor-wait disabled:opacity-65"
                    >
                        {isSubmitting ? "Przetwarzanie..." : "Start"}
                    </button>
                </div>

                <div className="mt-3.5 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    <div>
                        <label
                            htmlFor="model-select"
                            className="mb-2 block text-[0.95rem] font-semibold text-muted"
                        >
                            Model
                        </label>
                        <select
                            id="model-select"
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(e.target.value)}
                            disabled={isSubmitting || isLoadingMeta}
                            className={selectClass}
                        >
                            {Object.entries(models).map(([provider, modelList]) =>
                                modelList.map((model) => (
                                    <option
                                        key={`${provider}:${model}`}
                                        value={`${provider}:${model}`}
                                    >
                                        {provider} – {model}
                                    </option>
                                )),
                            )}
                        </select>
                    </div>

                    <div>
                        <label
                            htmlFor="language-select"
                            className="mb-2 block text-[0.95rem] font-semibold text-muted"
                        >
                            Język podsumowania
                        </label>
                        <select
                            id="language-select"
                            value={selectedLanguage}
                            onChange={(e) => setSelectedLanguage(e.target.value)}
                            disabled={isSubmitting || isLoadingMeta}
                            className={selectClass}
                        >
                            {languages.map((lang) => (
                                <option key={lang} value={lang}>
                                    {lang.toUpperCase()}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label
                            htmlFor="mode-select"
                            className="mb-2 block text-[0.95rem] font-semibold text-muted"
                        >
                            Tryb podsumowania
                        </label>
                        <select
                            id="mode-select"
                            value={selectedMode}
                            onChange={(e) => setSelectedMode(e.target.value)}
                            disabled={isSubmitting || isLoadingMeta}
                            className={selectClass}
                        >
                            {Object.entries(modes).map(([key, label]) => (
                                <option key={key} value={key}>
                                    {key} — {label.split(" — ")[1] ?? label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <label className="mt-4 flex items-center gap-2 text-[0.95rem] text-muted">
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

                {error ? <p className="mt-2.5 text-[0.9rem] text-danger">{error}</p> : null}
            </form>
        </section>
    );
}
