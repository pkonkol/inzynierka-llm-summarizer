export type DeepevalDisplayItem = {
  name: string;
  score?: number | null;
  passed?: boolean | null;
  reason?: string | null;
  statusLabel?: string | null; // a pairwise score carries no threshold verdict, so the caller names the winner
};

export function DeepevalItems({ items }: { items: DeepevalDisplayItem[] }) {
  return (
    <div className="grid gap-2">
      {items.map((item) => {
        const passedText = item.passed != null ? (item.passed ? "passed" : "failed") : null;
        const statusText = item.statusLabel ?? passedText;
        const scoreText = item.score != null ? String(item.score) : null;
        const bits = [statusText, scoreText].filter(Boolean);

        return (
          <div
            key={item.name}
            className="grid gap-2 bg-subtle"
          >
            <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
              <span className="label-caps font-semibold text-muted">{item.name}:</span>
              {bits.length > 0 ? <span className="mono-value">{bits.join(" · ")}</span> : null}
            </div>
            {item.reason ? <p className="text-muted text-xs">{item.reason}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
