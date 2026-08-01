interface InfoRowProps {
    label: string;
    value: string | number | boolean | null | undefined;
    valueClassName?: string;
}

export function InfoRow({ label, value, valueClassName = "text-[0.82rem]" }: InfoRowProps) {
    if (value === null || value === undefined || value === "") return null;

    return (
        <div className="flex flex-col gap-0.5">
            <span className="block text-[0.72rem] uppercase tracking-wider text-muted">{label}</span>
            <span className={`font-mono ${valueClassName}`}>{String(value)}</span>
        </div>
    );
}
