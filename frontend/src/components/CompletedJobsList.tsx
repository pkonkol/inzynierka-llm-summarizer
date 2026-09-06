import type { UrlSummaryListItem } from "../types/api.generated";
import { formatDateMinute } from "../utils/format";
import { JobStatusLabel } from "./JobStatusLabel";
import { listItemClasses } from "./ui/listItem";

interface CompletedJobsListProps {
  urls: UrlSummaryListItem[];
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
  return (
    <section className="panel-shell grid gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2>Lista podsumowanych linków</h2>
        <span className="text-muted">{urls.length}</span>
      </div>

      {isLoading ? <p className="text-muted">Ładowanie listy...</p> : null}
      {!isLoading && urls.length === 0 ? (
        <p className="text-muted">Brak wyników. Dodaj pierwszy URL powyżej.</p>
      ) : null}

      <ul aria-live="polite" className="grid min-w-0 gap-2">
        {urls.map((item) => (
          <li key={item.source_url} className="min-w-0">
            <button
              type="button"
              className={listItemClasses(selectedUrl === item.source_url)}
              onClick={() => onSelectUrl(item.source_url)}
            >
              {/* URL — primary, full width, wrap */}
              <span className="mono-value block break-all font-semibold text-link">
                {item.source_url}
              </span>

              {/* Latest title from most recent completed job */}
              {item.latest_title ? (
                <span className="block text-muted line-clamp-1">{item.latest_title}</span>
              ) : null}

              {/* Counts + date */}
              <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                {item.pending_count > 0 && (
                  <JobStatusLabel status="pending" count={item.pending_count} />
                )}
                {item.completed_count > 0 && (
                  <JobStatusLabel status="completed" count={item.completed_count} />
                )}
                {item.failed_count > 0 && (
                  <JobStatusLabel status="failed" count={item.failed_count} />
                )}
                <span>{formatDateMinute(item.latest_updated_at)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
