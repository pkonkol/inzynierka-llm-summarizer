import { formatMetricLabel } from "../utils/format";
import { InfoRow } from "./InfoRow";
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
      <div className="metric-row">
        {Object.entries(data).map(([key, value]) => (
          <InfoRow key={key} label={formatMetricLabel(key)} value={value} />
        ))}
      </div>
    </div>
  );
}
