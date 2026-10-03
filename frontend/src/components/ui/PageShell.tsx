import { cn } from "./cn";

export const SPLIT_COLUMNS = "lg:grid-cols-2 lg:items-start";

// Left column of SPLIT_COLUMNS: scrolls on its own so the detail pane stays put.
export const STICKY_COLUMN =
  "min-w-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:overflow-x-hidden lg:pr-2";

export function PageShell({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      {...props}
      className={cn("mx-auto grid w-full max-w-frame gap-8 px-4 py-8 sm:px-6 lg:px-8", className)}
    />
  );
}

export function SectionHeading(props: React.ComponentProps<"h5">) {
  return <h5 {...props} />;
}

interface PageSectionProps extends Omit<React.ComponentProps<"section">, "title"> {
  title: React.ReactNode;
  trailing?: React.ReactNode;
}

// Label on the left, state or action on the right, over a hairline rule (DESIGN.md §2.6).
export function PageSection({ title, trailing, className, children, ...props }: PageSectionProps) {
  return (
    <section {...props} className={cn("grid min-w-0 content-start gap-4", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline pb-2">
        <h2>{title}</h2>
        {trailing}
      </div>
      {children}
    </section>
  );
}
