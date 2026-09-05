import { useEffect, useState } from "react";

import {
  createSummaryJob,
  errorText,
  getJobStatus,
  getJobsForUrl,
  listSummarizedUrls,
} from "../api/client";
import { CompletedJobsList } from "../components/CompletedJobsList";
import { useFlash } from "../components/FlashProvider";
import { SummaryDetailPanel } from "../components/SummaryDetailPanel";
import { UrlSubmitCard } from "../components/UrlSubmitCard";
import { cn } from "../components/ui/cn";
import { PageShell, SPLIT_COLUMNS, STICKY_COLUMN } from "../components/ui/PageShell";
import type { JobStatusResponse, UrlSummaryListItem } from "../types/api.generated";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { useListPolling } from "../utils/useListPolling";

const ACTIVE_JOB_POLL_MS = 2_500;

export function HomePage() {
  useDocumentTitle("Podsumowania");
  const [urlList, setUrlList] = useState<UrlSummaryListItem[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [detailJobs, setDetailJobs] = useState<JobStatusResponse[]>([]);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const showFlash = useFlash();

  const hasDetailOpen = Boolean(selectedUrl);

  const loadUrlList = async () => {
    const data = await listSummarizedUrls(50);
    setUrlList(data);
  };

  const loadDetailForUrl = async (url: string) => {
    setIsLoadingDetail(true);
    try {
      setDetailJobs(await getJobsForUrl(url, "completed"));
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const submitSummary = async (
    url: string,
    model_provider: string,
    model_name: string,
    language: string,
    summary_mode: string,
    run_deepeval: boolean,
  ) => {
    setIsSubmitting(true);
    showFlash("Zadanie zostało utworzone. Trwa analiza artykułu...");
    try {
      const created = await createSummaryJob(
        url,
        model_provider,
        model_name,
        language,
        summary_mode,
        run_deepeval,
      );
      setActiveJobId(created.job_id);
      await loadUrlList();
    } catch (error) {
      showFlash(`Nie udało się utworzyć joba: ${errorText(error)}`, "danger");
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const initialize = async () => {
      try {
        const listResult = await listSummarizedUrls(50);
        if (!isMounted) return;
        setUrlList(listResult);
      } finally {
        if (isMounted) setIsLoadingList(false);
      }
    };
    void initialize();
    return () => {
      isMounted = false;
    };
  }, []);

  useListPolling(
    loadUrlList,
    urlList.some((item) => item.pending_count > 0),
  );

  useEffect(() => {
    if (!selectedUrl) {
      setDetailJobs([]);
      return;
    }
    void loadDetailForUrl(selectedUrl);
  }, [selectedUrl]);

  useEffect(() => {
    if (!activeJobId) return;
    const poll = async () => {
      try {
        const status = await getJobStatus(activeJobId);
        if (status.status === "completed") {
          showFlash("Podsumowanie gotowe.");
          setActiveJobId(null);
          setSelectedUrl(status.source_url);
        } else if (status.status === "failed") {
          showFlash(`Job zakończył się błędem: ${status.error ?? "nieznany błąd"}`, "danger");
          setActiveJobId(null);
        }
      } catch (error) {
        showFlash(`Nie udało się odczytać statusu joba: ${errorText(error)}`, "danger");
        setActiveJobId(null);
      }
    };
    const interval = setInterval(() => {
      void poll();
    }, ACTIVE_JOB_POLL_MS);
    void poll();
    return () => clearInterval(interval);
  }, [activeJobId]);

  return (
    <PageShell className={hasDetailOpen ? SPLIT_COLUMNS : undefined}>
      <section
        className={cn("grid content-start gap-6", hasDetailOpen ? STICKY_COLUMN : "min-w-0")}
      >
        {!hasDetailOpen ? (
          <UrlSubmitCard onSubmit={submitSummary} isSubmitting={isSubmitting} />
        ) : null}

        <CompletedJobsList
          urls={urlList}
          selectedUrl={selectedUrl}
          isLoading={isLoadingList}
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
