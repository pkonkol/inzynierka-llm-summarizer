import type { FlashMessage } from "../../utils/useFlashMessage";
import { Collapsible } from "../Collapsible";
import { PreBlock } from "../PreBlock";
import { Alert } from "./Alert";
import { Button } from "./Button";

const SUMMARY_LIMIT = 140;

// Provider failures arrive as a whole serialised error object. The first sentence is the part
// a human reads; the rest is kept, just not on screen by default.
function splitMessage(text: string): { summary: string; details: string | null } {
  if (text.length <= SUMMARY_LIMIT) return { summary: text, details: null };

  const sentenceEnd = text.indexOf(". ");
  const cut = sentenceEnd > 0 && sentenceEnd < SUMMARY_LIMIT ? sentenceEnd + 1 : SUMMARY_LIMIT;
  return { summary: `${text.slice(0, cut).trimEnd()}…`, details: text.slice(cut).trim() };
}

interface ToastProps {
  flash: FlashMessage | null;
  onDismiss: () => void;
}

export function Toast({ flash, onDismiss }: ToastProps) {
  const message = flash ? splitMessage(flash.text) : null;

  // The region is always mounted: a live region only announces what is inserted after it exists.
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-40 flex justify-end sm:inset-x-auto sm:right-4"
    >
      {flash && message ? (
        <Alert
          tone={flash.tone}
          className="pointer-events-auto grid w-full max-w-sm gap-2 shadow-lg"
        >
          <div className="flex items-start justify-between gap-3">
            <p>{message.summary}</p>
            <Button size="xs" onClick={onDismiss} aria-label="Zamknij powiadomienie">
              ✕
            </Button>
          </div>
          {message.details ? (
            <Collapsible label="Szczegóły techniczne">
              <PreBlock className="max-h-64 overflow-y-auto text-2xs">{message.details}</PreBlock>
            </Collapsible>
          ) : null}
        </Alert>
      ) : null}
    </div>
  );
}
