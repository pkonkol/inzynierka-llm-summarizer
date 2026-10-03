import { useEffect, useState } from "react";

import type { JobListItemResponse } from "../types/api.generated";
import { isJobInProgress } from "../utils/jobs";
import { jobPath } from "../utils/routing";
import { StatusLabel } from "./StatusLabel";
import { AppLink } from "./ui/AppLink";
import { listItemClasses } from "./ui/listItem";
import { PageSection } from "./ui/PageShell";

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

function JobActivityRow({ job, now }: { job: JobListItemResponse; now: number }) {
  return (
    <AppLink href={jobPath(job.job_id)} className={listItemClasses(false)}>
      <span className="break-all text-body underline">{job.source_url}</span>
      <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-mute">
        <StatusLabel status={job.status} />
        <span>
          {job.model_provider}:{job.model_name}
        </span>
        {isJobInProgress(job.status) ? (
          <span className="tabular-nums">
            {formatElapsed(now - new Date(job.updated_at).getTime())}
          </span>
        ) : (
          <span className="text-ink underline">Zobacz</span>
        )}
      </span>
    </AppLink>
  );
}

export function JobActivityPanel({ jobs }: { jobs: JobListItemResponse[] }) {
  const inProgressCount = jobs.filter((job) => isJobInProgress(job.status)).length;
  const now = useSecondsTick(inProgressCount > 0);

  // The region is always mounted: a live region only announces what is inserted after it exists.
  return (
    <div aria-live="polite">
      {jobs.length > 0 ? (
        <PageSection
          title={inProgressCount > 0 ? "W trakcie" : "Zakończone"}
          trailing={
            <span className="text-caption text-mute">
              {inProgressCount > 0 ? inProgressCount : jobs.length}
            </span>
          }
        >
          <ul className="grid min-w-0">
            {jobs.map((job) => (
              <li key={job.job_id} className="min-w-0 border-b border-hairline">
                <JobActivityRow job={job} now={now} />
              </li>
            ))}
          </ul>
        </PageSection>
      ) : null}
    </div>
  );
}
