import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { errorText, getJobStatus } from "../api/client";
import { Button } from "../components/ui/Button";
import { DisclosureSections } from "../components/ui/DisclosureSections";
import { SectionHeading } from "../components/ui/PageShell";
import type { DeepevalItem, JobMetrics, JobStatusResponse } from "../types/api.generated";
import type { JobStatusValue, PromptMessage } from "../types/local";
import { formatDateMinute, formatDuration, formatMetricLabel } from "../utils/format";
import { DeepevalItems } from "./DeepevalItems";
import { InfoRow } from "./InfoRow";
import { PreBlock } from "./PreBlock";

interface JobDetailPanelProps {
  sourceUrl: string | null;
  jobs: JobStatusResponse[];
  isOpen: boolean;
  isLoading: boolean;
  onClose: () => void;
  debugMode?: boolean;
}

const METRIC_SECTIONS = [
  { key: "source", label: "Źródło", field: "source" as const },
  { key: "summary", label: "Podsumowanie", field: "summary" as const },
  { key: "key_takeaways", label: "Punkty kluczowe", field: "key_takeaways" as const },
] as const;

function MetricsSection({
  metrics,
  deepevalMetrics,
}: {
  metrics: JobMetrics;
  deepevalMetrics: DeepevalItem[];
}) {
  const defaultMetricsBlocks = METRIC_SECTIONS.map((section) => {
    const data = metrics[section.field];
    if (!data) return null;

    const gridItems = Object.entries(data).map(([k, v]) => (
      <InfoRow key={k} label={formatMetricLabel(k)} value={v} />
    ));

    return (
      <div key={section.key} className="grid gap-2">
        <SectionHeading>{section.label}</SectionHeading>
        <div className="metric-row">{gridItems}</div>
      </div>
    );
  });

  const deepevalBlock =
    deepevalMetrics.length > 0 ? (
      <div className="grid gap-3 border-t border-panel-border pt-4">
        <SectionHeading>Deepeval</SectionHeading>
        <DeepevalItems items={deepevalMetrics} />
      </div>
    ) : null;

  return (
    <div className="grid gap-4 p-3">
      {defaultMetricsBlocks}
      {deepevalBlock}
    </div>
  );
}

function useFullJob(jobId: string) {
  const [job, setJob] = useState<JobStatusResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    getJobStatus(jobId)
      .then((data) => {
        if (isMounted) setJob(data);
      })
      .catch((error: unknown) => {
        if (isMounted) setErrorMessage(`Nie udało się pobrać szczegółów: ${errorText(error)}`);
      });
    return () => {
      isMounted = false;
    };
  }, [jobId]);

  const placeholder = errorMessage ? (
    <p className="p-3 text-danger">{errorMessage}</p>
  ) : job ? null : (
    <p className="p-3 text-muted">Ładowanie...</p>
  );

  return { job, placeholder };
}

