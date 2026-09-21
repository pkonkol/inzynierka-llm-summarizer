import type { FormEvent } from "react";
import { useState } from "react";

import { login, setToken } from "../api/client";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { FieldLabel, Input } from "../components/ui/Field";
import { Panel } from "../components/ui/Panel";
import { navigateTo, SUMMARIES_NEW_PATH } from "../utils/routing";
import { useDocumentTitle } from "../utils/useDocumentTitle";

export function LoginPage() {
  useDocumentTitle("Logowanie");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const { token } = await login(password);
      setToken(token);
      navigateTo(SUMMARIES_NEW_PATH);
    } catch {
      setError("Nieprawidłowe hasło");
      setIsLoading(false);
    }
  };

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-sm content-center px-3 py-8">
      <Panel padding="xl">
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <h1>Dostęp wymagany</h1>
          <div className="grid gap-2">
            <FieldLabel htmlFor="login-password">Hasło</FieldLabel>
            <Input
              id="login-password"
              autoFocus
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />
          </div>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button type="submit" variant="primary" size="lg" disabled={isLoading || !password}>
            {isLoading ? "..." : "Wejdź"}
          </Button>
        </form>
      </Panel>
    </main>
  );
}
