import { useEffect } from "react";

import { getKeepalive } from "../api/client";
import { logger } from "./logger";

const IDLE_RECHECK_MS = 30_000;
const FAILURE_RETRY_MS = 2_000;
const MAX_CONSECUTIVE_FAILURES = 5;
const HIDDEN_TAB_GRACE_MS = 45 * 60 * 1000;
const HIDDEN_TAB_RECHECK_MS = 60_000;

/**
 * Holds a connection open against the backend for as long as it reports background work.
 *
 * Cloud Run may reclaim an instance that has no request in flight, which would kill work that
 * runs after its response was already sent. `/api/v1/meta/keepalive` holds for up to 55s while
 * this instance has work and answers immediately when it has none, so the one endpoint both
 * keeps the instance alive and reports whether anything is running. The backend counts its own
 * tasks, so it is the only thing asked.
 *
 * While work is running the loop issues its next call from the previous one's resolution and
 * uses no timer at all — browsers throttle `setTimeout` in a background tab down to once a
 * minute, but leave an in-flight request alone. The timers below are for the paths where being
 * slow is the point.
 *
 * A hidden tab keeps holding for HIDDEN_TAB_GRACE_MS, then idles until it is looked at again, so
 * stepping away does not kill a run while a tab left overnight stops holding an instance.
 */
export function useBackgroundWorkKeepalive() {
  useEffect(() => {
    const abortController = new AbortController();

    const pause = (milliseconds: number) =>
      new Promise<void>((resolve) => {
        const stopWaiting = () => {
          clearTimeout(timeoutId);
          abortController.signal.removeEventListener("abort", stopWaiting);
          resolve();
        };
        const timeoutId = setTimeout(stopWaiting, milliseconds);
        abortController.signal.addEventListener("abort", stopWaiting);
      });

    const holdConnectionWhileWorkRuns = async () => {
      let hiddenSince: number | null = null;
      let consecutiveFailures = 0;

      while (!abortController.signal.aborted) {
        hiddenSince = document.hidden ? (hiddenSince ?? Date.now()) : null;
        if (hiddenSince !== null && Date.now() - hiddenSince >= HIDDEN_TAB_GRACE_MS) {
          await pause(HIDDEN_TAB_RECHECK_MS);
          continue;
        }

        try {
          const { active_work } = await getKeepalive(abortController.signal);
          consecutiveFailures = 0;
          logger.debug("keepalive released", { active_work });
          if (active_work === 0) await pause(IDLE_RECHECK_MS);
        } catch (error) {
          if (abortController.signal.aborted) break;
          consecutiveFailures += 1;
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            logger.warn("keepalive chain gave up", { error });
            break;
          }
          await pause(FAILURE_RETRY_MS);
        }
      }
    };

    void holdConnectionWhileWorkRuns();
    return () => abortController.abort();
  }, []);
}
