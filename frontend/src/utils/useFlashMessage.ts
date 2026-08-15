import { useCallback, useEffect, useState } from "react";

const AUTO_DISMISS_MS = 4500;

export type FlashTone = "success" | "danger";

export interface FlashMessage {
  text: string;
  tone: FlashTone;
}

export function useFlashMessage() {
  const [flash, setFlash] = useState<FlashMessage | null>(null);

  const showFlash = useCallback((text: string, tone: FlashTone = "success") => {
    setFlash({ text, tone });
  }, []);

  const dismissFlash = () => setFlash(null);

  // Failures stay until dismissed: a message explaining why a job died is worthless if it
  // disappears before it can be read.
  useEffect(() => {
    if (!flash || flash.tone === "danger") return;
    const timeoutId = setTimeout(() => setFlash(null), AUTO_DISMISS_MS);
    return () => clearTimeout(timeoutId);
  }, [flash]);

  return { flash, showFlash, dismissFlash };
}
