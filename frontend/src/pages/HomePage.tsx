import { useCallback, useEffect, useRef, useState } from "react";

import {
  createSummaryJob,
  errorText,
  getJobStatus,
  getJobsForUrl,
  listAllJobsFlat,
  listSummarizedUrls,
} from "../api/client";
import { CompletedJobsList } from "../components/CompletedJobsList";
import { useFlash } from "../components/FlashProvider";
import { JobActivityPanel } from "../components/JobActivityPanel";
import { SummaryDetailPanel } from "../components/SummaryDetailPanel";
import { SummarySubmitCard } from "../components/SummarySubmitCard";
import { Alert } from "../components/ui/Alert";
import { cn } from "../components/ui/cn";
import { PageShell, SPLIT_COLUMNS, STICKY_COLUMN } from "../components/ui/PageShell";
import type {
  JobCreateRequest,
  JobListItemResponse,
  JobStatusResponse,
} from "../types/api.generated";
import { useAsyncAction } from "../utils/useAsyncAction";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { useListPolling } from "../utils/useListPolling";
import { useReloadableResource } from "../utils/useReloadableResource";

export function HomePage() {
  useDocumentTitle("Podsumowania");
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [detailJobs, setDetailJobs] = useState<JobStatusResponse[]>([]);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const hasDetailOpen = Boolean(selectedUrl);
  const showFlash = useFlash();

  const urlListResource = useReloadableResource(
    () => listSummarizedUrls(50),
    "",
    "Nie udało się pobrać listy podsumowań",
  );
  // null means "no answer yet" — a real third state, not a missing value.
  const urlList = urlListResource.data ?? [];

  const activeJobsResource = useReloadableResource(
    () => listAllJobsFlat(50, ["pending", "running"]),
    "",
    "Nie udało się pobrać listy zadań w toku",
  );
  const activeJobs = activeJobsResource.data ?? [];

  // Cleared by leaving the page: the panel reports this visit, and the jobs list is the archive.
  const [finishedJobsThisVisit, setFinishedJobsThisVisit] = useState<JobListItemResponse[]>([]);
  const activeJobIds = new Set(activeJobs.map((job) => job.job_id));
  const jobActivityRows = [
    // A resumed job is back in the polled list, so its finished row would be a duplicate.
    ...activeJobs,
    ...finishedJobsThisVisit.filter((job) => !activeJobIds.has(job.job_id)),
  ];

  useListPolling(activeJobsResource.reload, activeJobs.length > 0);
  useListPolling(
    urlListResource.reload,
    urlList.some((item) => item.pending_count > 0),
  );

  const submitSummary = useAsyncAction(
    async (payload: JobCreateRequest) => {
      // Optimistic: it announces the queued job, so it cannot be a successMessage.
      showFlash("Zadanie zostało utworzone. Trwa analiza artykułu...");
      return createSummaryJob(payload);
    },
    {
      errorPrefix: "Nie udało się utworzyć joba",
      onSuccess: () => activeJobsResource.reload(),
    },
  );

  const announceFinishedJobs = useCallback(
    async (finishedJobs: JobListItemResponse[]) => {
      for (const finishedJob of finishedJobs) {
        const jobId = finishedJob.job_id;
        try {
          const status = await getJobStatus(jobId);
          setFinishedJobsThisVisit((rows) => [...rows, { ...finishedJob, status: status.status }]);
          const openJobAction = { label: "Zobacz podsumowanie", href: `/jobs/${jobId}` };
          // An article URL is long enough that the notification would fold it out of sight.
          const jobLabel = status.summary_data?.title || status.source_url;
          if (status.status === "completed") {
            showFlash(`Podsumowanie gotowe: ${jobLabel}`, "success", openJobAction);
          } else {
            showFlash(`Job zakończył się błędem: ${status.error ?? "nieznany błąd"}`, "danger", {
              ...openJobAction,
              label: "Zobacz szczegóły",
            });
          }
        } catch (error) {
          showFlash(`Nie udało się odczytać statusu joba: ${errorText(error)}`, "danger");
        }
      }
      await urlListResource.reload();
    },
    [showFlash, urlListResource.reload],
  );

  // A job that was in the in-progress list and is no longer there has reached a terminal state.
  // The list is the source, so any number of jobs can run at once and each still reports itself.
  // Whole entries are kept: the vanished one is what the panel goes on showing, restated as done.
  const previousActiveJobsRef = useRef<JobListItemResponse[] | null>(null);
  useEffect(() => {
    if (activeJobsResource.data === null) return;
    const currentJobs = activeJobsResource.data;
    const previousJobs = previousActiveJobsRef.current;
    previousActiveJobsRef.current = currentJobs;
    if (previousJobs === null) return;

    const finishedJobs = previousJobs.filter(
      (job) => !currentJobs.some((currentJob) => currentJob.job_id === job.job_id),
    );
    if (finishedJobs.length > 0) void announceFinishedJobs(finishedJobs);
  }, [activeJobsResource.data, announceFinishedJobs]);

  useEffect(() => {
    if (!selectedUrl) {
      setDetailJobs([]);
      return;
    }
    let isCurrentSelection = true;
    setIsLoadingDetail(true);
    void getJobsForUrl(selectedUrl, "completed")
      .then((jobs) => {
        // A slower response for a previously selected url must not replace the current one.
        if (isCurrentSelection) setDetailJobs(jobs);
      })
      .finally(() => {
        if (isCurrentSelection) setIsLoadingDetail(false);
      });
    return () => {
      isCurrentSelection = false;
    };
  }, [selectedUrl]);

  return (
    <PageShell className={hasDetailOpen ? SPLIT_COLUMNS : undefined}>
      <section
        className={cn("grid content-start gap-6", hasDetailOpen ? STICKY_COLUMN : "min-w-0")}
      >
        {!hasDetailOpen ? (
          <SummarySubmitCard onSubmit={submitSummary.run} isSubmitting={submitSummary.isPending} />
        ) : null}

        <JobActivityPanel jobs={jobActivityRows} />

        {urlListResource.errorMessage ? (
          <Alert tone="danger">{urlListResource.errorMessage}</Alert>
        ) : null}
        {activeJobsResource.errorMessage ? (
          <Alert tone="danger">{activeJobsResource.errorMessage}</Alert>
        ) : null}

        <CompletedJobsList
          urls={urlList}
          selectedUrl={selectedUrl}
          isLoading={urlListResource.isInitialLoading}
          onSelectUrl={setSelectedUrl}
        />
      </section>

      <SummaryDetailPanel
        isOpen={hasDetailOpen}
        sourceUrl={selectedUrl}
        jobs={detailJobs}
        isLoading={isLoadingDetail}
        onClose={() => setSelectedUrl(null)}
      />
    </PageShell>
  );
}
