import { cn } from "./cn";

const TONE = {
  neutral: "border-panel-border bg-subtle text-ink",
  success: "border-success-border bg-success-bg text-success",
  danger: "border-danger-border bg-danger-bg text-danger",
  warning: "border-warning-border bg-warning-bg text-warning",
} as const;

interface BadgeProps extends React.ComponentProps<"span"> {
  tone?: keyof typeof TONE;
}

export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      {...props}
      className={cn(
        "inline-block border px-2 py-1 font-mono text-2xs uppercase tracking-wider",
        TONE[tone],
        className,
      )}
    />
  );
}
