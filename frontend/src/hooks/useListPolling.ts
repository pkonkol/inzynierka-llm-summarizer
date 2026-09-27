import { useEffect, useRef } from "react";

const ACTIVE_INTERVAL_MS = 2_000;
const IDLE_INTERVAL_MS = 15_000;

// Chained timeouts rather than an interval: a slow response must not let requests pile up.
// A hidden tab schedules nothing at all and refreshes once on the way back, so a list left
// open overnight costs nothing.
export function useListPolling(
  reload: () => Promise<void>,
  hasWorkInProgress: boolean,
  enabled = true,
) {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    if (!enabled) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    let isCancelled = false;

    const schedule = () => {
      if (isCancelled || document.hidden) return;
      timeoutId = setTimeout(
        () => void pollUntilCancelled(),
        hasWorkInProgress ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS,
      );
    };

    const pollUntilCancelled = async () => {
      await reloadRef.current();
      schedule();
    };

    const handleVisibilityChange = () => {
      clearTimeout(timeoutId);
      if (!document.hidden) void pollUntilCancelled();
    };

    schedule();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [hasWorkInProgress, enabled]);
}
