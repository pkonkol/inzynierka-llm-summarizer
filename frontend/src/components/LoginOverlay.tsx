import type { FormEvent } from "react";
import { useState } from "react";

import { login, setToken } from "../api/client";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";

interface LoginOverlayProps {
  isOpen: boolean;
  onSuccess: () => void;
  onClose: () => void;
}

export function LoginOverlay({ isOpen, onSuccess, onClose }: LoginOverlayProps) {
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
      setPassword("");
      onSuccess();
    } catch {
      setError("Nieprawidłowe hasło");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} title="Dostęp wymagany" onSubmit={handleSubmit}>
      <p className="m-0 text-sm text-muted">Zaloguj się, aby uruchomić nowe podsumowanie.</p>
      <Input
        autoFocus
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Hasło"
        disabled={isLoading}
      />
      <div className="flex gap-3">
        <Button size="lg" className="flex-1" onClick={onClose} disabled={isLoading}>
          Anuluj
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="flex-1"
          disabled={isLoading || !password}
        >
          {isLoading ? "..." : "Wejdź"}
        </Button>
      </div>
      {error ? <p className="m-0 text-md text-danger">{error}</p> : null}
    </Modal>
  );
}
