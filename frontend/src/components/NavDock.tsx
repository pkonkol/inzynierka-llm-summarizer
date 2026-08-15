import { navigateTo, shouldInterceptClick } from "../utils/researchRouting";

type Route = "home" | "jobs" | "research";

interface NavDockProps {
  active: Route;
  isAuthEnabled: boolean;
  isLoggedIn: boolean;
  onOpenLogin: () => void;
}

const NAV_ITEMS: { route: Route; label: string; href: string }[] = [
  { route: "home", label: "Summarize", href: "/" },
  { route: "jobs", label: "Jobs", href: "/jobs" },
  { route: "research", label: "Research", href: "/research" },
];

const NAV_ITEM_CLASS =
  "px-5 py-2 font-mono text-sm uppercase tracking-widest no-underline transition-colors duration-150";

export function NavDock({ active, isAuthEnabled, isLoggedIn, onOpenLogin }: NavDockProps) {
  // The active route keeps its href so it can still be copied or opened in a new tab;
  // aria-current and the inverted background are what mark it as current.
  const navItems = NAV_ITEMS.map(({ route, label, href }) => (
    <a
      key={route}
      href={href}
      className={
        `${NAV_ITEM_CLASS} ` +
        (active === route ? "bg-ink text-panel-solid" : "text-ink hover:bg-subtle")
      }
      aria-current={active === route ? "page" : undefined}
      onClick={(event) => {
        if (!shouldInterceptClick(event)) return;
        event.preventDefault();
        navigateTo(href);
      }}
    >
      {label}
    </a>
  ));

  return (
    <div className="flex justify-center px-4 pt-4">
      <nav
        className="inline-flex items-center border border-panel-border bg-panel-solid"
        aria-label="Nawigacja główna"
      >
        {navItems}
        {isAuthEnabled && !isLoggedIn ? (
          <button
            type="button"
            onClick={onOpenLogin}
            className={`${NAV_ITEM_CLASS} cursor-pointer border-l border-panel-border text-ink hover:bg-subtle`}
          >
            Login
          </button>
        ) : null}
        {isAuthEnabled && isLoggedIn ? (
          <span
            className={`${NAV_ITEM_CLASS} border-l border-success-border bg-success-bg text-success`}
          >
            Logged in
          </span>
        ) : null}
      </nav>
    </div>
  );
}
