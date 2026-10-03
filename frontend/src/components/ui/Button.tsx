import { cn } from "./cn";

const VARIANT = {
  primary: "btn-primary",
  secondary: "btn-secondary",
} as const;

export type ButtonVariant = keyof typeof VARIANT;

export function buttonClasses(variant: ButtonVariant, className?: string) {
  return cn("btn", VARIANT[variant], className);
}

interface ButtonProps extends React.ComponentProps<"button"> {
  variant?: ButtonVariant;
}

export function Button({
  variant = "secondary",
  type = "button",
  className,
  ...props
}: ButtonProps) {
  return <button type={type} {...props} className={buttonClasses(variant, className)} />;
}
