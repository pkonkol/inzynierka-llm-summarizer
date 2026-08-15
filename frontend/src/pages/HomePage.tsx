import { useEffect, useState } from "react";

import {
  createSummaryJob,
  errorText,
  getJobStatus,
  getJobsForUrl,
  listSummarizedUrls,
} from "../api/client";
import { CompletedJobsList } from "../components/CompletedJobsList";
import { SummaryDetailPanel } from "../components/SummaryDetailPanel";
import { UrlSubmitCard } from "../components/UrlSubmitCard";
import { cn } from "../components/ui/cn";
import { PageShell, SPLIT_COLUMNS, STICKY_COLUMN } from "../components/ui/PageShell";
import { Toast } from "../components/ui/Toast";
import type { JobStatus, SummaryUrlListItem } from "../types/api";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { useFlashMessage } from "../utils/useFlashMessage";

const LIST_REFRESH_MS = 20_000;
const POLLING_MS = 2_500;

export function HomePage() {
  useDocumentTitle("Podsumowania");
  const [urlList, setUrlList] = useState<SummaryUrlListItem[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [detailJobs, setDetailJobs] = useState<JobStatus[]>([]);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const { flash, showFlash, dismissFlash } = useFlashMessage();

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
    const interval = setInterval(() => {
      void loadUrlList();
    }, LIST_REFRESH_MS);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

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
          await loadUrlList();
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
    }, POLLING_MS);
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

      <Toast flash={flash} onDismiss={dismissFlash} />
    </PageShell>
  );
}
