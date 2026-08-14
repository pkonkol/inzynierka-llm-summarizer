import { useState } from "react";

interface CollapsibleProps {
    label: string;
    children: React.ReactNode;
    open?: boolean;
    onToggle?: () => void;
}

export function Collapsible({ label, children, open: controlledOpen, onToggle }: CollapsibleProps) {
    const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : uncontrolledOpen;

    const handleToggle = () => {
        if (isControlled) {
            onToggle?.();
        } else {
            setUncontrolledOpen((value) => !value);
        }
    };

    return (
        <div className="border border-panel-border min-w-0">
            <button
                type="button"
                onClick={handleToggle}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-xs uppercase tracking-wider text-muted transition-colors hover:bg-subtle"
            >
                <span>{label}</span>
                <span>{open ? "▼" : "▶"}</span>
            </button>
            {open && (
                <div className="border-t border-panel-border min-w-0 overflow-hidden">
                    {children}
                </div>
            )}
        </div>
    );
}
