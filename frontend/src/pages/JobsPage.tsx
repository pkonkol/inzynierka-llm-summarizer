import { useEffect, useState } from "react";

import { deleteJob, listAllJobsFlat, getJobStatus } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { SummaryDetailPanel } from "../components/SummaryDetailPanel";
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
    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
    const [selectedJob, setSelectedJob] = useState<JobStatus | null>(null);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);
    const [jobPendingDelete, setJobPendingDelete] = useState<JobListItem | null>(null);
    const [isDeletingJob, setIsDeletingJob] = useState(false);

    const loadJobs = () => listAllJobsFlat(100).then(setJobs);

    useEffect(() => {
        loadJobs().finally(() => setIsLoading(false));
    }, []);

    const handleSelect = async (job: JobListItem) => {
        setSelectedJobId(job.job_id);
        setSelectedJob(null);
        setIsLoadingDetail(true);
        try {
            setSelectedJob(await getJobStatus(job.job_id));
        } finally {
            setIsLoadingDetail(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (!jobPendingDelete) return;
        setIsDeletingJob(true);
        try {
            await deleteJob(jobPendingDelete.job_id);
            if (selectedJobId === jobPendingDelete.job_id) {
                setSelectedJobId(null);
                setSelectedJob(null);
            }
            setJobPendingDelete(null);
            await loadJobs();
        } finally {
            setIsDeletingJob(false);
        }
    };

    const baseItem = "w-full min-w-0 cursor-pointer border px-3 py-[11px] text-left transition-[border-color,background-color] duration-200";
    const selectedItem = `${baseItem} border-selected-border bg-selected-bg`;
    const defaultItem = `${baseItem} border-panel-border bg-subtle hover:bg-subtle-hover`;

    return (
        <div className={
            selectedJobId
                ? "mx-auto grid w-full max-w-355 gap-4 px-3.5 py-7 lg:grid-cols-[minmax(460px,38%)_minmax(740px,62%)] lg:items-start"
                : "mx-auto grid w-full max-w-355 gap-4 px-3.5 py-7"
        }>
            <section className={selectedJobId ? "min-w-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-32px)] lg:overflow-y-auto lg:overflow-x-hidden lg:pr-1.5" : "min-w-0"}>
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
                            <li key={job.job_id} className="relative min-w-0">
                                <button
                                    type="button"
                                    className={selectedJobId === job.job_id ? selectedItem : defaultItem}
                                    onClick={() => { void handleSelect(job); }}
                                >
                                    <span className="block overflow-hidden text-ellipsis whitespace-nowrap pr-8 text-[0.82rem] font-mono text-link">
                                        {job.source_url}
                                    </span>
                                    <span className="mt-1 block text-[0.88rem] leading-[1.4] text-ink line-clamp-1">{job.title}</span>
                                    <span className="mt-1 flex gap-3 text-[0.75rem] text-muted">
                                        <span className={STATUS_COLORS[job.status] ?? ""}>{job.status}</span>
                                        <span>{job.model_provider}:{job.model_name}</span>
                                        {job.updated_at && <span>{formatDateMinute(job.updated_at)}</span>}
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setJobPendingDelete(job); }}
                                    className="absolute right-2.5 top-2.5 cursor-pointer border border-panel-border bg-panel-solid px-2 py-1 text-[0.75rem] text-danger hover:bg-subtle-hover"
                                    aria-label="Usuń job"
                                >
                                    ✕
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            </section>

            <SummaryDetailPanel
                isOpen={Boolean(selectedJobId)}
                sourceUrl={selectedJob?.source_url ?? null}
                jobs={selectedJob ? [selectedJob] : []}
                isLoading={isLoadingDetail}
                onClose={() => { setSelectedJobId(null); setSelectedJob(null); }}
                debugMode
            />

            <ConfirmDialog
                isOpen={Boolean(jobPendingDelete)}
                title="Usunąć job?"
                message={jobPendingDelete ? `Usunąć "${jobPendingDelete.title}" (${jobPendingDelete.source_url})?` : ""}
                isConfirming={isDeletingJob}
                onConfirm={() => { void handleConfirmDelete(); }}
                onClose={() => setJobPendingDelete(null)}
            />
        </div>
    );
}
