import { useCallback, useEffect, useState } from "react";

const AUTO_DISMISS_MS = 7500;
const ACTIONABLE_AUTO_DISMISS_MS = 15_000;

export type FlashTone = "success" | "danger";

export interface FlashAction {
  label: string;
  href: string;
}

export interface FlashMessage {
  text: string;
  tone: FlashTone;
  action?: FlashAction;
}

export function useFlashMessage() {
  const [flash, setFlash] = useState<FlashMessage | null>(null);

  const showFlash = useCallback(
    (text: string, tone: FlashTone = "success", action?: FlashAction) => {
      setFlash({ text, tone, action });
    },
    [],
  );

  const dismissFlash = () => setFlash(null);

  // Failures stay until dismissed: a message explaining why a job died is worthless if it
  // disappears before it can be read.
  useEffect(() => {
    if (!flash || flash.tone === "danger") return;
    const timeoutId = setTimeout(
      () => setFlash(null),
      flash.action ? ACTIONABLE_AUTO_DISMISS_MS : AUTO_DISMISS_MS,
    );
    return () => clearTimeout(timeoutId);
  }, [flash]);

  return { flash, showFlash, dismissFlash };
}
