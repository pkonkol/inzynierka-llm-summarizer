type Route = "home" | "jobs" | "research";

interface NavDockProps {
    active: Route;
    onNavigate: (route: Route) => void;
    isAuthEnabled: boolean;
    isLoggedIn: boolean;
    onOpenLogin: () => void;
}

const NAV_ITEMS: { route: Route; label: string }[] = [
    { route: "home", label: "Summarize" },
    { route: "jobs", label: "Jobs" },
    { route: "research", label: "Research" },
];

export function NavDock({
    active,
    onNavigate,
    isAuthEnabled,
    isLoggedIn,
    onOpenLogin,
}: NavDockProps) {
    const navItems = NAV_ITEMS.map(({ route, label }) => (
        <button
            key={route}
            type="button"
            onClick={() => onNavigate(route)}
            className={
                `px-5 py-2.5 font-mono text-sm uppercase tracking-widest transition-colors duration-150 ` +
                (active === route
                    ? "bg-ink text-panel-solid cursor-default"
                    : "text-ink hover:bg-subtle cursor-pointer")
            }
            aria-current={active === route ? "page" : undefined}
        >
            {label}
        </button>
    ));
    return (
        <div className="flex justify-center pt-4 px-4">
            <nav
                className="inline-flex items-center border border-panel-border bg-panel-solid"
                aria-label="Nawigacja główna"
            >
                {navItems}
                {isAuthEnabled && !isLoggedIn ? (
                    <button
                        type="button"
                        onClick={onOpenLogin}
                        className="border-l border-panel-border px-5 py-2.5 font-mono text-sm uppercase tracking-widest text-ink transition-colors duration-150 hover:bg-subtle"
                    >
                        Login
                    </button>
                ) : null}
                {isAuthEnabled && isLoggedIn ? (
                    <span className="border-l border-success-border bg-success-bg px-5 py-2.5 font-mono text-sm uppercase tracking-widest text-success">
                        Logged in
                    </span>
                ) : null}
            </nav>
        </div>
    );
}
