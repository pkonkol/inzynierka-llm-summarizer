import type { ReactNode } from "react";

// The label/value pair as a slot, for values whose glyph and colour are part of the value
// and so cannot survive being stringified.
export function InfoRowContent({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-x-2 whitespace-nowrap text-xs">
      <span className="label-caps font-semibold text-muted">{label}:</span>
      {children}
    </div>
  );
}

interface InfoRowProps {
  label: string;
  value: string | number | boolean | null | undefined;
  valueClassName?: string;
}

export function InfoRow({ label, value, valueClassName = "" }: InfoRowProps) {
  if (value === null || value === undefined || value === "") return null;

  return (
    <InfoRowContent label={label}>
      <span className={`mono-value ${valueClassName}`}>{String(value)}</span>
    </InfoRowContent>
  );
}
