import { useCallback, useState } from "react";

import { createPublicSummaryJob, errorText, getJobStatus } from "../api/client";
import type { PublicSummarizeRequest, SummaryResponse } from "../types/api.generated";
import { logger } from "./logger";
import { useListPolling } from "./useListPolling";
import { isJobInProgress, MAX_PUBLIC_PASTED_CHARS } from "./utils";

export type PublicSummaryState =
  | { phase: "idle" }
  | { phase: "working" }
  | { phase: "done"; summary: SummaryResponse; durationMs: number }
  | { phase: "error"; message: string };

const GENERATION_FAILED_MESSAGE = "Nie udało się wygenerować podsumowania. Spróbuj ponownie.";

// Lives only in component state, so a reload starts clean: the page keeps nothing for the
// visitor. The job itself is still stored by the backend for debugging.
export function usePublicSummary() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [state, setState] = useState<PublicSummaryState>({ phase: "idle" });

  const submit = useCallback(async (payload: PublicSummarizeRequest) => {
    setState({ phase: "working" });
    try {
      const { job_id } = await createPublicSummaryJob(payload);
      setJobId(job_id);
    } catch (error) {
      setState({ phase: "error", message: `Nie udało się podsumować: ${errorText(error)}` });
    }
  }, []);

  const reloadJob = useCallback(async () => {
    if (jobId === null) return;
    try {
      const job = await getJobStatus(jobId);
      if (isJobInProgress(job.status)) return;

      setJobId(null);
      if (job.status === "completed" && job.summary_data !== null) {
        setState({ phase: "done", summary: job.summary_data, durationMs: job.duration_ms });
        return;
      }
      logger.warn("public summary job did not complete", { jobId, status: job.status });
      setState({
        phase: "error",
        message:
          job.error_code === "source_too_long"
            ? `Artykuł jest za długi. Limit to ${MAX_PUBLIC_PASTED_CHARS.toLocaleString("pl-PL")} znaków.`
            : GENERATION_FAILED_MESSAGE,
      });
    } catch (error) {
      setJobId(null);
      setState({
        phase: "error",
        message: `Nie udało się pobrać podsumowania: ${errorText(error)}`,
      });
    }
  }, [jobId]);

  useListPolling(reloadJob, true, jobId !== null);

  return { state, submit };
}
