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
        <section className="submit-section">
            <h1>Summarize the Web, Clearly</h1>
            <p className="subtitle">
                Wklej link do artykulu, a system wygeneruje podsumowanie i zapisze wynik do listy.
            </p>
            <form className="submit-card" onSubmit={handleSubmit}>
                <label htmlFor="article-url">Adres do analizy</label>
                <div className="input-row">
                    <input
                        id="article-url"
                        type="url"
                        value={url}
                        onChange={(event) => setUrl(event.target.value)}
                        placeholder="https://example.com/artykul"
                        disabled={isSubmitting}
                        required
                    />
                    <button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? "Przetwarzanie..." : "Start"}
                    </button>
                </div>
                {error ? <p className="input-error">{error}</p> : null}
            </form>
        </section>
    );
}
