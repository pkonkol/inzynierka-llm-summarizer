import { cn } from "./cn";

const VARIANT = {
  primary: "border-accent-700 bg-accent-700 text-accent-50 hover:enabled:opacity-90",
  secondary: "border-panel-border bg-panel-solid text-ink hover:enabled:bg-subtle-hover",
  danger: "border-danger bg-danger text-accent-50 hover:enabled:opacity-90",
  dangerOutline: "border-danger bg-panel-solid text-danger hover:enabled:bg-subtle-hover",
  ghost: "border-panel-border bg-subtle-hover text-ink hover:enabled:bg-subtle",
  disclosure:
    "gap-2 border-panel-border bg-subtle uppercase tracking-wider text-muted hover:enabled:bg-subtle-hover",
} as const;

const SIZE = {
  xs: "px-3 py-2 text-xs",
  sm: "px-3 py-2 text-sm",
  md: "px-3 py-2 text-base",
  lg: "h-control px-6 text-base",
} as const;

export type ButtonVariant = keyof typeof VARIANT;
export type ButtonSize = keyof typeof SIZE;

export function buttonClasses(variant: ButtonVariant, size: ButtonSize, className?: string) {
  return cn(
    "inline-flex cursor-pointer items-center justify-center border font-mono transition-[opacity,background-color] duration-200 disabled:cursor-not-allowed disabled:opacity-60",
    VARIANT[variant],
    SIZE[size],
    className,
  );
}

interface ButtonProps extends React.ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "secondary",
  size = "md",
  type = "button",
  className,
  ...props
}: ButtonProps) {
  return <button type={type} {...props} className={buttonClasses(variant, size, className)} />;
}
