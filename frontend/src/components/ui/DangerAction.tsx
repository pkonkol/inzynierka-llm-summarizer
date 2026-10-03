import { cn } from "./cn";

// A destructive action written as underlined text: it always leads to a ConfirmDialog, which holds the primary button.
export function DangerAction({
  className,
  type = "button",
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type={type}
      {...props}
      className={cn("min-h-11 shrink-0 cursor-pointer text-danger-hover underline", className)}
    />
  );
}
