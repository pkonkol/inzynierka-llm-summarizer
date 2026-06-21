import { useState } from "react";

import { NavDock } from "./components/NavDock";
import { HomePage } from "./pages/HomePage";
import { JobsPage } from "./pages/JobsPage";
import { ResearchPage } from "./pages/ResearchPage";

type Route = "home" | "jobs" | "research";

function App() {
    const [route, setRoute] = useState<Route>("home");

    return (
        <div className="relative min-h-screen overflow-x-hidden">
            <NavDock active={route} onNavigate={setRoute} />
            {route === "home" && <HomePage />}
            {route === "jobs" && <JobsPage />}
            {route === "research" && <ResearchPage />}
        </div>
    );
}

export default App;
