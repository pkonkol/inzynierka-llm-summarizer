import { cn } from "./ui/cn";

type PreBlockProps = React.ComponentProps<"pre"> & {
  withoutBackground?: boolean;
};

export function PreBlock({ className, withoutBackground = false, ...props }: PreBlockProps) {
  return (
    <pre
      {...props}
      className={cn(
        "min-w-0 overflow-x-auto whitespace-pre-wrap wrap-break-word p-3 text-xs leading-normal",
        withoutBackground ? undefined : "bg-subtle", // a tinted column would reappear as a band once the measure is capped
        className,
      )}
    />
  );
}
