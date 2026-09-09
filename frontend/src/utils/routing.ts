export function navigateTo(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

// A modifier click means the visitor asked the browser for something we cannot do here —
// a new tab, a new window, a download — so it has to fall through untouched.
export function shouldInterceptClick(event: React.MouseEvent): boolean {
  return (
    !event.defaultPrevented && !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
  );
}

export const SUMMARIES_NEW_PATH = "/";
export const SUMMARIES_ALL_PATH = "/jobs";
export const EVALUATION_IMPORT_PATH = "/research/import";
export const EVALUATION_SETS_PATH = "/research";

export const jobPath = (jobId: string) => `${SUMMARIES_ALL_PATH}/${jobId}`;
export const evaluationSetPath = (setId: string) => `${EVALUATION_SETS_PATH}/${setId}`;
export const evaluationRunPath = (runId: string) => `${EVALUATION_SETS_PATH}/runs/${runId}`;

/** `tab` is what the navigation bar highlights; the rest is what the page needs to render. */
export type Route =
  | { tab: "new" }
  | { tab: "all"; jobId: string | null }
  | { tab: "import" }
  | { tab: "sets" }
  | { tab: "set"; setId: string }
  | { tab: "run"; runId: string };

/**
 * The one place that knows the URL shape: the page dispatcher and the navigation bar both read
 * their answer from here, so a path can never light one tab while rendering another page.
 * Static paths are matched before the id-shaped ones, which is what keeps `/research/import`
 * from reading as an evaluation set called "import".
 */
export function matchRoute(pathname: string): Route {
  if (pathname === EVALUATION_IMPORT_PATH) return { tab: "import" };

  if (pathname.startsWith(`${EVALUATION_SETS_PATH}/runs`)) {
    const runId = pathname.match(/^\/research\/runs\/([^/]+)$/)?.[1];
    return runId ? { tab: "run", runId } : { tab: "sets" };
  }

  if (pathname.startsWith(EVALUATION_SETS_PATH)) {
    const setId = pathname.match(/^\/research\/([^/]+)$/)?.[1];
    return setId ? { tab: "set", setId } : { tab: "sets" };
  }

  if (pathname.startsWith(SUMMARIES_ALL_PATH)) {
    return { tab: "all", jobId: pathname.match(/^\/jobs\/([^/]+)$/)?.[1] ?? null };
  }

  return { tab: "new" };
}
