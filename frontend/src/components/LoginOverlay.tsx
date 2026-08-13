import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { login, setToken } from "../api/client";

interface LoginOverlayProps {
    isOpen: boolean;
    onSuccess: () => void;
    onClose: () => void;
}

export function LoginOverlay({ isOpen, onSuccess, onClose }: LoginOverlayProps) {
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const passwordInputRef = useRef<HTMLInputElement>(null);

    // Focus on open rather than via autoFocus: the attribute only fires on first mount, so
    // it does nothing when this overlay is re-opened without unmounting.
    useEffect(() => {
        if (isOpen) passwordInputRef.current?.focus();
    }, [isOpen]);

    if (!isOpen) {
        return null;
    }

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const { token } = await login(password);
            setToken(token);
            setPassword("");
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
                <h2 className="mb-5 font-display text-2xl">Dostęp wymagany</h2>
                <p className="mb-4 text-sm text-muted">
                    Zaloguj się, aby uruchomić nowe podsumowanie.
                </p>
                <input
                    ref={passwordInputRef}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Hasło"
                    disabled={isLoading}
                    className="mb-3 h-12 w-full border border-input-border bg-panel-solid px-4 text-base text-ink focus:border-input-focus focus:outline-none focus:ring-[2px] focus:ring-accent-500/20"
                />
                <div className="flex gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isLoading}
                        className="h-12 flex-1 cursor-pointer border border-panel-border bg-panel-solid text-ink transition-[opacity] duration-200 hover:enabled:opacity-90 disabled:opacity-65"
                    >
                        Anuluj
                    </button>
                    <button
                        type="submit"
                        disabled={isLoading || !password}
                        className="h-12 flex-1 cursor-pointer border border-accent-700 bg-accent-700 font-display text-accent-50 transition-[opacity] duration-200 hover:enabled:opacity-90 disabled:cursor-wait disabled:opacity-65"
                    >
                        {isLoading ? "..." : "Wejdź"}
                    </button>
                </div>
                {error ? <p className="mt-3 text-[0.9rem] text-danger">{error}</p> : null}
            </form>
        </div>
    );
}
