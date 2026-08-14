import type { SummaryUrlListItem } from "../types/api";
import { formatDateMinute } from "../utils/format";

interface CompletedJobsListProps {
    urls: SummaryUrlListItem[];
    selectedUrl: string | null;
    isLoading: boolean;
    isFocused: boolean;
    onSelectUrl: (url: string) => void;
}

export function CompletedJobsList({
    urls,
    selectedUrl,
    isLoading,
    isFocused,
    onSelectUrl,
}: CompletedJobsListProps) {
    const baseItemClass =
        "w-full min-w-0 cursor-pointer border px-3 py-[11px] text-left transition-[border-color,background-color] duration-200";
    const selectedClass = `${baseItemClass} border-selected-border bg-selected-bg`;
    const defaultClass = `${baseItemClass} border-panel-border bg-subtle hover:bg-subtle-hover`;

    return (
        <section className={isFocused ? "panel-shell" : "panel-shell mt-6"}>
            <div className="mb-3 flex items-baseline justify-between gap-2.5">
                <h2 className="m-0 font-mono text-xl">Lista podsumowanych linków</h2>
                <span className="text-md text-muted">{urls.length}</span>
            </div>

            {isLoading ? <p className="helper-copy">Ładowanie listy...</p> : null}
            {!isLoading && urls.length === 0 ? (
                <p className="helper-copy">Brak wyników. Dodaj pierwszy URL powyżej.</p>
            ) : null}

            <ul className="mt-3.5 grid min-w-0 list-none gap-2.25 p-0">
                {urls.map((item) => (
                    <li key={item.source_url} className="min-w-0">
                        <button
                            type="button"
                            className={
                                selectedUrl === item.source_url ? selectedClass : defaultClass
                            }
                            onClick={() => onSelectUrl(item.source_url)}
                        >
                            {/* URL — primary, full width, wrap */}
                            <span className="block font-mono text-sm font-semibold text-link break-all leading-snug">
                                {item.source_url}
                            </span>

                            {/* Latest title from most recent completed job */}
                            {item.latest_title ? (
                                <span className="mt-1 block text-xs text-muted leading-snug line-clamp-1">
                                    {item.latest_title}
                                </span>
                            ) : null}

                            {/* Counts + date */}
                            <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-2xs text-muted">
                                <span>✓ {item.completed_count}</span>
                                {item.failed_count > 0 && (
                                    <span className="text-danger">✗ {item.failed_count}</span>
                                )}
                                {item.latest_updated_at && (
                                    <span>{formatDateMinute(item.latest_updated_at)}</span>
                                )}
                            </span>
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}
