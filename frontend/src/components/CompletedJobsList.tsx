import type { UrlSummaryListItem } from "../types/api.generated";
import { formatDateMinute } from "../utils/format";
import { isManualSource, manualSourceTitle } from "../utils/utils";
import { StatusLabel } from "./StatusLabel";
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
        {urls.map((item) => {
          const isManual = isManualSource(item.source_url);
          const label = isManual ? manualSourceTitle(item.source_url) : item.source_url;
          return (
            <li key={item.source_url} className="min-w-0">
              <button
                type="button"
                className={listItemClasses(selectedUrl === item.source_url)}
                onClick={() => onSelectUrl(item.source_url)}
              >
                {/* Label — primary, full width, wrap. Only a URL gets link styling. */}
                <span
                  className={`mono-value block break-all font-semibold ${isManual ? "" : "text-link"}`}
                >
                  {label}
                </span>

                {/* Latest title from most recent completed job, when it differs from the label */}
                {item.latest_title && item.latest_title !== label ? (
                  <span className="block text-muted line-clamp-1">{item.latest_title}</span>
                ) : null}

                {/* Counts + date */}
                <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                  {item.pending_count > 0 && (
                    <StatusLabel status="pending" count={item.pending_count} />
                  )}
                  {item.completed_count > 0 && (
                    <StatusLabel status="completed" count={item.completed_count} />
                  )}
                  {item.failed_count > 0 && (
                    <StatusLabel status="failed" count={item.failed_count} />
                  )}
                  <span>{formatDateMinute(item.latest_updated_at)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
