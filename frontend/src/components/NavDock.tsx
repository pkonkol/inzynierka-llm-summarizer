type Route = "home" | "jobs" | "research";

interface NavDockProps {
    active: Route;
    onNavigate: (route: Route) => void;
}

const NAV_ITEMS: { route: Route; label: string }[] = [
    { route: "home", label: "Summarize" },
    { route: "jobs", label: "Jobs" },
    { route: "research", label: "Research" },
];

export function NavDock({ active, onNavigate }: NavDockProps) {
    return (
        <div className="flex justify-center pt-4 px-4">
            <nav
                className="inline-flex border border-panel-border bg-panel-solid shadow-detail-desktop"
                aria-label="Nawigacja główna"
            >
                {NAV_ITEMS.map(({ route, label }) => (
                    <button
                        key={route}
                        type="button"
                        onClick={() => onNavigate(route)}
                        className={
                            `px-5 py-2.5 font-mono text-[0.82rem] uppercase tracking-widest transition-colors duration-150 ` +
                            (active === route
                                ? "bg-ink text-panel-solid cursor-default"
                                : "text-ink hover:bg-subtle cursor-pointer")
                        }
                        aria-current={active === route ? "page" : undefined}
                    >
                        {label}
                    </button>
                ))}
            </nav>
        </div>
    );
}
