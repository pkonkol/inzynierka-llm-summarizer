import { useState } from "react";

import { DisclosureButton } from "./DisclosureButton";

interface CollapsibleProps {
  label: string;
  children: React.ReactNode;
}

export function Collapsible({ label, children }: CollapsibleProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="grid min-w-0 border-b border-hairline">
      <DisclosureButton
        label={label}
        isOpen={open}
        onToggle={() => setOpen((value) => !value)}
        className="w-full"
      />
      {open && <div className="min-w-0 overflow-clip pb-3">{children}</div>}
    </div>
  );
}
