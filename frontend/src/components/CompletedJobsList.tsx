import type { UrlSummaryListItem } from "../types/api.generated";
import { formatDateMinute } from "../utils/format";
import { isManualSource, manualSourceTitle } from "../utils/jobs";
import { StatusLabel } from "./StatusLabel";
import { listItemClasses } from "./ui/listItem";
import { PageSection } from "./ui/PageShell";

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
    <PageSection
      title="Lista podsumowanych linków"
      trailing={<span className="text-caption text-mute">{urls.length}</span>}
    >
      {isLoading ? <p className="py-2 text-mute">Ładowanie listy...</p> : null}
      {!isLoading && urls.length === 0 ? (
        <p className="py-2 text-mute">Brak wyników. Dodaj pierwszy URL powyżej.</p>
      ) : null}

      <ul aria-live="polite" className="grid min-w-0">
        {urls.map((item) => {
          const isManual = isManualSource(item.source_url);
          const label = isManual ? manualSourceTitle(item.source_url) : item.source_url;
          return (
            <li key={item.source_url} className="min-w-0 border-b border-hairline">
              <button
                type="button"
                className={listItemClasses(selectedUrl === item.source_url)}
                onClick={() => onSelectUrl(item.source_url)}
              >
                {/* Only a URL gets link styling. */}
                <span className={`break-all font-medium ${isManual ? "" : "underline"}`}>
                  {label}
                </span>

                {/* Latest title from most recent completed job, when it differs from the label */}
                {item.latest_title && item.latest_title !== label ? (
                  <span className="line-clamp-1 text-body">{item.latest_title}</span>
                ) : null}

                {/* Counts + date */}
                <span className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-mute">
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
    </PageSection>
  );
}
