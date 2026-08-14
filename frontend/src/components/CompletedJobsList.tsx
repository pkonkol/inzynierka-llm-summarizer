import type { SummaryUrlListItem } from "../types/api";
import { formatDateMinute } from "../utils/format";

interface CompletedJobsListProps {
  urls: SummaryUrlListItem[];
  selectedUrl: string | null;
  isLoading: boolean;
  onSelectUrl: (url: string) => void;
}

export function CompletedJobsList({
  urls,
  selectedUrl,
  isLoading,
  onSelectUrl,
}: CompletedJobsListProps) {
  const baseItemClass =
    "grid w-full min-w-0 cursor-pointer gap-1 border px-3 py-3 text-left transition-[border-color,background-color] duration-200";
  const selectedClass = `${baseItemClass} border-selected-border bg-selected-bg`;
  const defaultClass = `${baseItemClass} border-panel-border bg-subtle hover:bg-subtle-hover`;

  return (
    <section className="panel-shell grid gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-mono text-xl">Lista podsumowanych linków</h2>
        <span className="text-md text-muted">{urls.length}</span>
      </div>

      {isLoading ? <p className="helper-copy">Ładowanie listy...</p> : null}
      {!isLoading && urls.length === 0 ? (
        <p className="helper-copy">Brak wyników. Dodaj pierwszy URL powyżej.</p>
      ) : null}

      <ul className="grid min-w-0 gap-2">
        {urls.map((item) => (
          <li key={item.source_url} className="min-w-0">
            <button
              type="button"
              className={selectedUrl === item.source_url ? selectedClass : defaultClass}
              onClick={() => onSelectUrl(item.source_url)}
            >
              {/* URL — primary, full width, wrap */}
              <span className="block font-mono text-sm font-semibold text-link break-all leading-snug">
                {item.source_url}
              </span>

              {/* Latest title from most recent completed job */}
              {item.latest_title ? (
                <span className="block text-xs text-muted leading-snug line-clamp-1">
                  {item.latest_title}
                </span>
              ) : null}

              {/* Counts + date */}
              <span className="flex flex-wrap gap-x-3 gap-y-1 text-2xs text-muted">
                <span>✓ {item.completed_count}</span>
                {item.failed_count > 0 && (
                  <span className="text-danger">✗ {item.failed_count}</span>
                )}
                {item.latest_updated_at && <span>{formatDateMinute(item.latest_updated_at)}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
