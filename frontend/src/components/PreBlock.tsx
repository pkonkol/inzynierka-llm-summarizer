import { cn } from "./ui/cn";

export function PreBlock({ className, ...props }: React.ComponentProps<"pre">) {
  return (
    <pre
      {...props}
      className={cn(
        "min-w-0 overflow-x-auto whitespace-pre-wrap wrap-break-word bg-subtle p-3 text-xs leading-normal",
        className,
      )}
    />
  );
}
