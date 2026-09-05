import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "../components/ui/Button";
import { SectionHeading } from "../components/ui/PageShell";
import type { DeepevalItem, JobMetrics, JobStatusResponse } from "../types/api.generated";
import type { JobStatusValue, PromptMessage } from "../types/local";
import { formatDateMinute, formatDuration, formatMetricLabel } from "../utils/format";
import { Collapsible } from "./Collapsible";
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
    <Collapsible label="Metryki">
      <div className="grid gap-4 p-3">
        {defaultMetricsBlocks}
        {deepevalBlock}
      </div>
    </Collapsible>
  );
}

function PromptSection({
  template,
  params,
  inputText,
}: {
  template: PromptMessage[];
  params: Record<string, string>;
  inputText: string;
}) {
  if (template.length === 0 && !inputText) return null;

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
    <Collapsible label="Prompt">
      <div className="grid gap-3 p-3 min-w-0">
        {templateBlock}
        {paramsBlock}
        {inputBlock}
      </div>
    </Collapsible>
  );
}

function RawMetadata({ data }: { data: Record<string, unknown> }) {
  if (!data || Object.keys(data).length === 0) return null;

  const content = <PreBlock>{JSON.stringify(data, null, 2)}</PreBlock>;

  return <Collapsible label="Surowe metadane">{content}</Collapsible>;
}

function RawOutput({ text }: { text: string }) {
  if (!text) return null;

  const content = <PreBlock>{text}</PreBlock>;

  return <Collapsible label="Surowe wyjście">{content}</Collapsible>;
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

      <MetricsSection metrics={job.metrics} deepevalMetrics={job.deepeval_metrics} />
      <RawOutput text={job.raw_output} />
      <PromptSection
        template={job.prompt_template}
        params={job.prompt_params}
        inputText={job.input_text}
      />
      <RawMetadata data={job.raw_metadata} />
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
