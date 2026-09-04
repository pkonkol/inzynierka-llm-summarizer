import { useEffect, useState } from "react";

import { getToken } from "./api/client";
import { LoginOverlay } from "./components/LoginOverlay";
import { NavDock } from "./components/NavDock";
import { DesignPage } from "./pages/DesignPage";
import { EvaluationRunPage } from "./pages/EvaluationRunPage";
import { EvaluationSetPage } from "./pages/EvaluationSetPage";
import { HomePage } from "./pages/HomePage";
import { JobsPage } from "./pages/JobsPage";
import { ResearchPage } from "./pages/ResearchPage";
import { getEvaluationSetIdFromPath, getRunIdFromPath } from "./utils/researchRouting";

type Route = "home" | "jobs" | "research";

function getRoute(): Route {
  const path = window.location.pathname;
  if (path.startsWith("/jobs")) return "jobs";
  if (path.startsWith("/research")) return "research";
  return "home";
}

function ResearchRouter() {
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const runId = getRunIdFromPath(pathname);
  if (runId) return <EvaluationRunPage runId={runId} />;

  const setId = getEvaluationSetIdFromPath(pathname);
  if (setId) return <EvaluationSetPage setId={setId} />;

  return <ResearchPage />;
}

function App() {
  const [route, setRoute] = useState<Route>(getRoute);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(Boolean(getToken()));

  useEffect(() => {
    const onPop = () => setRoute(getRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
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
    <div className="relative min-h-screen overflow-x-hidden">
      <NavDock active={route} isLoggedIn={isLoggedIn} onOpenLogin={() => setIsLoginOpen(true)} />
      <LoginOverlay
        isOpen={isLoginOpen}
        onSuccess={handleLoginSuccess}
        onClose={() => setIsLoginOpen(false)}
      />
      {route === "home" && <HomePage />}
      {route === "jobs" && <JobsPage />}
      {route === "research" && <ResearchRouter />}
      <span className="fixed bottom-1 right-2 select-none text-2xs text-muted/50">
        #{__COMMIT_HASH__}
      </span>
    </div>
  );
}

export default App;
