import { useState } from "react";

interface CollapsibleProps {
  label: string;
  children: React.ReactNode;
}

export function Collapsible({ label, children }: CollapsibleProps) {
  const [open, setOpen] = useState(false);
  const handleToggle = () => setOpen((value) => !value);

  return (
    <div className="border border-panel-border min-w-0">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between bg-subtle px-3 py-2 text-left text-xs uppercase tracking-wider text-muted transition-colors hover:bg-subtle-hover"
      >
        <span>{label}</span>
        <span aria-hidden="true">{open ? "▼" : "▶"}</span>
      </button>
      {open && <div className="border-t border-panel-border min-w-0 overflow-clip">{children}</div>}
    </div>
  );
}
