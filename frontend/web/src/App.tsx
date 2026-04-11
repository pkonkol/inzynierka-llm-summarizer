import { useEffect, useMemo, useState } from "react";

import { createSummaryJob, getJobStatus, listCompletedJobs } from "./api/client";
import { CompletedJobsList } from "./components/CompletedJobsList";
import { JobDetailPanel } from "./components/JobDetailPanel";
import { UrlSubmitCard } from "./components/UrlSubmitCard";
import type { JobListItem, JobStatus } from "./types/api";

const LIST_REFRESH_MS = 20_000;
const POLLING_MS = 2_500;

function App() {
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobStatus | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);

  const hasDetailOpen = useMemo(() => Boolean(selectedJobId), [selectedJobId]);

  const loadCompletedJobs = async () => {
    const data = await listCompletedJobs(50);
    setJobs(data);
  };

  const loadJobDetail = async (jobId: string) => {
    setIsLoadingDetail(true);
    try {
      const detail = await getJobStatus(jobId);
      setSelectedJob(detail);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleSubmit = async (url: string) => {
    setIsSubmitting(true);
    setFlashMessage("Zadanie zostalo utworzone. Trwa analiza artykulu...");

    try {
      const created = await createSummaryJob(url);
      setActiveJobId(created.job_id);
    } catch (error) {
      setFlashMessage(`Nie udalo sie utworzyc joba: ${String(error)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      try {
        const data = await listCompletedJobs(50);
        if (isMounted) {
          setJobs(data);
        }
      } finally {
        if (isMounted) {
          setIsLoadingJobs(false);
        }
      }
    };

    void initialize();

    const interval = setInterval(() => {
      void loadCompletedJobs();
    }, LIST_REFRESH_MS);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!selectedJobId) {
      setSelectedJob(null);
      return;
    }

    void loadJobDetail(selectedJobId);
  }, [selectedJobId]);

  useEffect(() => {
    if (!activeJobId) {
      return;
    }

    const poll = async () => {
      try {
        const status = await getJobStatus(activeJobId);
        if (status.status === "completed") {
          setFlashMessage("Podsumowanie gotowe. Mozesz podejrzec wynik po prawej.");
          setActiveJobId(null);
          await loadCompletedJobs();
          setSelectedJobId(status.job_id);
        }

        if (status.status === "failed") {
          setFlashMessage(`Job zakonczyl sie bledem: ${status.error ?? "nieznany blad"}`);
          setActiveJobId(null);
        }
      } catch (error) {
        setFlashMessage(`Blad podczas odczytu statusu: ${String(error)}`);
        setActiveJobId(null);
      }
    };

    const interval = setInterval(() => {
      void poll();
    }, POLLING_MS);

    void poll();

    return () => clearInterval(interval);
  }, [activeJobId]);

  useEffect(() => {
    if (!flashMessage) {
      return;
    }

    const timeout = setTimeout(() => {
      setFlashMessage(null);
    }, 4500);

    return () => clearTimeout(timeout);
  }, [flashMessage]);

  return (
    <div className="page-shell">
      <div className="page-glow page-glow-top" aria-hidden="true" />
      <div className="page-glow page-glow-bottom" aria-hidden="true" />

      <main className={hasDetailOpen ? "layout has-panel" : "layout"}>
        <section className={hasDetailOpen ? "left-column focused" : "left-column"}>
          {!hasDetailOpen ? <UrlSubmitCard onSubmit={handleSubmit} isSubmitting={isSubmitting} /> : null}

          {flashMessage ? <div className="flash-message">{flashMessage}</div> : null}

          <CompletedJobsList
            jobs={jobs}
            selectedJobId={selectedJobId}
            isLoading={isLoadingJobs}
            onSelectJob={setSelectedJobId}
          />
        </section>

        <JobDetailPanel
          isOpen={hasDetailOpen}
          job={selectedJob}
          isLoading={isLoadingDetail}
          onClose={() => setSelectedJobId(null)}
        />
      </main>
    </div>
  );
}

export default App;
