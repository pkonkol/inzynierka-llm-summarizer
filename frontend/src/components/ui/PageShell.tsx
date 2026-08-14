import { cn } from "./cn";

// Detail pane needs ~740px to hold a summary without wrapping every line; the list needs ~460px.
export const SPLIT_COLUMNS = "lg:grid-cols-[minmax(460px,38%)_minmax(740px,62%)] lg:items-start";

// Left column of SPLIT_COLUMNS: scrolls on its own so the detail pane stays put.
export const STICKY_COLUMN =
  "min-w-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-32px)] lg:overflow-y-auto lg:overflow-x-hidden lg:pr-2";

export function PageShell({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main {...props} className={cn("mx-auto grid w-full max-w-app gap-4 px-3 py-8", className)} />
  );
}

export function SectionHeading({ className, ...props }: React.ComponentProps<"h6">) {
  return (
    <h6
      {...props}
      className={cn(
        "m-0 font-mono text-xs font-semibold uppercase tracking-wider text-muted",
        className,
      )}
    />
  );
}
