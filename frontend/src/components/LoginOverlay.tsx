import { useState } from "react";
import type { FormEvent } from "react";

import { login, setToken } from "../api/client";

export function LoginOverlay({ onSuccess }: { onSuccess: () => void }) {
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        try {
            const { token } = await login(password);
            setToken(token);
            onSuccess();
        } catch {
            setError("Nieprawidłowe hasło");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <form
                onSubmit={handleSubmit}
                className="w-full max-w-sm border border-panel-border bg-panel-bg p-8 shadow-panel"
            >
                <h2 className="mb-5 font-display text-2xl">Dostęp</h2>
                <input
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Hasło"
                    disabled={isLoading}
                    className="mb-3 h-12 w-full border border-input-border bg-panel-solid px-4 text-base text-ink focus:border-input-focus focus:outline-none focus:ring-[2px] focus:ring-accent-500/20"
                />
                <button
                    type="submit"
                    disabled={isLoading || !password}
                    className="h-12 w-full cursor-pointer border border-accent-700 bg-accent-700 font-display text-accent-50 transition-[opacity] duration-200 hover:enabled:opacity-90 disabled:cursor-wait disabled:opacity-65"
                >
                    {isLoading ? "..." : "Wejdź"}
                </button>
                {error ? <p className="mt-3 text-[0.9rem] text-danger">{error}</p> : null}
            </form>
        </div>
    );
}
