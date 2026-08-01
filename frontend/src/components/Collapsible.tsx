import { useState } from "react";

interface CollapsibleProps {
    label: string;
    children: React.ReactNode;
}

export function Collapsible({ label, children }: CollapsibleProps) {
    const [open, setOpen] = useState(false);

    return (
        <div className="border border-panel-border min-w-0">
            <button
                type="button"
                onClick={() => setOpen(value => !value)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-[0.75rem] uppercase tracking-wider text-muted transition-colors hover:bg-subtle"
            >
                <span>{label}</span>
                <span>{open ? "▼" : "▶"}</span>
            </button>
            {open && <div className="border-t border-panel-border min-w-0 overflow-hidden">{children}</div>}
        </div>
    );
}
