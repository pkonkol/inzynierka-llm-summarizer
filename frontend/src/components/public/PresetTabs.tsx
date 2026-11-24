import { cn } from "../ui/cn";

interface PresetTabOption {
  key: string;
  label: string;
  description: string;
}

interface PresetTabsProps {
  options: PresetTabOption[];
  selectedKey: string;
  onSelect: (key: string) => void;
  disabled: boolean;
}

// Native radios keep the arrow-key behaviour of a group for free; the visible tab is the label.
export function PresetTabs({ options, selectedKey, onSelect, disabled }: PresetTabsProps) {
  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className="sr-only">Rodzaj podsumowania</legend>
      <div className="flex overflow-x-auto border-b border-hairline-strong">
        {options.map((option) => {
          const isActive = option.key === selectedKey;
          return (
            <label
              key={option.key}
              title={option.description}
              className="flex cursor-pointer has-disabled:cursor-not-allowed"
            >
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
                  "flex min-h-11 items-center whitespace-nowrap border-b-2 px-2 text-caption font-medium peer-focus-visible:outline-2 peer-focus-visible:outline-ink",
                  isActive ? "border-ash text-ink" : "border-transparent text-mute",
                )}
              >
                {option.label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
