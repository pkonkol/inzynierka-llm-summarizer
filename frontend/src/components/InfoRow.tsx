interface InfoRowProps {
  label: string;
  value: string | number | boolean | null | undefined;
  valueClassName?: string;
}

export function InfoRow({ label, value, valueClassName = "text-sm" }: InfoRowProps) {
  if (value === null || value === undefined || value === "") return null;

  return (
    <div className="flex flex-col gap-1">
      <span className="block text-2xs uppercase tracking-wider text-muted">{label}</span>
      <span className={`font-mono ${valueClassName}`}>{String(value)}</span>
    </div>
  );
}
