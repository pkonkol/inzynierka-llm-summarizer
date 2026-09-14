import { cn } from "./cn";

const FIELD =
  "w-full border border-input-border bg-subtle px-3 text-ink focus:border-input-focus disabled:cursor-not-allowed disabled:opacity-60";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input {...props} className={cn(FIELD, "h-control", className)} />;
}

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select {...props} className={cn(FIELD, "h-control", className)} />;
}

export function RangeInput({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <input
      {...props}
      type="range"
      className={cn(
        "h-control w-full accent-input-focus disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea {...props} className={cn(FIELD, "py-2 font-mono text-sm", className)} />;
}

interface FieldLabelProps extends React.ComponentProps<"label"> {
  htmlFor: string;
}

export function FieldLabel({ className, ...props }: FieldLabelProps) {
  const classes = cn("block font-semibold text-muted", className);
  // biome-ignore lint/a11y/noLabelWithoutControl: htmlFor is required by FieldLabelProps
  return <label {...props} className={classes} />;
}

// `provider:model` is the value shape both summarization forms submit.
export function ModelOptions({ models }: { models: Record<string, string[]> }) {
  return Object.entries(models).map(([provider, modelList]) =>
    modelList.map((model) => (
      <option key={`${provider}:${model}`} value={`${provider}:${model}`}>
        {provider} – {model}
      </option>
    )),
  );
}
