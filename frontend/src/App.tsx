import { NavDock } from "./components/NavDock";
import { HomePage } from "./pages/HomePage";
import { JobsPage } from "./pages/JobsPage";
import { ResearchPage } from "./pages/ResearchPage";

type Route = "home" | "jobs" | "research";

function getRoute(): Route {
    const path = window.location.pathname;
    if (path.startsWith("/jobs")) return "jobs";
    if (path.startsWith("/research")) return "research";
    return "home";
}

function navigate(route: Route) {
    const path = route === "home" ? "/" : `/${route}`;
    window.history.pushState({}, "", path);
    // force re-render via popstate
    window.dispatchEvent(new PopStateEvent("popstate"));
}

function App() {
    const [route, setRoute] = window.__reactUseStateShim
        ? window.__reactUseStateShim<Route>(getRoute)
        : // eslint-disable-next-line react-hooks/rules-of-hooks
          (() => {
              const { useState, useEffect } = require("react") as typeof import("react");
              const [r, setR] = useState<Route>(getRoute);
              useEffect(() => {
                  const onPop = () => setR(getRoute());
                  window.addEventListener("popstate", onPop);
                  return () => window.removeEventListener("popstate", onPop);
              }, []);
              return [r, setR] as const;
          })();

    void route; void setRoute;
    return <></>;
}

export default App;
