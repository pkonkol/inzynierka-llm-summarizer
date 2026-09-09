import { useEffect, useState } from "react";

import { getBackendVersion, getToken } from "./api/client";
import { LoginOverlay } from "./components/LoginOverlay";
import { NavDock } from "./components/NavDock";
import { DesignPage } from "./pages/DesignPage";
import { EvaluationImportPage } from "./pages/EvaluationImportPage";
import { EvaluationRunPage } from "./pages/EvaluationRunPage";
import { EvaluationSetPage } from "./pages/EvaluationSetPage";
import { HomePage } from "./pages/HomePage";
import { JobsPage } from "./pages/JobsPage";
import { ResearchPage } from "./pages/ResearchPage";
import { logger } from "./utils/logger";
import {
  getEvaluationSetIdFromPath,
  getJobIdFromPath,
  getRunIdFromPath,
  RESEARCH_IMPORT_PATH,
} from "./utils/routing";
import { useBackgroundWorkKeepalive } from "./utils/useBackgroundWorkKeepalive";

type Route = "home" | "jobs" | "research";

function getRoute(pathname: string): Route {
  if (pathname.startsWith("/jobs")) return "jobs";
  if (pathname.startsWith("/research")) return "research";
  return "home";
}

function ResearchRouter({ pathname }: { pathname: string }) {
  const runId = getRunIdFromPath(pathname);
  if (runId) return <EvaluationRunPage runId={runId} />;

  const setId = getEvaluationSetIdFromPath(pathname);
  if (setId) return <EvaluationSetPage setId={setId} />;

  if (pathname === RESEARCH_IMPORT_PATH) return <EvaluationImportPage />;

  return <ResearchPage />;
}

function App() {
  const [pathname, setPathname] = useState(window.location.pathname);
  const route = getRoute(pathname);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(Boolean(getToken()));
  const [backendSha, setBackendSha] = useState("");
  useBackgroundWorkKeepalive();

  useEffect(() => {
    const onPop = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    let isMounted = true;
    getBackendVersion()
      .then(({ git_sha }) => {
        if (isMounted) setBackendSha(git_sha);
      })
      .catch((error: unknown) => {
        logger.warn("backend version unavailable", { error });
      });
    return () => {
      isMounted = false;
    };
  }, []);

  function handleLoginSuccess() {
    setIsLoggedIn(true);
    setIsLoginOpen(false);
  }

  // Reference gallery for the design system; deliberately outside the app chrome.
  if (import.meta.env.DEV && window.location.pathname.startsWith("/design")) {
    return <DesignPage />;
  }

  return (
    <div className="relative min-h-screen overflow-x-clip">
      <NavDock
        pathname={pathname}
        isLoggedIn={isLoggedIn}
        onOpenLogin={() => setIsLoginOpen(true)}
      />
      <LoginOverlay
        isOpen={isLoginOpen}
        onSuccess={handleLoginSuccess}
        onClose={() => setIsLoginOpen(false)}
      />
      {route === "home" && <HomePage />}
      {route === "jobs" && <JobsPage jobId={getJobIdFromPath(pathname)} />}
      {route === "research" && <ResearchRouter pathname={pathname} />}
      <span className="fixed bottom-1 right-2 select-none text-2xs text-muted/50">
        front #{__COMMIT_HASH__} · back #{backendSha || "?"}
      </span>
    </div>
  );
}

export default App;
