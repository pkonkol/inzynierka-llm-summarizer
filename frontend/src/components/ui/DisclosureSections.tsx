import { useState } from "react";
import { DisclosureButton } from "./DisclosureButton";

export interface DisclosureSection {
  key: string;
  label: string;
  content: React.ReactNode;
}

// A row of toggles with one section open at a time. Content is a React element, so a section
// that fetches on mount does not fetch until it is opened. `trailing` shares the toggle row,
// for an action that belongs beside the sections.
export function DisclosureSections({
  sections,
  trailing,
}: {
  sections: DisclosureSection[];
  trailing?: React.ReactNode;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const open = sections.find((section) => section.key === openKey);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {sections.map((section) => (
          <DisclosureButton
            key={section.key}
            label={section.label}
            isOpen={section.key === openKey}
            onToggle={() => setOpenKey((current) => (current === section.key ? null : section.key))}
          />
        ))}
        {trailing}
      </div>

      {open ? <div className="min-w-0 border border-panel-border">{open.content}</div> : null}
    </>
  );
}
