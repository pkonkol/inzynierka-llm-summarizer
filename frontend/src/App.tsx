import { useEffect, useState } from "react";

import { getAuthStatus, getToken } from "./api/client";
import { LoginOverlay } from "./components/LoginOverlay";
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
    const [isAuthEnabled, setIsAuthEnabled] = useState(false);
    const [isLoginOpen, setIsLoginOpen] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(Boolean(getToken()));

    useEffect(() => {
        const onPop = () => setRoute(getRoute());
        window.addEventListener("popstate", onPop);
        return () => window.removeEventListener("popstate", onPop);
    }, []);

    useEffect(() => {
        let isMounted = true;
        const loadAuthStatus = async () => {
            try {
                const authStatus = await getAuthStatus();
                if (!isMounted) return;
                setIsAuthEnabled(authStatus.enabled);
            } catch {
                if (!isMounted) return;
                setIsAuthEnabled(false);
            }
        };
        void loadAuthStatus();
        return () => {
            isMounted = false;
        };
    }, []);

    function navigate(next: Route) {
        const path = next === "home" ? "/" : `/${next}`;
        window.history.pushState({}, "", path);
        setRoute(next);
    }

    function handleLoginSuccess() {
        setIsLoggedIn(true);
        setIsLoginOpen(false);
    }

    return (
        <div className="relative min-h-screen overflow-x-hidden">
            <NavDock
                active={route}
                onNavigate={navigate}
                isAuthEnabled={isAuthEnabled}
                isLoggedIn={isLoggedIn}
                onOpenLogin={() => setIsLoginOpen(true)}
            />
            <LoginOverlay
                isOpen={isLoginOpen}
                onSuccess={handleLoginSuccess}
                onClose={() => setIsLoginOpen(false)}
            />
            {route === "home" && <HomePage />}
            {route === "jobs" && <JobsPage />}
            {route === "research" && <ResearchPage />}
        </div>
    );
}

export default App;
