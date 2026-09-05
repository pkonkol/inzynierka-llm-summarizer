import { cn } from "./cn";

// `split:` is the breakpoint the two column minimums actually need; see --breakpoint-split.
export const SPLIT_COLUMNS =
  "split:grid-cols-[minmax(var(--container-list),38%)_minmax(var(--container-detail),62%)] split:items-start";

// Left column of SPLIT_COLUMNS: scrolls on its own so the detail pane stays put.
export const STICKY_COLUMN =
  "min-w-0 split:sticky split:top-4 split:max-h-[calc(100vh-2rem)] split:overflow-y-auto split:overflow-x-hidden split:pr-2";

export function PageShell({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main {...props} className={cn("mx-auto grid w-full max-w-app gap-4 px-3 py-8", className)} />
  );
}

export function SectionHeading(props: React.ComponentProps<"h5">) {
  return <h5 {...props} />;
}
