import { useEffect, useRef, useState } from "react";

import { errorText } from "../api/client";

export interface FetchState<T> {
  data: T | null;
  isLoading: boolean;
  errorMessage: string | null;
}

// One request, keyed by the thing it fetches. Change `key` and the hook drops the old data,
// refetches, and ignores whatever the old request eventually answers.
export function useFetchOnMount<T>(
  fetcher: () => Promise<T>,
  key: string,
  errorPrefix: string,
): FetchState<T> {
  // One object, so no render can ever observe "loaded, no data, no error".
  const [state, setState] = useState<FetchState<T>>({
    data: null,
    isLoading: true,
    errorMessage: null,
  });

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` identifies the resource rather than being read in the body, so changing it must refetch.
  useEffect(() => {
    let isCurrent = true;
    setState({ data: null, isLoading: true, errorMessage: null });
    fetcherRef
      .current()
      .then((data) => {
        if (isCurrent) setState({ data, isLoading: false, errorMessage: null });
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setState({
            data: null,
            isLoading: false,
            errorMessage: `${errorPrefix}: ${errorText(error)}`,
          });
        }
      });
    return () => {
      isCurrent = false;
    };
  }, [key, errorPrefix]);

  return state;
}
