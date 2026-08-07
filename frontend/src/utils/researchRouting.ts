export function navigateTo(path: string) {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
}

export function getEvaluationSetIdFromPath(pathname: string): string | null {
    const match = pathname.match(/^\/research\/([^/]+)$/);
    return match?.[1] ?? null;
}

export function getRunIdFromPath(pathname: string): string | null {
    const match = pathname.match(/^\/research\/runs\/([^/]+)$/);
    return match?.[1] ?? null;
}
