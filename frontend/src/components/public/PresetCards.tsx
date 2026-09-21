import { cn } from "../ui/cn";

interface PresetCardOption {
  key: string;
  label: string;
  description: string;
}

interface PresetCardsProps {
  options: PresetCardOption[];
  selectedKey: string;
  onSelect: (key: string) => void;
  disabled: boolean;
}

// Native radios keep the arrow-key behaviour of a group for free; the visible card is the label.
export function PresetCards({ options, selectedKey, onSelect, disabled }: PresetCardsProps) {
  return (
    <fieldset className="grid gap-2" disabled={disabled}>
      <legend className="mb-2 font-semibold text-muted">Rodzaj podsumowania</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <label key={option.key} className="block cursor-pointer has-disabled:cursor-not-allowed">
            <input
              type="radio"
              name="summary-preset"
              value={option.key}
              checked={option.key === selectedKey}
              onChange={() => onSelect(option.key)}
              className="peer sr-only"
            />
            <span
              className={cn(
                "grid h-full gap-1 border p-3 transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink",
                option.key === selectedKey
                  ? "border-selected-border bg-selected-bg"
                  : "border-panel-border bg-panel-solid hover:bg-subtle-hover",
              )}
            >
              <span className="flex items-baseline gap-2 font-semibold">
                <span aria-hidden="true">{option.key === selectedKey ? "●" : "○"}</span>
                {option.label}
              </span>
              <span className="text-sm text-muted">{option.description}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
