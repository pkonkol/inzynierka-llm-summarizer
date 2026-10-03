import type { ReactNode } from "react";
import { useEffect, useId, useState } from "react";

interface TooltipProps {
  description: string;
  /** Receives the bubble's id, which the trigger must carry as `aria-describedby`. */
  children: (describedBy: string) => ReactNode;
}

// Opens on hover and on keyboard focus, and Escape hides it without moving focus (WCAG 1.4.13).
// `:focus-visible` skips a mouse click, so a clicked link leaves no bubble hanging.
export function Tooltip({ description, children }: TooltipProps) {
  const describedBy = useId();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the wrapper only tracks hover; the trigger inside is the focusable element
    <span
      className="relative inline-flex"
      onPointerEnter={() => setIsOpen(true)}
      onPointerLeave={() => setIsOpen(false)}
      onFocus={(event) => setIsOpen(event.target.matches(":focus-visible"))}
      onBlur={() => setIsOpen(false)}
    >
      {children(describedBy)}
      <span
        id={describedBy}
        role="tooltip"
        className={`pointer-events-none absolute top-full left-0 z-50 w-64 max-w-[calc(100vw-2rem)] translate-y-1 border border-hairline-strong bg-canvas p-3 text-left font-normal text-caption text-body normal-case whitespace-normal ${isOpen ? "block" : "hidden"}`}
      >
        {description}
      </span>
    </span>
  );
}

// The `[?]` trigger that replaces a `title=` hint next to a field label.
export function HelpTip({ description }: { description: string }) {
  return (
    <Tooltip description={description}>
      {(describedBy) => (
        <button
          type="button"
          aria-describedby={describedBy}
          aria-label="Wyjaśnienie"
          className="inline-flex min-h-6 min-w-6 cursor-help items-center justify-center font-normal text-mute"
        >
          [?]
        </button>
      )}
    </Tooltip>
  );
}
