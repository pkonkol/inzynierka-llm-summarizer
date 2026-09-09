import type { FlashMessage } from "../../utils/useFlashMessage";
import { Collapsible } from "../Collapsible";
import { PreBlock } from "../PreBlock";
import { Alert } from "./Alert";
import { Button } from "./Button";
import { LinkButton } from "./LinkButton";

const SUMMARY_LIMIT = 140;

// Provider failures arrive as a whole serialised error object. The first sentence is the part
// a human reads; the rest is kept, just not on screen by default.
function splitMessage(text: string): { summary: string; details: string | null } {
  if (text.length <= SUMMARY_LIMIT) return { summary: text, details: null };

  const sentenceEnd = text.indexOf(". ");
  const cut = sentenceEnd > 0 && sentenceEnd < SUMMARY_LIMIT ? sentenceEnd + 1 : SUMMARY_LIMIT;
  return { summary: `${text.slice(0, cut).trimEnd()}…`, details: text.slice(cut).trim() };
}

// Colour alone would leave the tone invisible in greyscale, and to a reader who is only
// glancing at the corner.
const TONE_GLYPH = { success: "✓", danger: "✗" } as const;

interface ToastProps {
  flash: FlashMessage | null;
  onDismiss: () => void;
}

export function Toast({ flash, onDismiss }: ToastProps) {
  const message = flash ? splitMessage(flash.text) : null;

  const details = message?.details ? (
    <Collapsible label="Szczegóły techniczne">
      <PreBlock className="max-h-64 overflow-y-auto">{message.details}</PreBlock>
    </Collapsible>
  ) : null;

  const notification =
    flash && message ? (
      <Alert
        tone={flash.tone}
        className="pointer-events-auto grid w-full max-w-md gap-3 border-2 p-4 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="flex items-baseline gap-2 font-semibold">
            <span aria-hidden="true" className="text-lg leading-none">
              {TONE_GLYPH[flash.tone]}
            </span>
            {message.summary}
          </p>
          <Button size="xs" onClick={onDismiss} aria-label="Zamknij powiadomienie">
            ✕
          </Button>
        </div>
        {details}
        {flash.action ? (
          <LinkButton href={flash.action.href} size="lg" className="w-full" onClick={onDismiss}>
            {flash.action.label}
          </LinkButton>
        ) : null}
      </Alert>
    ) : null;

  // The region is always mounted: a live region only announces what is inserted after it exists.
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 top-below-nav-stacked z-50 flex justify-start sm:inset-x-auto sm:left-4 sm:top-below-nav"
    >
      {notification}
    </div>
  );
}
