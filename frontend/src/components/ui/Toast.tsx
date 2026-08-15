import type { FlashMessage } from "../../utils/useFlashMessage";
import { Collapsible } from "../Collapsible";
import { Button } from "./Button";
import { cn } from "./cn";

const TONE = {
  success: "border-success-border bg-success-bg text-success",
  danger: "border-danger-border bg-danger-bg text-danger",
} as const;

const SUMMARY_LIMIT = 140;

// Provider failures arrive as a whole serialised error object. The first sentence is the part
// a human reads; the rest is kept, just not on screen by default.
function splitMessage(text: string): { summary: string; rest: string | null } {
  if (text.length <= SUMMARY_LIMIT) return { summary: text, rest: null };

  const sentenceEnd = text.indexOf(". ");
  const cut = sentenceEnd > 0 && sentenceEnd < SUMMARY_LIMIT ? sentenceEnd + 1 : SUMMARY_LIMIT;
  return { summary: `${text.slice(0, cut).trimEnd()}…`, rest: text };
}

interface ToastProps {
  flash: FlashMessage | null;
  onDismiss: () => void;
}

export function Toast({ flash, onDismiss }: ToastProps) {
  // The region is always mounted: a live region only announces what is inserted after it exists.
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-40 flex justify-end sm:inset-x-auto sm:right-4"
    >
      {flash ? <ToastBody flash={flash} onDismiss={onDismiss} /> : null}
    </div>
  );
}

function ToastBody({ flash, onDismiss }: { flash: FlashMessage; onDismiss: () => void }) {
  const { summary, rest } = splitMessage(flash.text);

  return (
    <div
      className={cn(
        "pointer-events-auto grid w-full max-w-sm gap-2 border p-3 text-base shadow-lg",
        TONE[flash.tone],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p>{summary}</p>
        <Button size="xs" onClick={onDismiss} aria-label="Zamknij powiadomienie">
          ✕
        </Button>
      </div>
      {rest ? (
        <Collapsible label="Szczegóły techniczne">
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap wrap-break-word p-3 text-2xs leading-normal">
            {rest}
          </pre>
        </Collapsible>
      ) : null}
    </div>
  );
}
