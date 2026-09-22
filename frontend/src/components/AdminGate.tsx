import { useEffect } from "react";

import { getAuthStatus } from "../api/client";
import { LOGIN_PATH, redirectTo } from "../utils/routing";
import { useFetchOnMount } from "../utils/useFetchOnMount";
import { useIsLoggedIn } from "../utils/useIsLoggedIn";
import { Alert } from "./ui/Alert";
import { PageShell } from "./ui/PageShell";

// A convenience for the person using the console: the read endpoints stay open on the backend,
// so this hides the pages from a visitor without being what protects them.
export function AdminGate({ children }: { children: React.ReactNode }) {
  const isLoggedIn = useIsLoggedIn();
  const authStatus = useFetchOnMount(
    getAuthStatus,
    "auth-status",
    "Nie udało się sprawdzić logowania",
  );
  const mustLogIn = authStatus.data?.enabled === true && !isLoggedIn;

  useEffect(() => {
    if (mustLogIn) redirectTo(LOGIN_PATH);
  }, [mustLogIn]);

  if (authStatus.errorMessage) {
    return (
      <PageShell>
        <Alert tone="danger">{authStatus.errorMessage}</Alert>
      </PageShell>
    );
  }
  // Nothing renders until the answer is in, so the console never flashes at a visitor.
  if (authStatus.data === null || mustLogIn) return null;
  return children;
}
