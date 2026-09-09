import { navigateTo, shouldInterceptClick } from "../utils/routing";
import { Tooltip } from "./ui/Tooltip";

interface NavEntry {
  id: string;
  label: string;
  href: string;
  description: string;
  isActive: (pathname: string) => boolean;
}

interface NavModule extends NavEntry {
  tabs: NavEntry[];
}

// Every module points at its own first tab, and the first tab of each module is the one that
// creates while the second one browses. The pairs read the same way in both modules.
const NAV_MODULES: NavModule[] = [
  {
    id: "nav-podsumowania",
    label: "Podsumowania",
    href: "/",
    description:
      "Pojedyncze artykuły. Wklejasz adres URL, system pobiera treść strony i generuje podsumowanie wybranym modelem LLM.",
    isActive: (pathname) => !pathname.startsWith("/research"),
    tabs: [
      {
        id: "nav-nowe",
        label: "Nowe",
        href: "/",
        description:
          "Formularz nowego podsumowania, zadania które właśnie się liczą i lista dotychczas podsumowanych adresów.",
        isActive: (pathname) => pathname === "/",
      },
      {
        id: "nav-wszystkie",
        label: "Wszystkie",
        href: "/jobs",
        description:
          "Pełna historia zadań: każde uruchomienie osobno, z modelem, trybem, statusem i pełnym wynikiem do pobrania.",
        isActive: (pathname) => pathname.startsWith("/jobs"),
      },
    ],
  },
  {
    id: "nav-ewaluacja",
    label: "Ewaluacja",
    href: "/research/import",
    description:
      "Całe zbiory artykułów z gotowymi podsumowaniami wzorcowymi. Uruchamiasz model na całym zbiorze i porównujesz wynik z wzorcem metrykami ROUGE, METEOR i G-Eval.",
    isActive: (pathname) => pathname.startsWith("/research"),
    tabs: [
      {
        id: "nav-import",
        label: "Import",
        href: "/research/import",
        description:
          "Wgraj nowy zbiór jako JSON: artykuły wraz z podsumowaniami wzorcowymi, względem których liczone są metryki.",
        isActive: (pathname) => pathname === "/research/import",
      },
      {
        id: "nav-zbiory",
        label: "Zbiory",
        href: "/research",
        description:
          "Lista zaimportowanych zbiorów ewaluacyjnych. Wejdź w zbiór, żeby obejrzeć jego wpisy i uruchomić na nim przebieg.",
        // A set and a run are reached from this list, so they keep it lit rather than clearing the bar.
        isActive: (pathname) => pathname.startsWith("/research") && pathname !== "/research/import",
      },
    ],
  },
];

const NAV_CELL =
  "flex w-full items-center justify-center whitespace-nowrap px-3 py-2 font-mono uppercase no-underline transition-colors duration-150 sm:px-5";
const MODULE_CLASS = `${NAV_CELL} text-sm tracking-widest`;
const TAB_CLASS = `${NAV_CELL} text-xs tracking-wider`;
const AUTH_CELL =
  "flex items-center whitespace-nowrap border-l border-panel-border px-3 font-mono text-sm uppercase tracking-widest sm:px-5";

function NavLink({
  entry,
  isActive,
  className,
}: {
  entry: NavEntry;
  isActive: boolean;
  className: string;
}) {
  return (
    <Tooltip id={entry.id} description={entry.description}>
      {/* The active entry keeps its href so it can still be copied or opened in a new tab;
          aria-current and the inverted background are what mark it as current. */}
      <a
        href={entry.href}
        aria-describedby={entry.id}
        aria-current={isActive ? "page" : undefined}
        className={`${className} ${
          isActive ? "bg-ink text-panel-solid" : "bg-panel-solid text-ink hover:bg-subtle-hover"
        }`}
        onClick={(event) => {
          if (!shouldInterceptClick(event)) return;
          event.preventDefault();
          navigateTo(entry.href);
        }}
      >
        {entry.label}
      </a>
    </Tooltip>
  );
}

interface NavDockProps {
  pathname: string;
  isLoggedIn: boolean;
  onOpenLogin: () => void;
}

export function NavDock({ pathname, isLoggedIn, onOpenLogin }: NavDockProps) {
  return (
    <div className="flex justify-center px-4 pt-4">
      <div className="inline-flex items-stretch border border-panel-border bg-panel-solid">
        {/* Every divider is a 1px gap showing the container colour behind the opaque cells.
            The modules stack below sm so the bar always fits: an ancestor carrying any overflow
            value to scroll it would clip the tooltips. */}
        <nav
          className="grid grid-cols-1 gap-px bg-panel-border sm:grid-cols-2"
          aria-label="Nawigacja główna"
        >
          {NAV_MODULES.map((module) => (
            <div key={module.id} className="grid gap-px">
              <NavLink
                entry={module}
                isActive={module.isActive(pathname)}
                className={MODULE_CLASS}
              />
              <div className="grid grid-cols-2 gap-px">
                {module.tabs.map((tab) => (
                  <NavLink
                    key={tab.id}
                    entry={tab}
                    isActive={tab.isActive(pathname)}
                    className={TAB_CLASS}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {isLoggedIn ? (
          <span className={`${AUTH_CELL} border-l-success-border bg-success-bg text-success`}>
            Zalogowano
          </span>
        ) : (
          <button
            type="button"
            onClick={onOpenLogin}
            className={`${AUTH_CELL} cursor-pointer text-ink hover:bg-subtle`}
          >
            Zaloguj
          </button>
        )}
      </div>
    </div>
  );
}
