import { useEffect, useState } from "react";

import { errorText, getJobStatus } from "../api/client";
import type { JobStatusResponse } from "../types/api.generated";
import { isManualSource } from "../utils/jobs";
import { PUBLIC_HOME_PATH, redirectTo } from "../utils/routing";

/** The public page's form values for a job the browser extension created, plus the id to follow. */
export interface HandoffJob {
  jobId: string;
  content: string;
  presetKey: string;
  density: number;
  language: string;
}

export type HandoffState =
  | { phase: "none" }
  | { phase: "loading" }
  | { phase: "ready"; handoff: HandoffJob }
  | { phase: "error"; message: string };

/** What the source field shows for a job: its address, or the pasted text for a manual source. */
function jobSourceContent(job: JobStatusResponse): string {
  return isManualSource(job.source_url) ? job.input_text : job.source_url;
}

function toHandoffJob(job: JobStatusResponse, presetKey: string): HandoffJob {
  const length = job.summary_spec.length;
  if (length?.policy !== "scaled_to_input") {
    throw new Error(`handed-over job ${job.job_id} has no slider length`);
  }
  return {
    jobId: job.job_id,
    content: jobSourceContent(job),
    presetKey,
    density: length.slider,
    language: job.language,
  };
}

/** Reads ?job= and ?preset= once on mount, fetches the job, then clears the query from the address bar. */
export function useHandoffJob(): HandoffState {
  // Read during the first render, before the effect clears the query.
  const [query] = useState(() => new URLSearchParams(window.location.search));
  const jobId = query.get("job");
  const presetKey = query.get("preset");
  const [state, setState] = useState<HandoffState>(
    jobId === null ? { phase: "none" } : { phase: "loading" },
  );

  useEffect(() => {
    if (jobId === null) return;
    // A reload starts clean, the same as after any other summary on this page.
    redirectTo(PUBLIC_HOME_PATH);
    if (presetKey === null) {
      setState({
        phase: "error",
        message: "Link z rozszerzenia nie wskazuje rodzaju podsumowania.",
      });
      return;
    }

    let isMounted = true;
    getJobStatus(jobId)
      .then((job) => {
        if (isMounted) setState({ phase: "ready", handoff: toHandoffJob(job, presetKey) });
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setState({
            phase: "error",
            message: `Nie udało się pobrać podsumowania: ${errorText(error)}`,
          });
        }
      });
    return () => {
      isMounted = false;
    };
  }, [jobId, presetKey]);

  return state;
}
