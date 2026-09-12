import {
  EVALUATION_IMPORT_PATH,
  EVALUATION_SETS_PATH,
  type Route,
  SUMMARIES_ALL_PATH,
  SUMMARIES_NEW_PATH,
} from "../utils/routing";
import type { Crumb } from "./Breadcrumbs";
import { AppLink } from "./ui/AppLink";
import { segmentedCellClasses } from "./ui/segmentedCell";
import { Tooltip } from "./ui/Tooltip";

interface NavTab {
  tab: Route["tab"];
  label: string;
  href: string;
  description: string;
}

interface NavModule {
  label: string;
  description: string;
  tabs: NavTab[];
}

// The first tab of each module creates, the second browses, and the module cell links to its
// own first tab. Both modules read the same way round.
const NAV_MODULES: NavModule[] = [
  {
    label: "Podsumowania",
    description:
      "Pojedyncze artykuły. Wklejasz adres URL, system pobiera treść strony i generuje podsumowanie wybranym modelem LLM.",
    tabs: [
      {
        tab: "new",
        label: "Nowe",
        href: SUMMARIES_NEW_PATH,
        description:
          "Formularz nowego podsumowania, zadania które właśnie się liczą i lista dotychczas podsumowanych adresów.",
      },
      {
        tab: "all",
        label: "Wszystkie",
        href: SUMMARIES_ALL_PATH,
        description:
          "Pełna historia zadań: każde uruchomienie osobno, z modelem, trybem, statusem i pełnym wynikiem do pobrania.",
      },
    ],
  },
  {
    label: "Ewaluacja",
    description:
      "Całe zbiory artykułów z gotowymi podsumowaniami wzorcowymi. Uruchamiasz model na całym zbiorze i porównujesz wynik z wzorcem metrykami ROUGE, METEOR i G-Eval.",
    tabs: [
      {
        tab: "import",
        label: "Import",
        href: EVALUATION_IMPORT_PATH,
        description:
          "Wgraj nowy zbiór jako JSON: artykuły wraz z podsumowaniami wzorcowymi, względem których liczone są metryki.",
      },
      {
        tab: "sets",
        label: "Zbiory",
        href: EVALUATION_SETS_PATH,
        description:
          "Lista zaimportowanych zbiorów ewaluacyjnych. Wejdź w zbiór, żeby obejrzeć jego wpisy i uruchomić na nim przebieg.",
      },
    ],
  },
];

const EVALUATION_MODULE = NAV_MODULES[1];

// A set and a run are opened from the list, so they keep its tab lit.
const NAV_TAB: Record<Route["tab"], NavTab["tab"]> = {
  new: "new",
  all: "all",
  import: "import",
  sets: "sets",
  set: "sets",
  run: "sets",
};

/** The breadcrumb ancestors of a set or a run, so the labels are written in one place only. */
export const EVALUATION_TRAIL: Crumb[] = EVALUATION_MODULE.tabs.map((tab, index) => ({
  label: index === 0 ? EVALUATION_MODULE.label : tab.label,
  href: tab.href,
}));

const CELL = "flex items-center whitespace-nowrap px-3 font-mono uppercase sm:px-5";
const AUTH_CELL = `${CELL} border-l border-panel-border text-sm tracking-widest`;

function NavLink({
  label,
  href,
  description,
  isActive,
  className,
}: {
  label: string;
  href: string;
  description: string;
  isActive: boolean;
  className: string;
}) {
  return (
    <Tooltip description={description}>
      {(describedBy) => (
        // The active entry keeps its href so it can still be copied or opened in a new tab;
        // aria-current and the inverted background are what mark it as current.
        <AppLink
          href={href}
          aria-describedby={describedBy}
          aria-current={isActive ? "page" : undefined}
          className={`no-underline ${segmentedCellClasses(isActive, className)}`}
        >
          {label}
        </AppLink>
      )}
    </Tooltip>
  );
}

interface NavDockProps {
  route: Route;
  isLoggedIn: boolean;
  onOpenLogin: () => void;
}

export function NavDock({ route, isLoggedIn, onOpenLogin }: NavDockProps) {
  const activeTab = NAV_TAB[route.tab];

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
            <div key={module.label} className="grid gap-px">
              <NavLink
                label={module.label}
                href={module.tabs[0].href}
                description={module.description}
                isActive={module.tabs.some((tab) => tab.tab === activeTab)}
                className="w-full text-sm tracking-widest"
              />
              <div className="grid grid-cols-2 gap-px">
                {module.tabs.map((tab) => (
                  <NavLink
                    key={tab.tab}
                    label={tab.label}
                    href={tab.href}
                    description={tab.description}
                    isActive={tab.tab === activeTab}
                    className="w-full text-xs tracking-wider"
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
