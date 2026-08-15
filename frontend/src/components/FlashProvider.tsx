import { createContext, useContext } from "react";

import { type FlashTone, useFlashMessage } from "../utils/useFlashMessage";
import { Toast } from "./ui/Toast";

type ShowFlash = (text: string, tone?: FlashTone) => void;

const FlashContext = createContext<ShowFlash | null>(null);

// One notification for the whole app: a single live region, and a message survives the
// navigation that produced it (deleting a set routes away from the page that reported it).
export function FlashProvider({ children }: { children: React.ReactNode }) {
  const { flash, showFlash, dismissFlash } = useFlashMessage();

  return (
    <FlashContext.Provider value={showFlash}>
      {children}
      <Toast flash={flash} onDismiss={dismissFlash} />
    </FlashContext.Provider>
  );
}

export function useFlash(): ShowFlash {
  const showFlash = useContext(FlashContext);
  if (!showFlash) {
    throw new Error("useFlash must be called inside FlashProvider");
  }
  return showFlash;
}