function PromptSection({ jobId }: { jobId: string }) {
  const { job, placeholder } = useFullJob(jobId);
  if (!job) return placeholder;

  const template: PromptMessage[] = job.prompt_template;
  const params = job.prompt_params;
  const inputText = job.input_text;

  let templateBlock = null;
  if (template.length > 0) {
    const renderedMessages = template.map(([role, content]) => (
      <div key={role} className="min-w-0 text-xs">
        <span className="label-caps font-semibold text-muted">{role}:</span>
        <PreBlock>{content}</PreBlock>
      </div>
    ));

    templateBlock = (
      <div className="grid min-w-0 gap-2">
        <h6>Szablon</h6>
        {renderedMessages}
      </div>
    );
  }

  let paramsBlock = null;
  if (params && Object.keys(params).length > 0) {
    paramsBlock = (
      <div className="grid min-w-0 gap-1">
        <h6>Parametry</h6>
        <PreBlock>{JSON.stringify(params, null, 2)}</PreBlock>
      </div>
    );
  }

  let inputBlock = null;
  if (inputText) {
    inputBlock = (
      <div className="grid min-w-0 gap-1">
        <h6>Tekst źródłowy</h6>
        <pre className="max-h-96 min-w-0 overflow-x-auto overflow-y-auto whitespace-pre-wrap wrap-break-word bg-subtle p-2">
          {inputText}
        </pre>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-3 p-3">
      {templateBlock}
      {paramsBlock}
      {inputBlock}
    </div>
  );
}

function RawMetadata({ jobId }: { jobId: string }) {
  const { job, placeholder } = useFullJob(jobId);
  if (!job) return placeholder;
  return <PreBlock>{JSON.stringify(job.raw_metadata, null, 2)}</PreBlock>;
}

function RawOutput({ jobId }: { jobId: string }) {
  const { job, placeholder } = useFullJob(jobId);
  if (!job) return placeholder;
  return <PreBlock>{job.raw_output}</PreBlock>;
}

function statusBadge(status: JobStatusValue) {
  if (status === "failed")
    return <span className="mono-value ml-2 uppercase text-danger">failed</span>;
  if (status === "pending")
    return <span className="mono-value ml-2 uppercase text-warning">pending</span>;
  return null;
}

function JobEntry({ job, defaultOpen = false }: { job: JobStatusResponse; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const modelLabel = job.model_name
    ? `${job.model_provider}:${job.model_name}`
    : job.model_provider;

  const header = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-subtle"
    >
      <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="mono-value font-semibold">
          {modelLabel}
          {statusBadge(job.status)}
        </span>
        <span className="text-xs text-muted">{formatDateMinute(job.created_at)}</span>
      </span>
      <span aria-hidden="true" className="shrink-0 pt-1 text-xs text-muted">
        {open ? "▼" : "▶"}
      </span>
    </button>
  );

  const details = open && (
    <div className="grid gap-4 border-t border-panel-border bg-subtle px-4 py-3 min-w-0 overflow-hidden">
      {job.status === "failed" && job.error ? (
        <section>
          <h4>Błąd</h4>
          <p className="text-danger">{job.error}</p>
        </section>
      ) : (
        <JobDetails job={job} />
      )}
    </div>
  );

  return (
    <div className="border border-panel-border min-w-0">
      {header}
      {details}
    </div>
  );
}

function JobDetails({ job }: { job: JobStatusResponse }) {
  const shouldRenderDetails = job.status !== "pending" && job.status !== "failed";
  if (!shouldRenderDetails) return null;

  const takeawaysMarkdown = (job.summary_data?.key_takeaways ?? [])
    .map((item) => `- ${item}`)
    .join("\n");

  return (
    <>
      <div className="metric-row">
        <InfoRow label="Wywołano" value={formatDateMinute(job.created_at)} />
        <InfoRow label="Czas generacji" value={formatDuration(job.duration_ms)} />
        <InfoRow label="Tokeny wejściowe" value={job.usage.input_tokens} />
        <InfoRow label="Tokeny wyjściowe" value={job.usage.output_tokens} />
        {job.usage.thinking_tokens > 0 ? (
          <InfoRow label="Tokeny rozumowania" value={job.usage.thinking_tokens} />
        ) : null}
        <InfoRow label="Tokeny łącznie" value={job.usage.total_tokens} />
        <InfoRow label="Tryb podsumowania" value={job.summary_mode} />
      </div>

      <section>
        <h4>Krótkie podsumowanie</h4>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{job.summary_data?.summary}</ReactMarkdown>
      </section>

      <section>
        <h4>Najważniejsze punkty</h4>
        <div className="grid gap-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_p]:whitespace-pre-wrap">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{takeawaysMarkdown}</ReactMarkdown>
        </div>
      </section>

      <DisclosureSections
        sections={[
          {
            key: "metrics",
            label: "Metryki",
            content: (
              <MetricsSection metrics={job.metrics} deepevalMetrics={job.deepeval_metrics} />
            ),
          },
          {
            key: "rawOutput",
            label: "Surowe wyjście",
            content: <RawOutput jobId={job.job_id} />,
          },
          {
            key: "prompt",
            label: "Prompt",
            content: <PromptSection jobId={job.job_id} />,
          },
          {
            key: "rawMetadata",
            label: "Surowe metadane",
            content: <RawMetadata jobId={job.job_id} />,
          },
        ]}
      />
    </>
  );
}

export function SummaryDetailPanel({
  sourceUrl,
  jobs,
  isOpen,
  isLoading,
  onClose,
  debugMode = false,
}: JobDetailPanelProps) {
  if (!isOpen) return null;
  if (isLoading) return <p className="text-muted">Ładowanie wyników...</p>;
  if (!sourceUrl) return null;

  const title = jobs[0]?.summary_data?.title || "";
  const jobsFilteredSorted = debugMode ? jobs : jobs.filter((job) => job.status === "completed");

  const sectionTitle = debugMode ? "Wynik" : "Wyniki dla modeli";

  return (
    <aside className="fixed inset-x-0 bottom-0 z-30 grid h-[75vh] content-start gap-4 overflow-y-auto border-t border-panel-border bg-panel-solid p-4 split:sticky split:top-4 split:z-auto split:h-[calc(100vh-2rem)] split:border split:p-6">
      <div className="flex items-center justify-between border-b border-panel-border pb-3">
        <h2>Szczegóły</h2>
        <Button variant="ghost" onClick={onClose}>
          Zamknij
        </Button>
      </div>

      <article className="grid gap-4 min-w-0">
        <h3>{title}</h3>

        <a
          href={sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="mono-value wrap-anywhere font-semibold no-underline"
        >
          {sourceUrl}
        </a>

        <section className="grid content-start gap-3 border-t border-panel-border pt-4 min-w-0">
          <h4>{sectionTitle}</h4>

          {jobsFilteredSorted.length === 0 ? (
            <p className="text-muted">Brak wyników.</p>
          ) : (
            jobsFilteredSorted.map((job, index) => (
              <JobEntry key={job.job_id} job={job} defaultOpen={index === 0} />
            ))
          )}
        </section>
      </article>
    </aside>
  );
}
