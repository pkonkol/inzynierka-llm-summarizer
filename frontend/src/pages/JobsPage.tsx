import { useEffect, useState } from "react";

import { deleteJob, getJobStatus, listAllJobsFlat } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { SummaryDetailPanel } from "../components/SummaryDetailPanel";
import { PageShell, SPLIT_COLUMNS, STICKY_COLUMN } from "../components/ui/PageShell";
import type { JobListItem, JobStatus } from "../types/api";
import { formatDateMinute } from "../utils/format";
import { useDocumentTitle } from "../utils/useDocumentTitle";

// Glyph as well as colour, so the state survives greyscale and colour-blind vision.
const STATUS_STYLE: Record<string, { className: string; glyph: string }> = {
  completed: { className: "text-success", glyph: "✓" },
  failed: { className: "text-danger", glyph: "✗" },
  pending: { className: "text-warning", glyph: "⋯" },
};

export function JobsPage() {
  useDocumentTitle("Zadania");
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

  const baseItem =
    "grid w-full min-w-0 cursor-pointer gap-1 border px-3 py-3 text-left transition-[border-color,background-color] duration-200";
  const selectedItem = `${baseItem} border-selected-border bg-selected-bg`;
  const defaultItem = `${baseItem} border-panel-border bg-subtle hover:bg-subtle-hover`;

  return (
    <PageShell className={selectedJobId ? SPLIT_COLUMNS : undefined}>
      <section className={selectedJobId ? STICKY_COLUMN : "min-w-0"}>
        <div className="panel-shell grid gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-mono text-xl">Gotowe podsumowania</h2>
            <span className="text-md text-muted">{jobs.length}</span>
          </div>

          {isLoading ? <p className="helper-copy">Ładowanie listy...</p> : null}
          {!isLoading && jobs.length === 0 ? <p className="helper-copy">Brak wyników.</p> : null}

          <ul className="grid min-w-0 gap-2">
            {jobs.map((job) => (
              <li key={job.job_id} className="relative min-w-0">
                <button
                  type="button"
                  className={selectedJobId === job.job_id ? selectedItem : defaultItem}
                  onClick={() => {
                    void handleSelect(job);
                  }}
                >
                  <span className="block overflow-hidden text-ellipsis whitespace-nowrap pr-8 text-sm font-mono text-link">
                    {job.source_url}
                  </span>
                  <span className="block text-md leading-snug text-ink line-clamp-1">
                    {job.title}
                  </span>
                  <span className="flex gap-3 text-xs text-muted">
                    <span className={STATUS_STYLE[job.status]?.className}>
                      <span aria-hidden="true">{STATUS_STYLE[job.status]?.glyph} </span>
                      {job.status}
                    </span>
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
                  className="absolute right-2 top-2 cursor-pointer border border-panel-border bg-panel-solid px-2 py-1 text-xs text-danger hover:bg-subtle-hover"
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
