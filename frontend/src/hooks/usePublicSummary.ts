import { useCallback, useRef, useState } from "react";

import { createPublicSummaryJob, errorText, getJobStatus, requestFactCheck } from "../api/client";
import type {
  AssessedSource,
  ContextExpansionResult,
  FactCheck,
  PublicSummarizeRequest,
  SummaryResponse,
} from "../types/api.generated";
import { isJobInProgress, MAX_PUBLIC_PASTED_CHARS } from "../utils/jobs";
import { logger } from "../utils/logger";
import { useListPolling } from "./useListPolling";

export type FactCheckView =
  | { status: "idle" }
  | { status: "working" }
  | { status: "failed"; message: string }
  | { status: "completed"; text: string; sources: AssessedSource[] };

export type PublicSummaryState =
  | { phase: "idle" }
  | { phase: "working" }
  | {
      phase: "done";
      jobId: string;
      summary: SummaryResponse;
      durationMs: number;
      contextExpansion: ContextExpansionResult | null;
      factCheck: FactCheckView;
      isFactCheckFirst: boolean;
    }
  | { phase: "error"; message: string };

function toFactCheckView(factCheck: FactCheck | null): FactCheckView {
  if (factCheck === null) return { status: "idle" };
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
      trackJob(null);
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
        const factCheck = toFactCheckView(job.fact_check);
        // The summary shows at once; polling goes on until the fact check under it settles.
        if (factCheck.status !== "working") trackJob(null);
        setState({
          phase: "done",
          jobId,
          summary: job.summary_data,
          durationMs: job.duration_ms,
          contextExpansion: job.context_expansion,
          factCheck,
          isFactCheckFirst: job.check_facts_on_completion,
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

  // Polling stopped once the summary settled; it starts again for the fact check. A fact check the
  // server already has, e.g. when a poll failed while it ran, is followed again: requesting it
  // twice would only get a 409.
  const checkFacts = useCallback(async () => {
    if (state.phase !== "done") throw new Error("facts can be checked only under a summary");
    const doneJobId = state.jobId;
    const setFactCheck = (factCheck: FactCheckView) => {
      setState((current) =>
        current.phase === "done" && current.jobId === doneJobId
          ? { ...current, factCheck }
          : current,
      );
    };

    setFactCheck({ status: "working" });
    try {
      const job = await getJobStatus(doneJobId);
      const isStartable = job.fact_check === null || job.fact_check.status === "failed";
      if (isStartable) await requestFactCheck(doneJobId);
      trackJob(doneJobId);
    } catch (error) {
      setFactCheck({
        status: "failed",
        message: `Nie udało się sprawdzić faktów: ${errorText(error)}`,
      });
    }
  }, [state, trackJob]);

  // Shows the result of a job created elsewhere (the browser extension).
  const followJob = useCallback(
    (handedOverJobId: string) => {
      setState({ phase: "working" });
      trackJob(handedOverJobId);
    },
    [trackJob],
  );

  useListPolling(reloadJob, true, jobId !== null);

  return { state, submit, followJob, checkFacts };
}
