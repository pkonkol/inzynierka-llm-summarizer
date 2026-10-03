import type { ReactNode } from "react";

// The container every InfoRow needs: the rows are dt/dd pairs, valid only inside a <dl>.
export function InfoList({ children }: { children: ReactNode }) {
  return <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-caption">{children}</dl>;
}

// The label/value pair as a slot, for values whose glyph and colour are part of the value
// and so cannot survive being stringified.
export function InfoRowContent({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-x-2 whitespace-nowrap">
      <dt className="text-mute">{label}:</dt>
      <dd className="text-ink tabular-nums">{children}</dd>
    </div>
  );
}

interface InfoRowProps {
  label: string;
  value: string | number | boolean | null | undefined;
  valueClassName?: string;
}

export function InfoRow({ label, value, valueClassName }: InfoRowProps) {
  if (value === null || value === undefined || value === "") return null;

  return (
    <InfoRowContent label={label}>
      <span className={valueClassName}>{String(value)}</span>
    </InfoRowContent>
  );
}
