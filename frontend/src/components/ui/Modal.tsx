import { useEffect, useId, useRef } from "react";

import { Panel } from "./Panel";

interface ModalProps {
  isOpen: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onSubmit?: React.FormEventHandler;
}

export function Modal({ isOpen, title, children, onClose, onSubmit }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Focus the dialog itself, not its first control: a screen reader then reads the title
    // before the field, and Tab from here walks the dialog in DOM order.
    dialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: mouse-only shortcut; Escape closes the dialog from the keyboard
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <Panel
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        padding="xl"
        className="grid w-full max-w-sm gap-6 focus:outline-none"
      >
        <h2 id={titleId} className="font-mono text-2xl">
          {title}
        </h2>
        {onSubmit ? (
          <form onSubmit={onSubmit} className="grid gap-4">
            {children}
          </form>
        ) : (
          <div className="grid gap-4">{children}</div>
        )}
      </Panel>
    </div>
  );
}
