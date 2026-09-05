interface InfoRowProps {
  label: string;
  value: string | number | boolean | null | undefined;
  valueClassName?: string;
}

export function InfoRow({ label, value, valueClassName = "" }: InfoRowProps) {
  if (value === null || value === undefined || value === "") return null;

  return (
    <div className="flex items-baseline gap-x-2 whitespace-nowrap text-xs">
      <span className="label-caps font-semibold text-muted">{label}:</span>
      <span className={`mono-value ${valueClassName}`}>{String(value)}</span>
    </div>
  );
}
