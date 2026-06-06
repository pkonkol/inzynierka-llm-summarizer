import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { getSupportedModels } from "../api/client";

interface UrlSubmitCardProps {
    onSubmit: (url: string, model_provider: string, model_name: string) => Promise<void>;
    isSubmitting: boolean;
}

export function UrlSubmitCard({ onSubmit, isSubmitting }: UrlSubmitCardProps) {
    const [url, setUrl] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [models, setModels] = useState<Record<string, string[]>>({});
    const [selectedModel, setSelectedModel] = useState("");
    const [isLoadingModels, setIsLoadingModels] = useState(true);

    useEffect(() => {
        const loadModels = async () => {
            try {
                const data = await getSupportedModels();
                setModels(data);
                const firstProvider = Object.keys(data)[0];
                const firstModel = data[firstProvider]?.[0];
                if (firstProvider && firstModel) {
                    setSelectedModel(`${firstProvider}:${firstModel}`);
                }
            } catch (err) {
                setError(`Nie udalo sie pobrac listy modeli: ${String(err)}`);
            } finally {
                setIsLoadingModels(false);
            }
        };
        void loadModels();
    }, []);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);

        try {
            const parsed = new URL(url);
            if (!["http:", "https:"].includes(parsed.protocol)) {
                throw new Error("Adres musi zaczynac sie od http:// lub https://");
            }
        } catch {
            setError("Wprowadz poprawny adres URL artykulu");
            return;
        }

        const [provider, model] = selectedModel.split(":");
        await onSubmit(url.trim(), provider, model);
        setUrl("");
    };

    return (
        <section className="animate-[riseIn_.55s_ease_both]">
            <h1 className="m-0 text-balance font-display text-[clamp(2rem,5vw,3.7rem)] tracking-[-0.04em]">
                Praca Inżynierska - Podsumowanie Artykułów z LLM
            </h1>
            <p className="mt-3 max-w-170 text-[1.05rem] text-muted">
                Wklej link do artykulu, a system wygeneruje podsumowanie i zapisze wynik do listy.
            </p>
            <form
                className="mt-5.5 border border-panel-border bg-panel-bg p-6 shadow-panel"
                onSubmit={handleSubmit}
            >
                <label htmlFor="article-url" className="mb-3 block text-[0.95rem] font-semibold text-muted">
                    Adres do analizy
                </label>
                <div className="grid grid-cols-[1fr_auto] gap-3 max-[980px]:grid-cols-1">
                    <input
                        id="article-url"
                        type="url"
                        value={url}
                        onChange={(event) => setUrl(event.target.value)}
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
                <div className="mt-3.5">
                    <label htmlFor="model-select" className="mb-2 block text-[0.95rem] font-semibold text-muted">
                        Model
                    </label>
                    <select
                        id="model-select"
                        value={selectedModel}
                        onChange={(event) => setSelectedModel(event.target.value)}
                        disabled={isSubmitting || isLoadingModels}
                        className="w-full border border-input-border bg-panel-solid px-4.5 py-3 text-base text-ink transition-[border-color,box-shadow] duration-200 focus:border-input-focus focus:outline-none focus:ring-[2px] focus:ring-accent-500/20 disabled:opacity-65"
                    >
                        {Object.entries(models).map(([provider, modelList]) =>
                            modelList.map((model) => (
                                <option key={`${provider}:${model}`} value={`${provider}:${model}`}>
                                    {provider} - {model}
                                </option>
                            ))
                        )}
                    </select>
                </div>
                {error ? <p className="mt-2.5 text-[0.9rem] text-danger">{error}</p> : null}
            </form>
        </section>
    );
}
