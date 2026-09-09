import { useEffect, useState } from "react";

import type { JobListItemResponse } from "../types/api.generated";
import { navigateTo, shouldInterceptClick } from "../utils/routing";
import { StatusLabel } from "./StatusLabel";
import { listItemClasses } from "./ui/listItem";

function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const seconds = totalSeconds % 60;
  return `${Math.floor(totalSeconds / 60)}:${String(seconds).padStart(2, "0")}`;
}

// A counter that visibly moves is what separates "still working" from "hung" at a glance.
function useSecondsTick(isRunning: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isRunning) return;
    const intervalId = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(intervalId);
  }, [isRunning]);

  return now;
}

export function ActiveJobsPanel({ jobs }: { jobs: JobListItemResponse[] }) {
  const now = useSecondsTick(jobs.length > 0);

  // The region is always mounted: a live region only announces what is inserted after it exists.
  return (
    <div aria-live="polite">
      {jobs.length > 0 ? (
        <section className="panel-shell grid gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2>W trakcie</h2>
            <span className="text-muted">{jobs.length}</span>
          </div>

          <ul className="grid min-w-0 gap-2">
            {jobs.map((job) => (
              <li key={job.job_id} className="min-w-0">
                <a
                  href={`/jobs/${job.job_id}`}
                  className={listItemClasses(false)}
                  onClick={(event) => {
                    if (!shouldInterceptClick(event)) return;
                    event.preventDefault();
                    navigateTo(`/jobs/${job.job_id}`);
                  }}
                >
                  <span className="mono-value block break-all text-link">{job.source_url}</span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="inline-block size-2 animate-pulse rounded-full bg-warning"
                      />
                      <StatusLabel status={job.status} />
                    </span>
                    <span>
                      {job.model_provider}:{job.model_name}
                    </span>
                    <span>{formatElapsed(now - new Date(job.updated_at).getTime())}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
