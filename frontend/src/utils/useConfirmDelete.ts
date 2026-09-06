import { useCallback, useState } from "react";

import type { ConfirmDialogProps } from "../components/ConfirmDialog";
import { useAsyncAction } from "./useAsyncAction";

interface ConfirmDeleteOptions<T> {
  title: string;
  /** Only ever called with a target, so there is no message to invent for a closed dialog. */
  message: (target: T) => string;
  onConfirm: (target: T) => Promise<void>;
  errorPrefix: string;
  successMessage?: (target: T) => string;
  /** Reload the list, drop a selection — runs after the flash, before the button re-enables. */
  afterConfirm?: (target: T) => void | Promise<void>;
  /** Success navigates away: keep the dialog and its spinner as they are. */
  keepOpenOnSuccess?: boolean;
}

// T must not be a function type — setState would treat it as a functional update. Every target
// here is an object or a string.
export function useConfirmDelete<T>(options: ConfirmDeleteOptions<T>): {
  request: (target: T) => void;
  dialogProps: ConfirmDialogProps | null;
} {
  const [target, setTarget] = useState<T | null>(null);
  const { successMessage, afterConfirm, keepOpenOnSuccess } = options;

  const { run, isPending } = useAsyncAction(options.onConfirm, {
    errorPrefix: options.errorPrefix,
    successMessage: successMessage ? (_result, confirmed) => successMessage(confirmed) : undefined,
    onSuccess: async (_result, confirmed) => {
      if (!keepOpenOnSuccess) setTarget(null);
      await afterConfirm?.(confirmed);
    },
    keepPendingOnSuccess: keepOpenOnSuccess,
  });

  const request = useCallback((next: T) => setTarget(next), []);

  return {
    request,
    dialogProps:
      target === null
        ? null
        : {
            isOpen: true,
            title: options.title,
            message: options.message(target),
            isConfirming: isPending,
            onConfirm: () => void run(target),
            // Escape and the backdrop bypass the disabled buttons; a delete in flight owns
            // the dialog until it answers.
            onClose: () => {
              if (!isPending) setTarget(null);
            },
          },
  };
}
