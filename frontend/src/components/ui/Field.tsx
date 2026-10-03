import { cn } from "./cn";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input {...props} className={cn("field", className)} />;
}

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select {...props} className={cn("field", className)} />;
}

export function RangeInput({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <input
      {...props}
      type="range"
      className={cn("h-input w-full cursor-pointer disabled:cursor-not-allowed", className)}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea {...props} className={cn("field-area", className)} />;
}

// Linked from the field through `aria-describedby`; the field itself carries `aria-invalid`.
export function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="text-caption text-danger-hover">
      <span aria-hidden="true">[✗] </span>
      {children}
    </p>
  );
}

interface FieldLabelProps extends React.ComponentProps<"label"> {
  htmlFor: string;
}

export function FieldLabel({ className, ...props }: FieldLabelProps) {
  const classes = cn("field-label", className);
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
