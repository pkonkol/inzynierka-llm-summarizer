import { useEffect, useState } from "react";

import { createSummaryJob, getJobsForUrl, listSummarizedUrls } from "../api/client";
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
import { useJobCompletionWatch } from "../utils/useJobCompletionWatch";
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

  const { watchJob } = useJobCompletionWatch((status) => setSelectedUrl(status.source_url));

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
      onSuccess: (created) => {
        watchJob(created.job_id);
        return urlListResource.reload();
      },
    },
  );

  useListPolling(
    urlListResource.reload,
    urlList.some((item) => item.pending_count > 0),
  );

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

        {urlListResource.errorMessage ? (
          <Alert tone="danger">{urlListResource.errorMessage}</Alert>
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
