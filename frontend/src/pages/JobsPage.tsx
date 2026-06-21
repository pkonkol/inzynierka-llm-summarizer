import { useEffect, useState } from "react";

import { listAllJobsFlat, getJobsForUrl } from "../api/client";
import { JobDetailPanel } from "../components/JobDetailPanel";
import { formatDateMinute } from "../utils/format";
import type { JobListItem, JobStatus } from "../types/api";

const STATUS_COLORS: Record<string, string> = {
    completed: "text-success",
    failed: "text-error",
    pending: "text-warning",
};

export function JobsPage() {
    const [jobs, setJobs] = useState<JobListItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
    const [detailJobs, setDetailJobs] = useState<JobStatus[]>([]);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);

    useEffect(() => {
        listAllJobsFlat(100)
            .then(setJobs)
            .finally(() => setIsLoading(false));
    }, []);

    const handleSelect = async (url: string) => {
        setSelectedUrl(url);
        setIsLoadingDetail(true);
        try {
            setDetailJobs(await getJobsForUrl(url));
        } finally {
            setIsLoadingDetail(false);
        }
    };

    const baseItem = "w-full min-w-0 cursor-pointer border px-3 py-[11px] text-left transition-[border-color,background-color] duration-200";
    const selectedItem = `${baseItem} border-selected-border bg-selected-bg`;
    const defaultItem = `${baseItem} border-panel-border bg-subtle hover:bg-subtle-hover`;

    return (
        <div className={
            selectedUrl
                ? "mx-auto grid w-full max-w-355 gap-4 px-3.5 py-7 lg:grid-cols-[minmax(420px,40%)_minmax(680px,60%)] lg:items-start"
                : "mx-auto grid w-full max-w-355 gap-4 px-3.5 py-7"
        }>
            <section className={selectedUrl ? "min-w-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-32px)] lg:overflow-y-auto lg:overflow-x-hidden lg:pr-1.5" : "min-w-0"}>
                <div className="panel-shell">
                    <div className="mb-3 flex items-baseline justify-between gap-2.5">
                        <h2 className="m-0 font-display text-[1.2rem]">Gotowe podsumowania</h2>
                        <span className="text-[0.9rem] text-muted">{jobs.length}</span>
                    </div>

                    {isLoading ? <p className="helper-copy">Ładowanie listy...</p> : null}
                    {!isLoading && jobs.length === 0 ? (
                        <p className="helper-copy">Brak wyników.</p>
                    ) : null}

                    <ul className="mt-3.5 grid min-w-0 list-none gap-2.25 p-0">
                        {jobs.map(job => (
                            <li key={job.job_id} className="min-w-0">
                                <button
                                    type="button"
                                    className={selectedUrl === job.source_url ? selectedItem : defaultItem}
                                    onClick={() => { void handleSelect(job.source_url); }}
                                >
                                    <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[0.82rem] font-mono text-link">
                                        {job.source_url}
                                    </span>
                                    <span className="mt-1 block text-[0.88rem] leading-[1.4] text-ink line-clamp-1">
                                        {job.title || "Bez tytułu"}
                                    </span>
                                    <span className="mt-1 flex gap-3 text-[0.75rem] text-muted">
                                        <span className={STATUS_COLORS[job.status] ?? ""}>{job.status}</span>
                                        <span>{job.model_provider}:{job.model_name}</span>
                                        {job.updated_at && <span>{formatDateMinute(job.updated_at)}</span>}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            </section>

            <JobDetailPanel
                isOpen={Boolean(selectedUrl)}
                sourceUrl={selectedUrl}
                jobs={detailJobs}
                isLoading={isLoadingDetail}
                onClose={() => { setSelectedUrl(null); setDetailJobs([]); }}
                debugMode
            />
        </div>
    );
}
