import { useCallback, useEffect, useRef, useState } from "react";

import { errorText } from "../api/client";

export interface ReloadableResource<T> {
  data: T | null;
  /** True only until the first answer for the current key. A poll tick never sets it, so the
      page cannot fall back to "Ładowanie..." every two seconds. */
  isInitialLoading: boolean;
  errorMessage: string | null;
  /** Stable identity: safe to hand to useListPolling or a refresh button. */
  reload: () => Promise<void>;
}

// A list or a detail document that one page owns: loads on mount, reloads on demand, and carries
// its own error. Its own — two resources on one page had shared a single errorMessage, so
// whichever request failed last decided what the reader was told.
export function useReloadableResource<T>(
  load: () => Promise<T>,
  key: string,
  errorPrefix: string,
): ReloadableResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadRef = useRef(load);
  loadRef.current = load;

  // Every request takes a number and only the newest may write. Covers both a response for a
  // route the reader has already left and a slow poll overtaken by a faster one.
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      const result = await loadRef.current();
      if (requestId !== requestIdRef.current) return;
      setData(result);
      setErrorMessage(null);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      // Previous data stays on screen: a failed refresh is no reason to blank a working page.
      setErrorMessage(`${errorPrefix}: ${errorText(error)}`);
    } finally {
      if (requestId === requestIdRef.current) setIsInitialLoading(false);
    }
  }, [errorPrefix]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` identifies the resource rather than being read in the body, so changing it must refetch.
  useEffect(() => {
    setData(null);
    setIsInitialLoading(true);
    setErrorMessage(null);
    void reload();
  }, [key, reload]);

  return { data, isInitialLoading, errorMessage, reload };
}
