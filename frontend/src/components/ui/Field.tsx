import { cn } from "./cn";

const FIELD =
    "w-full border border-input-border bg-panel-solid px-3 text-ink outline-none focus:border-input-focus disabled:cursor-not-allowed disabled:opacity-60";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
    return <input {...props} className={cn(FIELD, "h-11", className)} />;
}

export function Select({ className, ...props }: React.ComponentProps<"select">) {
    return <select {...props} className={cn(FIELD, "h-11", className)} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
    return <textarea {...props} className={cn(FIELD, "py-2 font-mono text-md", className)} />;
}

interface FieldLabelProps extends React.ComponentProps<"label"> {
    htmlFor: string;
}

export function FieldLabel({ className, ...props }: FieldLabelProps) {
    const classes = cn("mb-2 block text-base font-semibold text-muted", className);
    // biome-ignore lint/a11y/noLabelWithoutControl: htmlFor is required by FieldLabelProps
    return <label {...props} className={classes} />;
}
