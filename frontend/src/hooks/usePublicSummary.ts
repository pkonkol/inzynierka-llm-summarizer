import { useCallback, useRef, useState } from "react";

import { createPublicSummaryJob, errorText, getJobStatus } from "../api/client";
import type {
  ContextExpansionResult,
  FactCheck,
  PublicSummarizeRequest,
  RelatedSource,
  SummaryResponse,
} from "../types/api.generated";
import { isJobInProgress, MAX_PUBLIC_PASTED_CHARS } from "../utils/jobs";
import { logger } from "../utils/logger";
import { useListPolling } from "./useListPolling";

export type FactCheckView =
  | { status: "working" }
  | { status: "failed"; message: string }
  | { status: "completed"; text: string; sources: RelatedSource[] };

export type PublicSummaryState =
  | { phase: "idle" }
  | { phase: "working" }
  | {
      phase: "done";
      summary: SummaryResponse;
      durationMs: number;
      contextExpansion: ContextExpansionResult | null;
      factCheck: FactCheckView | null;
    }
  | { phase: "error"; message: string };

function toFactCheckView(factCheck: FactCheck): FactCheckView {
  if (isJobInProgress(factCheck.status)) return { status: "working" };
  if (factCheck.status === "failed") {
    if (factCheck.error === null) throw new Error("a failed fact check has no error");
    return { status: "failed", message: factCheck.error };
  }
  if (factCheck.text === null) throw new Error("a completed fact check has no text");
  return { status: "completed", text: factCheck.text, sources: factCheck.sources };
}

const FACT_CHECK_UNREACHABLE: FactCheckView = {
  status: "failed",
  message: "Nie udało się pobrać wyniku sprawdzania faktów.",
};

const GENERATION_FAILED_MESSAGE = "Nie udało się wygenerować podsumowania. Spróbuj ponownie.";

// Lives only in component state, so a reload starts clean: the page keeps nothing for the
// visitor. The job itself is still stored by the backend for debugging.
export function usePublicSummary() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [state, setState] = useState<PublicSummaryState>({ phase: "idle" });
  // Set together with jobId: a reply for a job the visitor has already moved on from is dropped.
  const activeJobIdRef = useRef<string | null>(null);

  const trackJob = useCallback((nextJobId: string | null) => {
    activeJobIdRef.current = nextJobId;
    setJobId(nextJobId);
  }, []);

  const submit = useCallback(
    async (payload: PublicSummarizeRequest) => {
      setState({ phase: "working" });
      try {
        const { job_id } = await createPublicSummaryJob(payload);
        trackJob(job_id);
      } catch (error) {
        setState({ phase: "error", message: `Nie udało się podsumować: ${errorText(error)}` });
      }
    },
    [trackJob],
  );

  const reloadJob = useCallback(async () => {
    if (jobId === null) return;
    try {
      const job = await getJobStatus(jobId);
      if (activeJobIdRef.current !== jobId || isJobInProgress(job.status)) return;

      if (job.status === "completed" && job.summary_data !== null) {
        const factCheck = job.fact_check === null ? null : toFactCheckView(job.fact_check);
        // The summary shows at once; polling goes on until the fact check under it settles.
        if (factCheck?.status !== "working") trackJob(null);
        setState({
          phase: "done",
          summary: job.summary_data,
          durationMs: job.duration_ms,
          contextExpansion: job.context_expansion,
          factCheck,
        });
        return;
      }
      trackJob(null);
      logger.warn("public summary job did not complete", { jobId, status: job.status });
      setState({
        phase: "error",
        message:
          job.error_code === "source_too_long"
            ? `Artykuł jest za długi. Limit to ${MAX_PUBLIC_PASTED_CHARS.toLocaleString("pl-PL")} znaków.`
            : job.error_code === "context_expansion_failed"
              ? "Nie udało się pobrać kontekstu z sieci. Spróbuj ponownie albo bez tej opcji."
              : GENERATION_FAILED_MESSAGE,
      });
    } catch (error) {
      if (activeJobIdRef.current !== jobId) return;
      trackJob(null);
      // A summary already on screen stays; only the fact check still being fetched is lost.
      setState((current) =>
        current.phase === "done"
          ? { ...current, factCheck: FACT_CHECK_UNREACHABLE }
          : { phase: "error", message: `Nie udało się pobrać podsumowania: ${errorText(error)}` },
      );
    }
  }, [jobId, trackJob]);

  // Shows the result of a job created elsewhere (the browser extension).
  const followJob = useCallback(
    (handedOverJobId: string) => {
      setState({ phase: "working" });
      trackJob(handedOverJobId);
    },
    [trackJob],
  );

  useListPolling(reloadJob, true, jobId !== null);

  return { state, submit, followJob };
}
