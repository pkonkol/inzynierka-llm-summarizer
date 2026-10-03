import { formatScore } from "../utils/format";

export type DeepevalDisplayItem = {
  name: string;
  score?: number | null;
  passed?: boolean | null;
  reason?: string | null;
  statusLabel?: string | null; // a pairwise score carries no threshold verdict, so the caller names the winner
};

export function DeepevalItems({ items }: { items: DeepevalDisplayItem[] }) {
  return (
    <div className="grid gap-4">
      {items.map((item) => {
        const passedText = item.passed != null ? (item.passed ? "passed" : "failed") : null;
        const statusText = item.statusLabel ?? passedText;
        const scoreText = item.score != null ? formatScore(item.score) : null;
        const bits = [statusText, scoreText].filter(Boolean);

        return (
          <div key={item.name} className="grid gap-1">
            <div className="flex flex-wrap items-baseline gap-x-2 text-caption">
              <span className="text-mute">{item.name}:</span>
              {bits.length > 0 ? <span className="tabular-nums">{bits.join(" · ")}</span> : null}
            </div>
            {item.reason ? <p className="text-caption text-body">{item.reason}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
