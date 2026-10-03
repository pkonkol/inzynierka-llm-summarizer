import type { FlashMessage } from "../../hooks/useFlashMessage";
import { Collapsible } from "./Collapsible";
import { LinkButton } from "./LinkButton";
import { PreBlock } from "./PreBlock";

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
const TONE_GLYPH = {
  success: { glyph: "[✓]", className: "text-success" },
  danger: { glyph: "[✗]", className: "text-danger" },
} as const;

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
      <div className="pointer-events-auto grid w-full max-w-md gap-3 rounded-sm bg-surface-dark px-4 py-3 text-caption text-on-dark">
        <div className="flex items-start justify-between gap-3">
          <p className="flex items-baseline gap-2">
            <span aria-hidden="true" className={TONE_GLYPH[flash.tone].className}>
              {TONE_GLYPH[flash.tone].glyph}
            </span>
            {message.summary}
          </p>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Zamknij powiadomienie"
            className="inline-flex min-h-6 min-w-6 shrink-0 cursor-pointer items-center justify-center text-on-dark-mute"
          >
            ✕
          </button>
        </div>
        {details}
        {flash.action ? (
          <LinkButton href={flash.action.href} className="w-full" onClick={onDismiss}>
            {flash.action.label}
          </LinkButton>
        ) : null}
      </div>
    ) : null;

  // The region is always mounted: a live region only announces what is inserted after it exists.
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-end sm:inset-x-auto sm:right-4"
    >
      {notification}
    </div>
  );
}
