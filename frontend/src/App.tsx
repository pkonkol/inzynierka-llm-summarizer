import { useEffect, useState } from "react";

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

function App() {
    const [route, setRoute] = useState<Route>(getRoute);

    useEffect(() => {
        const onPop = () => setRoute(getRoute());
        window.addEventListener("popstate", onPop);
        return () => window.removeEventListener("popstate", onPop);
    }, []);

    function navigate(next: Route) {
        const path = next === "home" ? "/" : `/${next}`;
        window.history.pushState({}, "", path);
        setRoute(next);
    }

    return (
        <div className="relative min-h-screen overflow-x-hidden">
            <NavDock active={route} onNavigate={navigate} />
            {route === "home" && <HomePage />}
            {route === "jobs" && <JobsPage />}
            {route === "research" && <ResearchPage />}
        </div>
    );
}

export default App;
