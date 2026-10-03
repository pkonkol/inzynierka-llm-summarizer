import { formatMetricLabel } from "../utils/format";
import { SectionHeading } from "./ui/PageShell";

export function MetricsSection({
  title,
  data,
}: {
  title: string;
  data: Record<string, number | null>;
}) {
  return (
    <div className="grid gap-2">
      <SectionHeading>{title}</SectionHeading>
      <dl className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-6 gap-y-3">
        {Object.entries(data).map(([key, value]) =>
          value === null ? null : (
            // Value above its caption on screen, term before definition in the markup.
            <div key={key} className="flex min-w-0 flex-col-reverse gap-1">
              <dt className="text-caption text-mute">{formatMetricLabel(key)}</dt>
              <dd className="wrap-anywhere font-medium tabular-nums">{String(value)}</dd>
            </div>
          ),
        )}
      </dl>
    </div>
  );
}
