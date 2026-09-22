export function navigateTo(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

// Replaces the current history entry, so Back does not return to a page that only redirects.
export function redirectTo(path: string) {
  window.history.replaceState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

// A modifier click means the visitor asked the browser for something we cannot do here —
// a new tab, a new window, a download — so it has to fall through untouched.
export function shouldInterceptClick(event: React.MouseEvent): boolean {
  return (
    !event.defaultPrevented && !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
  );
}

const ADMIN_PREFIX = "/admin";

export const PUBLIC_HOME_PATH = "/";
export const LOGIN_PATH = "/login";
export const SUMMARIES_NEW_PATH = ADMIN_PREFIX;
export const SUMMARIES_ALL_PATH = `${ADMIN_PREFIX}/jobs`;
export const EVALUATION_SETS_PATH = `${ADMIN_PREFIX}/research`;
export const EVALUATION_IMPORT_PATH = `${EVALUATION_SETS_PATH}/import`;

export const jobPath = (jobId: string) => `${SUMMARIES_ALL_PATH}/${jobId}`;
export const evaluationSetPath = (setId: string) => `${EVALUATION_SETS_PATH}/${setId}`;
export const evaluationRunPath = (runId: string) => `${EVALUATION_SETS_PATH}/runs/${runId}`;

const JOB_PATTERN = new RegExp(`^${SUMMARIES_ALL_PATH}/([^/]+)$`);
const EVALUATION_RUN_PATTERN = new RegExp(`^${EVALUATION_SETS_PATH}/runs/([^/]+)$`);
const EVALUATION_SET_PATTERN = new RegExp(`^${EVALUATION_SETS_PATH}/([^/]+)$`);

/** `tab` is what the navigation bar highlights; the rest is what the page needs to render. */
export type AdminRoute =
  | { tab: "new" }
  | { tab: "all"; jobId: string | null }
  | { tab: "import" }
  | { tab: "sets" }
  | { tab: "set"; setId: string }
  | { tab: "run"; runId: string };

export type Route = AdminRoute | { tab: "public" } | { tab: "login" };

export function isAdminRoute(route: Route): route is AdminRoute {
  return route.tab !== "public" && route.tab !== "login";
}

function isAdminPath(pathname: string): boolean {
  return pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`);
}

/**
 * The one place that knows the URL shape: the page dispatcher and the navigation bar both read
 * their answer from here, so a path can never light one tab while rendering another page.
 * Static paths are matched before the id-shaped ones, which is what keeps `/admin/research/import`
 * from reading as an evaluation set called "import". Every path outside `/admin` is the public
 * page, which is also what makes the host's catch-all rewrite land somewhere sensible.
 */
export function matchRoute(pathname: string): Route {
  if (pathname === LOGIN_PATH) return { tab: "login" };
  if (!isAdminPath(pathname)) return { tab: "public" };

  if (pathname === EVALUATION_IMPORT_PATH) return { tab: "import" };

  if (pathname.startsWith(`${EVALUATION_SETS_PATH}/runs`)) {
    const runId = pathname.match(EVALUATION_RUN_PATTERN)?.[1];
    return runId ? { tab: "run", runId } : { tab: "sets" };
  }

  if (pathname.startsWith(EVALUATION_SETS_PATH)) {
    const setId = pathname.match(EVALUATION_SET_PATTERN)?.[1];
    return setId ? { tab: "set", setId } : { tab: "sets" };
  }

  if (pathname.startsWith(SUMMARIES_ALL_PATH)) {
    return { tab: "all", jobId: pathname.match(JOB_PATTERN)?.[1] ?? null };
  }

  return { tab: "new" };
}
