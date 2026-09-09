import { deleteJob, getJobStatus, listAllJobsFlat } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { StatusLabel } from "../components/StatusLabel";
import { SummaryDetailPanel } from "../components/SummaryDetailPanel";
import { Alert } from "../components/ui/Alert";
import { AppLink } from "../components/ui/AppLink";
import { buttonClasses } from "../components/ui/Button";
import { listItemClasses } from "../components/ui/listItem";
import { PageShell, SPLIT_COLUMNS, STICKY_COLUMN } from "../components/ui/PageShell";
import type { JobListItemResponse } from "../types/api.generated";
import { formatDateMinute } from "../utils/format";
import { jobPath, navigateTo, SUMMARIES_ALL_PATH } from "../utils/routing";
import { useConfirmDelete } from "../utils/useConfirmDelete";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { useListPolling } from "../utils/useListPolling";
import { useReloadableResource } from "../utils/useReloadableResource";
import { isJobInProgress } from "../utils/utils";

export function JobsPage({ jobId }: { jobId: string | null }) {
  useDocumentTitle("Zadania");

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

  // The address is the selection: opening /jobs/<id> directly and clicking a row take the same path.
  const selectedJobResource = useReloadableResource(
    async () => (jobId ? await getJobStatus(jobId) : null),
    jobId ?? "",
    "Nie udało się pobrać szczegółów joba",
  );
  const selectedJob = selectedJobResource.data;

  useListPolling(
    selectedJobResource.reload,
    true,
    selectedJob !== null && isJobInProgress(selectedJob.status),
  );

  const deleteJobConfirm = useConfirmDelete<JobListItemResponse>({
    title: "Usunąć job?",
    message: (job) => `Usunąć "${job.title}" (${job.source_url})?`,
    onConfirm: async (job) => {
      await deleteJob(job.job_id);
    },
    errorPrefix: "Nie udało się usunąć joba",
    afterConfirm: (job) => {
      if (jobId === job.job_id) navigateTo(SUMMARIES_ALL_PATH);
      return jobsResource.reload();
    },
  });

  return (
    <PageShell className={jobId ? SPLIT_COLUMNS : undefined}>
      <section className={jobId ? STICKY_COLUMN : "min-w-0"}>
        <div className="panel-shell grid gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2>Gotowe podsumowania</h2>
            <span className="text-muted">{jobs.length}</span>
          </div>

          {jobsResource.errorMessage ? (
            <Alert tone="danger">{jobsResource.errorMessage}</Alert>
          ) : null}
          {selectedJobResource.errorMessage ? (
            <Alert tone="danger">{selectedJobResource.errorMessage}</Alert>
          ) : null}
          {jobsResource.isInitialLoading ? <p className="text-muted">Ładowanie listy...</p> : null}
          {!jobsResource.isInitialLoading && jobs.length === 0 ? (
            <p className="text-muted">Brak wyników.</p>
          ) : null}

          <ul aria-live="polite" className="grid min-w-0 gap-2">
            {jobs.map((job) => (
              <li key={job.job_id} className="relative min-w-0">
                <AppLink
                  href={jobPath(job.job_id)}
                  className={listItemClasses(jobId === job.job_id)}
                  aria-current={jobId === job.job_id ? "page" : undefined}
                >
                  <span className="mono-value block overflow-hidden text-ellipsis whitespace-nowrap pr-8 text-link">
                    {job.source_url}
                  </span>
                  <span className="block text-ink line-clamp-1">{job.title}</span>
                  <span className="flex gap-3 text-xs text-muted">
                    <StatusLabel status={job.status} />
                    <span>
                      {job.model_provider}:{job.model_name}
                    </span>
                    {job.updated_at && <span>{formatDateMinute(job.updated_at)}</span>}
                  </span>
                </AppLink>
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
        isOpen={Boolean(jobId)}
        sourceUrl={selectedJob?.source_url ?? null}
        jobs={selectedJob ? [selectedJob] : []}
        isLoading={selectedJobResource.isInitialLoading}
        onClose={() => navigateTo(SUMMARIES_ALL_PATH)}
        debugMode
      />

      {deleteJobConfirm.dialogProps ? <ConfirmDialog {...deleteJobConfirm.dialogProps} /> : null}
    </PageShell>
  );
}
