import type { JobListItem } from "../types/api";

interface CompletedJobsListProps {
    jobs: JobListItem[];
    selectedJobId: string | null;
    isLoading: boolean;
    isFocused: boolean;
    onSelectJob: (jobId: string) => void;
}

function formatDate(iso: string | null): string {
    if (!iso) return "";
    return new Date(iso).toLocaleString("pl-PL", {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit",
    });
}

export function CompletedJobsList({
    jobs,
    selectedJobId,
    isLoading,
    isFocused,
    onSelectJob,
}: CompletedJobsListProps) {
    const baseItemClass =
        "w-full min-w-0 cursor-pointer overflow-hidden border px-3 py-[11px] text-left transition-[border-color,background-color] duration-200";

    const selectedItemClass = `${baseItemClass} border border-selected-border bg-selected-bg`;
    const defaultItemClass = `${baseItemClass} border border-panel-border bg-subtle hover:bg-subtle-hover`;

    return (
        <section className={isFocused ? "panel-shell" : "panel-shell mt-6"}>
            <div className="mb-3 flex items-baseline justify-between gap-2.5">
                <h2 className="m-0 font-display text-[1.2rem]">Gotowe podsumowania</h2>
                <span className="text-[0.9rem] text-muted">{jobs.length}</span>
            </div>
            {isLoading ? <p className="helper-copy">Ladowanie listy...</p> : null}
            {!isLoading && jobs.length === 0 ? (
                <p className="helper-copy">Brak gotowych wynikow. Dodaj pierwszy URL powyzej.</p>
            ) : null}
            <ul className="mt-3.5 grid min-w-0 list-none gap-2.25 p-0">
                {jobs.map((job) => (
                    <li key={job.job_id} className="min-w-0">
                        <button
                            type="button"
                            className={selectedJobId === job.job_id ? selectedItemClass : defaultItemClass}
                            onClick={() => onSelectJob(job.job_id)}
                        >
                            {/* URL — most prominent */}
                            <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[0.82rem] font-mono text-link">
                                {job.source_url}
                            </span>
                            {/* Short summary */}
                            {job.short_summary ? (
                                <span className="mt-1 line-clamp-2 block text-[0.88rem] leading-[1.4] text-ink">
                                    {job.short_summary}
                                </span>
                            ) : (
                                <span className="mt-1 block text-[0.88rem] text-muted">{job.title || "Bez tytulu"}</span>
                            )}
                            {/* Updated at */}
                            {job.updated_at ? (
                                <span className="mt-1 block text-[0.75rem] text-muted">
                                    {formatDate(job.updated_at)}
                                </span>
                            ) : null}
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}
