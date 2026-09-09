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

export function getEvaluationSetIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/research\/([^/]+)$/);
  return match?.[1] ?? null;
}

export function getRunIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/research\/runs\/([^/]+)$/);
  return match?.[1] ?? null;
}

export function getJobIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/jobs\/([^/]+)$/);
  return match?.[1] ?? null;
}
