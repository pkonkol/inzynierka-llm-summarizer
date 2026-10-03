import {
  type AdminRoute,
  EVALUATION_IMPORT_PATH,
  EVALUATION_SETS_PATH,
  evaluationRunPath,
  evaluationSetPath,
  jobPath,
  LOGIN_PATH,
  PUBLIC_HOME_PATH,
  SUMMARIES_ALL_PATH,
  SUMMARIES_NEW_PATH,
} from "../utils/routing";
import type { Crumb } from "./Breadcrumbs";
import { AppLink } from "./ui/AppLink";
import { cn } from "./ui/cn";
import { Tooltip } from "./ui/Tooltip";

interface NavTab {
  tab: AdminRoute["tab"];
  label: string;
  href: string;
  description: string;
}

interface NavModule {
  label: string;
  tabs: NavTab[];
}

// The first tab of each module creates, the second browses. Both modules read the same way round.
const NAV_MODULES: NavModule[] = [
  {
    label: "Podsumowania",
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
const NAV_TAB: Record<AdminRoute["tab"], NavTab["tab"]> = {
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

// Only an id-bearing page gets its own crumb after the list it was opened from (DESIGN.md §7).
// Served outside the admin shell, by the dev server only (App.tsx).
const DESIGN_PATH = "/design";

function currentSubpath(route: AdminRoute): string | null {
  if (route.tab === "set") return evaluationSetPath(route.setId);
  if (route.tab === "run") return evaluationRunPath(route.runId);
  if (route.tab === "all" && route.jobId) return jobPath(route.jobId);
  return null;
}

const PATH_LINK = "flex min-h-11 shrink-0 items-center";

function PathLink({
  href,
  description,
  isCurrent,
  className,
}: {
  href: string;
  description: string;
  isCurrent: boolean;
  className?: string;
}) {
  return (
    <Tooltip description={description}>
      {(describedBy) => (
        // The current entry keeps its href so it can still be copied or opened in a new tab.
        <AppLink
          href={href}
          aria-describedby={describedBy}
          aria-current={isCurrent ? "page" : undefined}
          className={cn(PATH_LINK, isCurrent && "font-bold no-underline", className)}
        >
          {href}
        </AppLink>
      )}
    </Tooltip>
  );
}

interface NavDockProps {
  route: AdminRoute;
  isLoggedIn: boolean;
}

export function NavDock({ route, isLoggedIn }: NavDockProps) {
  const subpath = currentSubpath(route);
  const activeTab = subpath === null ? NAV_TAB[route.tab] : null;

  return (
    <header className="border-b border-hairline">
      {/* Scrolls sideways only below sm, where tooltips are not hovered: any overflow value would clip them. */}
      <nav
        aria-label="Nawigacja główna"
        className="mx-auto flex max-w-frame items-center gap-x-6 overflow-x-auto whitespace-nowrap px-4 sm:overflow-x-visible sm:px-6 lg:px-8"
      >
        <AppLink href={PUBLIC_HOME_PATH} className={PATH_LINK}>
          {PUBLIC_HOME_PATH}
        </AppLink>
        {NAV_MODULES.flatMap((module) =>
          module.tabs.map((tab) => (
            <PathLink
              key={tab.tab}
              href={tab.href}
              description={`${module.label} · ${tab.label}. ${tab.description}`}
              isCurrent={tab.tab === activeTab}
            />
          )),
        )}
        {subpath ? (
          <AppLink
            href={subpath}
            aria-current="page"
            className={cn(PATH_LINK, "font-bold no-underline")}
          >
            {subpath}
          </AppLink>
        ) : null}
        <span aria-hidden="true" className="flex-1" />
        {import.meta.env.DEV ? (
          <PathLink
            href={DESIGN_PATH}
            description="Katalog systemu wizualnego: tokeny i prymitywy. Tylko w trybie deweloperskim."
            isCurrent={false}
            className="text-mute"
          />
        ) : null}
        {isLoggedIn ? (
          <span className="flex min-h-11 shrink-0 items-center">[✓] Zalogowano</span>
        ) : (
          <AppLink href={LOGIN_PATH} className={PATH_LINK}>
            Zaloguj
          </AppLink>
        )}
      </nav>
    </header>
  );
}
