import { cn } from "../ui/cn";

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
  const selected = options.find((option) => option.key === selectedKey);
  if (!selected) throw new Error(`summary kind "${selectedKey}" is not among the options`);

  return (
    <fieldset className="grid gap-2" disabled={disabled}>
      <legend className="sr-only">Rodzaj podsumowania</legend>
      <div className="grid grid-cols-2 gap-px border border-panel-border bg-panel-border sm:grid-cols-4">
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
                  "flex w-full items-center justify-center gap-2 px-2 py-2 text-center text-sm font-semibold transition-colors peer-focus-visible:outline-2 peer-focus-visible:-outline-offset-2 peer-focus-visible:outline-ink",
                  isActive
                    ? "bg-ink text-panel-solid"
                    : "bg-panel-solid text-ink hover:bg-subtle-hover",
                )}
              >
                <span aria-hidden="true">{isActive ? "●" : "○"}</span>
                {option.label}
              </span>
            </label>
          );
        })}
      </div>
      <p>{selected.description}</p>
      <p className="text-sm text-muted">Przykład: „{selected.example}”</p>
    </fieldset>
  );
}
