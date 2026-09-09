import { useState } from "react";

import { deleteJob, getJobStatus, listAllJobsFlat } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { JobStatusLabel } from "../components/JobStatusLabel";
import { SummaryDetailPanel } from "../components/SummaryDetailPanel";
import { Alert } from "../components/ui/Alert";
import { buttonClasses } from "../components/ui/Button";
import { listItemClasses } from "../components/ui/listItem";
import { PageShell, SPLIT_COLUMNS, STICKY_COLUMN } from "../components/ui/PageShell";
import type { JobListItemResponse, JobStatusResponse } from "../types/api.generated";
import { formatDateMinute } from "../utils/format";
import { useAsyncAction } from "../utils/useAsyncAction";
import { useConfirmDelete } from "../utils/useConfirmDelete";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { useListPolling } from "../utils/useListPolling";
import { useReloadableResource } from "../utils/useReloadableResource";
import { isJobInProgress } from "../utils/utils";

export function JobsPage() {
  useDocumentTitle("Zadania");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobStatusResponse | null>(null);

  const jobsResource = useReloadableResource(
    () => listAllJobsFlat(100),
    "",
    "Nie udało się pobrać listy zadań",
  );
  // null means "no answer yet" — a real third state, not a missing value.
  const jobs = jobsResource.data ?? [];

  useListPolling(
    jobsResource.reload,
    jobs.some((job) => isJobInProgress(job.status)),
  );

  const selectJob = useAsyncAction(
    async (job: JobListItemResponse) => {
      setSelectedJobId(job.job_id);
      setSelectedJob(null);
      setSelectedJob(await getJobStatus(job.job_id));
    },
    { errorPrefix: "Nie udało się pobrać szczegółów joba" },
  );

  const deleteJobConfirm = useConfirmDelete<JobListItemResponse>({
    title: "Usunąć job?",
    message: (job) => `Usunąć "${job.title}" (${job.source_url})?`,
    onConfirm: async (job) => {
      await deleteJob(job.job_id);
    },
    errorPrefix: "Nie udało się usunąć joba",
    afterConfirm: (job) => {
      if (selectedJobId === job.job_id) {
        setSelectedJobId(null);
        setSelectedJob(null);
      }
      return jobsResource.reload();
    },
  });

  return (
    <PageShell className={selectedJobId ? SPLIT_COLUMNS : undefined}>
      <section className={selectedJobId ? STICKY_COLUMN : "min-w-0"}>
        <div className="panel-shell grid gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2>Gotowe podsumowania</h2>
            <span className="text-muted">{jobs.length}</span>
          </div>

          {jobsResource.errorMessage ? (
            <Alert tone="danger">{jobsResource.errorMessage}</Alert>
          ) : null}
          {jobsResource.isInitialLoading ? <p className="text-muted">Ładowanie listy...</p> : null}
          {!jobsResource.isInitialLoading && jobs.length === 0 ? (
            <p className="text-muted">Brak wyników.</p>
          ) : null}

          <ul aria-live="polite" className="grid min-w-0 gap-2">
            {jobs.map((job) => (
              <li key={job.job_id} className="relative min-w-0">
                <button
                  type="button"
                  className={listItemClasses(selectedJobId === job.job_id)}
                  onClick={() => {
                    void selectJob.run(job);
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
                    deleteJobConfirm.request(job);
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
        isLoading={selectJob.isPending}
        onClose={() => {
          setSelectedJobId(null);
          setSelectedJob(null);
        }}
        debugMode
      />

      {deleteJobConfirm.dialogProps ? <ConfirmDialog {...deleteJobConfirm.dialogProps} /> : null}
    </PageShell>
  );
}
