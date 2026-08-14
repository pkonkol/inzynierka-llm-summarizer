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
        const scoreText = item.score != null ? `score: ${item.score}` : null;
        const bits = [statusText, scoreText].filter(Boolean);

        return (
          <div
            key={item.name}
            className="grid gap-2 border border-panel-border bg-panel-solid px-3 py-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-sm font-semibold uppercase tracking-wider text-ink">
                {item.name}
              </span>
              {bits.length > 0 && (
                <span className="font-mono text-xs text-muted">{bits.join(" · ")}</span>
              )}
            </div>
            {item.reason ? (
              <p className="text-sm leading-normal text-muted">{item.reason}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
