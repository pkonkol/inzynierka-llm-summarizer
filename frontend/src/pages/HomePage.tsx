import { useCallback, useEffect, useRef, useState } from "react";

import {
  createSummaryJob,
  errorText,
  getJobStatus,
  getJobsForUrl,
  listAllJobsFlat,
  listSummarizedUrls,
} from "../api/client";
import { ActiveJobsPanel } from "../components/ActiveJobsPanel";
import { CompletedJobsList } from "../components/CompletedJobsList";
import { useFlash } from "../components/FlashProvider";
import { SummaryDetailPanel } from "../components/SummaryDetailPanel";
import { UrlSubmitCard } from "../components/UrlSubmitCard";
import { Alert } from "../components/ui/Alert";
import { cn } from "../components/ui/cn";
import { PageShell, SPLIT_COLUMNS, STICKY_COLUMN } from "../components/ui/PageShell";
import type { JobStatusResponse } from "../types/api.generated";
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

  useListPolling(activeJobsResource.reload, activeJobs.length > 0);
  useListPolling(
    urlListResource.reload,
    urlList.some((item) => item.pending_count > 0),
  );

  const submitSummary = useAsyncAction(
    async (
      url: string,
      model_provider: string,
      model_name: string,
      language: string,
      summary_mode: string,
      run_deepeval: boolean,
    ) => {
      // Optimistic: it announces the queued job, so it cannot be a successMessage.
      showFlash("Zadanie zostało utworzone. Trwa analiza artykułu...");
      return createSummaryJob(
        url,
        model_provider,
        model_name,
        language,
        summary_mode,
        run_deepeval,
      );
    },
    {
      errorPrefix: "Nie udało się utworzyć joba",
      onSuccess: () => activeJobsResource.reload(),
    },
  );

  const announceFinishedJobs = useCallback(
    async (jobIds: string[]) => {
      for (const jobId of jobIds) {
        try {
          const status = await getJobStatus(jobId);
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
  const previousActiveJobIdsRef = useRef<string[] | null>(null);
  useEffect(() => {
    if (activeJobsResource.data === null) return;
    const currentIds = activeJobsResource.data.map((job) => job.job_id);
    const previousIds = previousActiveJobIdsRef.current;
    previousActiveJobIdsRef.current = currentIds;
    if (previousIds === null) return;

    const finishedIds = previousIds.filter((jobId) => !currentIds.includes(jobId));
    if (finishedIds.length > 0) void announceFinishedJobs(finishedIds);
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
          <UrlSubmitCard onSubmit={submitSummary.run} isSubmitting={submitSummary.isPending} />
        ) : null}

        <ActiveJobsPanel jobs={activeJobs} />

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
