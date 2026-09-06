import { useCallback, useRef, useState } from "react";

import { errorText } from "../api/client";
import { useFlash } from "../components/FlashProvider";

interface AsyncActionOptions<Args extends unknown[], Result> {
  /** "Nie udało się usunąć runa" — the colon and errorText(error) are appended here. */
  errorPrefix: string;
  successMessage?: (result: Result, ...args: Args) => string;
  /** Follow-up that belongs inside the pending window: a list reload, a navigation. */
  onSuccess?: (result: Result, ...args: Args) => void | Promise<void>;
  /** Success leaves the page, so the button must stay pending instead of flashing back. */
  keepPendingOnSuccess?: boolean;
}

// The five-part shape every button here repeats: flag on, try, success flash, "Nie udało się …",
// flag off. A failure MUST reach the reader — two handlers on JobsPage had no catch at all, so a
// failed delete was indistinguishable from a successful one.
export function useAsyncAction<Args extends unknown[], Result>(
  action: (...args: Args) => Promise<Result>,
  options: AsyncActionOptions<Args, Result>,
): { run: (...args: Args) => Promise<void>; isPending: boolean } {
  const [isPending, setIsPending] = useState(false);
  const showFlash = useFlash();

  // Call sites pass inline closures over fresh render state; refs keep `run` identity stable
  // without asking anyone to memoize — the same trick useListPolling uses for its reload.
  const actionRef = useRef(action);
  actionRef.current = action;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const run = useCallback(
    async (...args: Args) => {
      const { errorPrefix, successMessage, onSuccess, keepPendingOnSuccess } = optionsRef.current;
      setIsPending(true);
      try {
        const result = await actionRef.current(...args);
        if (successMessage) showFlash(successMessage(result, ...args));
        await onSuccess?.(result, ...args);
        if (!keepPendingOnSuccess) setIsPending(false);
      } catch (error) {
        showFlash(`${errorPrefix}: ${errorText(error)}`, "danger");
        setIsPending(false);
      }
    },
    [showFlash],
  );

  return { run, isPending };
}
