import { cn } from "./cn";

// Green fails contrast on canvas, so success stays in ink and the glyph carries the tone.
const TONE = {
  success: { className: "border-hairline-strong text-ink", glyph: "[✓]" },
  danger: { className: "border-danger-hover text-danger-hover", glyph: "[✗]" },
  warning: { className: "border-warning-active text-warning-active", glyph: "[▶]" },
} as const;

interface AlertProps extends React.ComponentProps<"div"> {
  tone?: keyof typeof TONE;
}

export function Alert({ tone = "success", className, children, ...props }: AlertProps) {
  return (
    <div {...props} className={cn("flex gap-2 border px-4 py-3", TONE[tone].className)}>
      <span aria-hidden="true" className="shrink-0">
        {TONE[tone].glyph}
      </span>
      <div className={cn("min-w-0 flex-1", className)}>{children}</div>
    </div>
  );
}
