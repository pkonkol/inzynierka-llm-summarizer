import { useEffect, useState } from "react";

import { getBackendVersion } from "./api/client";
import { NavDock } from "./components/NavDock";
import { DesignPage } from "./pages/DesignPage";
import { EvaluationImportPage } from "./pages/EvaluationImportPage";
import { EvaluationRunPage } from "./pages/EvaluationRunPage";
import { EvaluationSetPage } from "./pages/EvaluationSetPage";
import { HomePage } from "./pages/HomePage";
import { JobsPage } from "./pages/JobsPage";
import { LoginPage } from "./pages/LoginPage";
import { PublicHomePage } from "./pages/PublicHomePage";
import { ResearchPage } from "./pages/ResearchPage";
import { logger } from "./utils/logger";
import { isAdminRoute, matchRoute, type Route } from "./utils/routing";
import { useBackgroundWorkKeepalive } from "./utils/useBackgroundWorkKeepalive";
import { useIsLoggedIn } from "./utils/useIsLoggedIn";

function CurrentPage({ route }: { route: Route }) {
  switch (route.tab) {
    case "public":
      return <PublicHomePage />;
    case "login":
      return <LoginPage />;
    case "new":
      return <HomePage />;
    case "all":
      return <JobsPage jobId={route.jobId} />;
    case "import":
      return <EvaluationImportPage />;
    case "sets":
      return <ResearchPage />;
    case "set":
      return <EvaluationSetPage setId={route.setId} />;
    case "run":
      return <EvaluationRunPage runId={route.runId} />;
  }
}

function App() {
  const [pathname, setPathname] = useState(window.location.pathname);
  const route = matchRoute(pathname);
  const isLoggedIn = useIsLoggedIn();
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

  // Reference gallery for the design system; deliberately outside the app chrome.
  if (import.meta.env.DEV && window.location.pathname.startsWith("/design")) {
    return <DesignPage />;
  }

  return (
    <div className="relative min-h-screen overflow-x-clip">
      {isAdminRoute(route) ? <NavDock route={route} isLoggedIn={isLoggedIn} /> : null}
      <CurrentPage route={route} />
      {isAdminRoute(route) ? (
        <span className="fixed bottom-1 right-2 select-none text-2xs text-muted/50">
          front #{__COMMIT_HASH__} · back #{backendSha || "?"}
        </span>
      ) : null}
    </div>
  );
}

export default App;
