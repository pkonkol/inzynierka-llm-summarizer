import { useCallback, useRef, useState } from "react";

import { errorText, getJobStatus } from "../api/client";
import { useFlash } from "../components/FlashProvider";
import type { JobStatusResponse } from "../types/api.generated";
import { useListPolling } from "./useListPolling";

// Watches the one job the reader just created until it settles, on the same schedule and the same
// hidden-tab rules as every list on the site. The hook owns the id: every exit path stops the
// watch, so a poll can never outlive the job it was following.
export function useJobCompletionWatch(onCompleted: (status: JobStatusResponse) => void) {
  const [watchedJobId, setWatchedJobId] = useState<string | null>(null);
  const showFlash = useFlash();

  const onCompletedRef = useRef(onCompleted);
  onCompletedRef.current = onCompleted;
  const watchedJobIdRef = useRef<string | null>(null);
  watchedJobIdRef.current = watchedJobId;

  const poll = useCallback(async () => {
    const jobId = watchedJobIdRef.current;
    if (!jobId) return;
    try {
      const status = await getJobStatus(jobId);
      // A second job created while this request was open owns the watch now.
      if (watchedJobIdRef.current !== jobId) return;
      if (status.status === "completed") {
        showFlash("Podsumowanie gotowe.");
        setWatchedJobId(null);
        onCompletedRef.current(status);
      } else if (status.status === "failed") {
        showFlash(`Job zakończył się błędem: ${status.error ?? "nieznany błąd"}`, "danger");
        setWatchedJobId(null);
      }
    } catch (error) {
      if (watchedJobIdRef.current !== jobId) return;
      showFlash(`Nie udało się odczytać statusu joba: ${errorText(error)}`, "danger");
      setWatchedJobId(null);
    }
  }, [showFlash]);

  useListPolling(poll, true, watchedJobId !== null);

  const watchJob = useCallback((jobId: string) => setWatchedJobId(jobId), []);
  return { watchJob };
}
