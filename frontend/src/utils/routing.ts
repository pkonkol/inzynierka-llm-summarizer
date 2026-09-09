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

export const RESEARCH_IMPORT_PATH = "/research/import";
export const RESEARCH_SETS_PATH = "/research";

// Segments straight under /research that name a page. Without this list `/research/import` and
// `/research/runs` both read as an evaluation set id and open the set page against a bad id.
const RESERVED_RESEARCH_SEGMENTS = ["import", "runs"];

export function getEvaluationSetIdFromPath(pathname: string): string | null {
  const segment = pathname.match(/^\/research\/([^/]+)$/)?.[1];
  if (!segment || RESERVED_RESEARCH_SEGMENTS.includes(segment)) return null;
  return segment;
}

export function getRunIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/research\/runs\/([^/]+)$/);
  return match?.[1] ?? null;
}

export function getJobIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/jobs\/([^/]+)$/);
  return match?.[1] ?? null;
}
