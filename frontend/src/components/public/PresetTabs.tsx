import { useState } from "react";

import { cn } from "../ui/cn";
import { DisclosureButton } from "../ui/DisclosureButton";

interface PresetTabOption {
  key: string;
  label: string;
  description: string;
  example: string;
}

interface PresetTabsProps {
  options: PresetTabOption[];
  selectedKey: string;
  onSelect: (key: string) => void;
  disabled: boolean;
}

// Native radios keep the arrow-key behaviour of a group for free; the visible tab is the label.
// Only the chosen kind is explained, which is what leaves the panel's height to the text field.
export function PresetTabs({ options, selectedKey, onSelect, disabled }: PresetTabsProps) {
  const [isExampleOpen, setIsExampleOpen] = useState(false);
  const selected = options.find((option) => option.key === selectedKey);
  if (!selected) throw new Error(`summary kind "${selectedKey}" is not among the options`);

  return (
    <fieldset className="grid min-w-0 gap-3" disabled={disabled}>
      <legend className="sr-only">Rodzaj podsumowania</legend>
      <div className="grid grid-cols-2 gap-x-2 border-b border-hairline-strong sm:gap-x-4">
        {options.map((option) => {
          const isActive = option.key === selectedKey;
          return (
            <label key={option.key} className="flex cursor-pointer has-disabled:cursor-not-allowed">
              <input
                type="radio"
                name="summary-kind"
                value={option.key}
                checked={isActive}
                onChange={() => onSelect(option.key)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "flex min-h-11 w-full items-start gap-2 border-b-2 px-2 py-2 text-button font-medium peer-focus-visible:outline-2 peer-focus-visible:outline-ink",
                  isActive ? "border-ash text-ink" : "border-transparent text-mute",
                )}
              >
                <span aria-hidden="true" className="shrink-0 whitespace-pre">
                  {isActive ? "[x]" : "[ ]"}
                </span>
                {option.label}
              </span>
            </label>
          );
        })}
      </div>
      <p>{selected.description}</p>
      <div className="grid gap-2">
        <DisclosureButton
          label="przykład"
          isOpen={isExampleOpen}
          onToggle={() => setIsExampleOpen((value) => !value)}
          className="text-caption text-mute"
        />
        {isExampleOpen ? (
          <p className="rounded-sm bg-surface-card px-4 py-3 text-caption">
            Przykład: „{selected.example}”
          </p>
        ) : null}
      </div>
    </fieldset>
  );
}
