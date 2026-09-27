import { useEffect, useRef } from "react";

// Fires once when polled background work leaves pending/running — the moment a page announces the
// outcome and reloads whatever the work wrote. The first answer never fires, so opening a page on
// work that has already finished stays quiet.
export function useWorkFinished<Status>(
  status: Status | null,
  isInProgress: boolean,
  onFinished: (status: Status) => void,
) {
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;
  const wasInProgressRef = useRef(false);

  useEffect(() => {
    const wasInProgress = wasInProgressRef.current;
    wasInProgressRef.current = isInProgress;
    if (wasInProgress && !isInProgress && status !== null) onFinishedRef.current(status);
  }, [status, isInProgress]);
}
