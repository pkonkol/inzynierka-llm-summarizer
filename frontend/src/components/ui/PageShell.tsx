import { cn } from "./cn";

export const SPLIT_COLUMNS =
  "lg:grid-cols-[minmax(var(--container-list),38%)_minmax(var(--container-detail),62%)] lg:items-start";

// Left column of SPLIT_COLUMNS: scrolls on its own so the detail pane stays put.
export const STICKY_COLUMN =
  "min-w-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:overflow-x-hidden lg:pr-2";

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
        "font-display text-xl font-semibold uppercase tracking-wide text-ink",
        className,
      )}
    />
  );
}
