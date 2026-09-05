export type DeepevalDisplayItem = {
  name: string;
  score?: number | null;
  passed?: boolean | null;
  reason?: string | null;
};

export function DeepevalItems({ items }: { items: DeepevalDisplayItem[] }) {
  return (
    <div className="grid gap-2">
      {items.map((item) => {
        const statusText = item.passed != null ? (item.passed ? "passed" : "failed") : null;
        const scoreText = item.score != null ? String(item.score) : null;
        const bits = [statusText, scoreText].filter(Boolean);

        return (
          <div
            key={item.name}
            className="grid gap-2 border border-panel-border bg-subtle px-3 py-2"
          >
            <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
              <span className="label-caps font-semibold text-muted">{item.name}:</span>
              {bits.length > 0 ? <span className="mono-value">{bits.join(" · ")}</span> : null}
            </div>
            {item.reason ? <p className="text-muted">{item.reason}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
