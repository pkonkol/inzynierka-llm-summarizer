import { deleteJob, getJobStatus, listAllJobsFlat } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { StatusLabel } from "../components/StatusLabel";
import { SummaryDetailPanel } from "../components/SummaryDetailPanel";
import { Alert } from "../components/ui/Alert";
import { AppLink } from "../components/ui/AppLink";
import { DangerAction } from "../components/ui/DangerAction";
import { listItemClasses } from "../components/ui/listItem";
import { PageSection, PageShell, SPLIT_COLUMNS, STICKY_COLUMN } from "../components/ui/PageShell";
import { useConfirmDelete } from "../hooks/useConfirmDelete";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useListPolling } from "../hooks/useListPolling";
import { useReloadableResource } from "../hooks/useReloadableResource";
import type { JobListItemResponse } from "../types/api.generated";
import { formatDateMinute } from "../utils/format";
import { isJobInProgress } from "../utils/jobs";
import { jobPath, navigateTo, SUMMARIES_ALL_PATH } from "../utils/routing";

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
        <PageSection
          title="Gotowe podsumowania"
          trailing={<span className="text-caption text-mute">{jobs.length}</span>}
        >
          {jobsResource.errorMessage ? (
            <Alert tone="danger">{jobsResource.errorMessage}</Alert>
          ) : null}
          {selectedJobResource.errorMessage ? (
            <Alert tone="danger">{selectedJobResource.errorMessage}</Alert>
          ) : null}
          {jobsResource.isInitialLoading ? <p className="text-mute">Ładowanie listy...</p> : null}
          {!jobsResource.isInitialLoading && jobs.length === 0 ? (
            <p className="text-mute">Brak wyników.</p>
          ) : null}

          <ul aria-live="polite" className="grid min-w-0">
            {jobs.map((job) => (
              <li
                key={job.job_id}
                className="flex min-w-0 items-start justify-between gap-4 border-b border-hairline"
              >
                <AppLink
                  href={jobPath(job.job_id)}
                  className={listItemClasses(jobId === job.job_id)}
                  aria-current={jobId === job.job_id ? "page" : undefined}
                >
                  <span className="line-clamp-1 font-medium underline">{job.title}</span>
                  <span className="truncate text-caption text-mute">{job.source_url}</span>
                  <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-mute">
                    <StatusLabel status={job.status} />
                    {job.origin === "public" ? (
                      <span className="badge">
                        <span aria-hidden="true">◌ </span>publiczne
                      </span>
                    ) : null}
                    <span>
                      {job.model_provider}:{job.model_name}
                    </span>
                    {job.updated_at && <span>{formatDateMinute(job.updated_at)}</span>}
                  </span>
                </AppLink>
                <DangerAction
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteJobConfirm.request(job);
                  }}
                  aria-label="Usuń job"
                  className="py-2"
                >
                  Usuń
                </DangerAction>
              </li>
            ))}
          </ul>
        </PageSection>
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
