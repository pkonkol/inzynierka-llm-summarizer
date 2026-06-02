import { useState } from "react";
import type { FormEvent } from "react";

interface UrlSubmitCardProps {
    onSubmit: (url: string) => Promise<void>;
    isSubmitting: boolean;
}

export function UrlSubmitCard({ onSubmit, isSubmitting }: UrlSubmitCardProps) {
    const [url, setUrl] = useState("");
    const [error, setError] = useState<string | null>(null);

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

        await onSubmit(url.trim());
        setUrl("");
    };

    return (
        <section className="animate-[riseIn_.55s_ease_both]">
            <h1 className="m-0 text-balance font-display text-[clamp(2rem,5vw,3.7rem)] tracking-[-0.04em]">
                Summarize the Web, Clearly
            </h1>
            <p className="mt-3 max-w-170 text-[1.05rem] text-muted">
                Wklej link do artykulu, a system wygeneruje podsumowanie i zapisze wynik do listy.
            </p>
            <form
                className="mt-5.5 rounded-hero border border-panel-border bg-[linear-gradient(135deg,var(--color-hero-grad-start)_0%,var(--color-hero-grad-end)_100%)] p-6 shadow-panel"
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
                        className="h-14 min-w-0 rounded-full border border-input-border bg-white px-4.5 text-base text-ink transition-[border-color,box-shadow] duration-200 focus:border-input-focus focus:outline-none focus:ring-[3px] focus:ring-accent-500/15"
                    />
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="h-14 cursor-pointer rounded-full bg-[linear-gradient(135deg,var(--color-accent-500)_0%,var(--color-accent-700)_100%)] px-5.5 font-display text-[0.95rem] text-accent-50 transition-[transform,filter,opacity] duration-200 hover:enabled:-translate-y-px hover:enabled:saturate-110 disabled:cursor-wait disabled:opacity-65"
                    >
                        {isSubmitting ? "Przetwarzanie..." : "Start"}
                    </button>
                </div>
                {error ? <p className="mt-2.5 text-[0.9rem] text-danger">{error}</p> : null}
            </form>
        </section>
    );
}
