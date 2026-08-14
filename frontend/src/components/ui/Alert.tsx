import { cn } from "./cn";

const TONE = {
  success: "border-success-border bg-success-bg text-success",
  danger: "border-danger-border bg-danger-bg text-danger",
  warning: "border-warning-border bg-warning-bg text-warning",
} as const;

interface AlertProps extends React.ComponentProps<"div"> {
  tone?: keyof typeof TONE;
}

export function Alert({ tone = "success", className, ...props }: AlertProps) {
  return <div {...props} className={cn("border px-3 py-2 text-base", TONE[tone], className)} />;
}
