import { cn } from "../ui/cn";

/** undefined: not answered yet; null: the author marked the atom unclear, which leaves it out of TPR/TNR. */
export type Choice = boolean | null | undefined;

const OPTIONS: { value: boolean | null; label: string }[] = [
  { value: true, label: "tak" },
  { value: false, label: "nie" },
  { value: null, label: "niejasne" },
];

interface LabelChoiceProps {
  name: string;
  legend: string;
  value: Choice;
  allowUnclear: boolean;
  onChange: (value: boolean | null) => void;
}

// Native radios keep the arrow-key behaviour of a group, so a whole summary can be labelled from the keyboard.
export function LabelChoice({ name, legend, value, allowUnclear, onChange }: LabelChoiceProps) {
  const options = allowUnclear ? OPTIONS : OPTIONS.slice(0, 2);

  return (
    <fieldset className="flex flex-wrap items-center gap-3">
      <legend className="sr-only">{legend}</legend>
      <span aria-hidden="true" className="text-caption text-mute">
        {legend}
      </span>
      {options.map((option) => {
        const isChecked = value === option.value;
        return (
          <label key={option.label} className="flex cursor-pointer">
            <input
              type="radio"
              name={name}
              checked={isChecked}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span
              className={cn(
                "flex items-center gap-1 text-caption peer-focus-visible:outline-2 peer-focus-visible:outline-ink",
                isChecked ? "text-ink" : "text-mute",
              )}
            >
              <span aria-hidden="true" className="whitespace-pre">
                {isChecked ? "[x]" : "[ ]"}
              </span>
              {option.label}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
