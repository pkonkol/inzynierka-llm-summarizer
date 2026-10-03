import { cn } from "./cn";

interface CheckboxProps extends Omit<React.ComponentProps<"input">, "type"> {
  children: React.ReactNode;
}

// The whole 44px row is the hit area, not just the 16px box.
export function Checkbox({ children, className, ...props }: CheckboxProps) {
  return (
    <label
      className={cn(
        "flex min-h-11 shrink-0 cursor-pointer items-center gap-2 has-disabled:cursor-not-allowed has-disabled:text-ash",
        className,
      )}
    >
      <input
        {...props}
        type="checkbox"
        className="size-4 cursor-pointer disabled:cursor-not-allowed"
      />
      {children}
    </label>
  );
}
