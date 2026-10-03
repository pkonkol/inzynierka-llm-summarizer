import { cn } from "./cn";

type PreBlockProps = React.ComponentProps<"pre"> & {
  withoutBackground?: boolean;
};

export function PreBlock({ className, withoutBackground = false, ...props }: PreBlockProps) {
  return (
    <pre
      {...props}
      className={cn(
        "min-w-0 overflow-x-auto whitespace-pre-wrap wrap-break-word rounded-sm px-4 py-3 font-mono text-caption text-ink",
        withoutBackground ? undefined : "bg-surface-card", // a tinted column would reappear as a band once the measure is capped
        className,
      )}
    />
  );
}
