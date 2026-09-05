import { useEffect, useState } from "react";

import { deleteJob, getJobStatus, listAllJobsFlat } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { JobStatusLabel } from "../components/JobStatusLabel";
import { SummaryDetailPanel } from "../components/SummaryDetailPanel";
import { buttonClasses } from "../components/ui/Button";
import { PageShell, SPLIT_COLUMNS, STICKY_COLUMN } from "../components/ui/PageShell";
import type { JobListItemResponse, JobStatusResponse } from "../types/api.generated";
import { formatDateMinute } from "../utils/format";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { useListPolling } from "../utils/useListPolling";

export function JobsPage() {
  useDocumentTitle("Zadania");
  const [jobs, setJobs] = useState<JobListItemResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobStatusResponse | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [jobPendingDelete, setJobPendingDelete] = useState<JobListItemResponse | null>(null);
  const [isDeletingJob, setIsDeletingJob] = useState(false);

  const loadJobs = async () => {
    setJobs(await listAllJobsFlat(100));
  };

  useEffect(() => {
    loadJobs().finally(() => setIsLoading(false));
  }, []);

  useListPolling(
    loadJobs,
    jobs.some((job) => job.status === "pending"),
  );

  const handleSelect = async (job: JobListItemResponse) => {
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

  const baseItem =
    "grid w-full min-w-0 cursor-pointer gap-1 border px-3 py-3 text-left transition-[border-color,background-color] duration-200";
  const selectedItem = `${baseItem} border-selected-border bg-selected-bg`;
  const defaultItem = `${baseItem} border-panel-border bg-subtle hover:bg-subtle-hover`;

  return (
    <PageShell className={selectedJobId ? SPLIT_COLUMNS : undefined}>
      <section className={selectedJobId ? STICKY_COLUMN : "min-w-0"}>
        <div className="panel-shell grid gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2>Gotowe podsumowania</h2>
            <span className="text-muted">{jobs.length}</span>
          </div>

          {isLoading ? <p className="text-muted">Ładowanie listy...</p> : null}
          {!isLoading && jobs.length === 0 ? <p className="text-muted">Brak wyników.</p> : null}

          <ul aria-live="polite" className="grid min-w-0 gap-2">
            {jobs.map((job) => (
              <li key={job.job_id} className="relative min-w-0">
                <button
                  type="button"
                  className={selectedJobId === job.job_id ? selectedItem : defaultItem}
                  onClick={() => {
                    void handleSelect(job);
                  }}
                >
                  <span className="mono-value block overflow-hidden text-ellipsis whitespace-nowrap pr-8 text-link">
                    {job.source_url}
                  </span>
                  <span className="block text-ink line-clamp-1">{job.title}</span>
                  <span className="flex gap-3 text-xs text-muted">
                    <JobStatusLabel status={job.status} />
                    <span>
                      {job.model_provider}:{job.model_name}
                    </span>
                    {job.updated_at && <span>{formatDateMinute(job.updated_at)}</span>}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setJobPendingDelete(job);
                  }}
                  className={buttonClasses(
                    "dangerOutline",
                    "xs",
                    "absolute right-2 top-2 px-2 py-1",
                  )}
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
        onClose={() => {
          setSelectedJobId(null);
          setSelectedJob(null);
        }}
        debugMode
      />

      <ConfirmDialog
        isOpen={Boolean(jobPendingDelete)}
        title="Usunąć job?"
        message={
          jobPendingDelete
            ? `Usunąć "${jobPendingDelete.title}" (${jobPendingDelete.source_url})?`
            : ""
        }
        isConfirming={isDeletingJob}
        onConfirm={() => {
          void handleConfirmDelete();
        }}
        onClose={() => setJobPendingDelete(null)}
      />
    </PageShell>
  );
}
