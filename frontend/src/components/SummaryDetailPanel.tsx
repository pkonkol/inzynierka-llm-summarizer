import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "../components/ui/Button";
import { SectionHeading } from "../components/ui/PageShell";
import type { DeepevalItem, JobMetrics, JobStatusResponse } from "../types/api.generated";
import type { JobStatusValue, PromptMessage } from "../types/local";
import { formatDateMinute, formatDuration } from "../utils/format";
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
  { key: "source", label: "Source", field: "source" as const },
  { key: "summary", label: "Summary", field: "summary" as const },
  { key: "key_takeaways", label: "Key Takeaways", field: "key_takeaways" as const },
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
      <InfoRow key={k} label={k.replace(/_/g, " ")} value={v} />
    ));

    return (
      <div key={section.key} className="grid gap-2">
        <SectionHeading>{section.label}</SectionHeading>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">{gridItems}</div>
      </div>
    );
  });

  const deepevalBlock =
    deepevalMetrics.length > 0 ? (
      <div className="grid gap-3 border-t border-panel-border pt-3">
        <SectionHeading>Deepeval</SectionHeading>
        <DeepevalItems items={deepevalMetrics} />
      </div>
    ) : null;

  return (
    <Collapsible label="Metrics">
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
      <div key={role} className="min-w-0">
        <span className="font-mono text-2xs uppercase text-muted">{role}: </span>
        <PreBlock>{content}</PreBlock>
      </div>
    ));

    templateBlock = (
      <div className="grid min-w-0 gap-2">
        <p className="text-2xs uppercase tracking-wider text-muted">Template</p>
        {renderedMessages}
      </div>
    );
  }

  let paramsBlock = null;
  if (params && Object.keys(params).length > 0) {
    paramsBlock = (
      <div className="grid min-w-0 gap-1">
        <p className="text-2xs uppercase tracking-wider text-muted">Parametry</p>
        <PreBlock>{JSON.stringify(params, null, 2)}</PreBlock>
      </div>
    );
  }

  let inputBlock = null;
  if (inputText) {
    inputBlock = (
      <div className="grid min-w-0 gap-1">
        <p className="text-2xs uppercase tracking-wider text-muted">Input text</p>
        <pre className="max-h-96 overflow-y-auto overflow-x-auto whitespace-pre-wrap wrap-break-word bg-subtle p-2 text-xs leading-normal min-w-0">
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

  return <Collapsible label="Raw metadata">{content}</Collapsible>;
}

function RawOutput({ text }: { text: string }) {
  if (!text) return null;

  const content = <PreBlock>{text}</PreBlock>;

  return <Collapsible label="Raw output">{content}</Collapsible>;
}

function statusBadge(status: JobStatusValue) {
  if (status === "failed")
    return <span className="ml-2 font-mono text-2xs uppercase text-danger">failed</span>;
  if (status === "pending")
    return <span className="ml-2 font-mono text-2xs uppercase text-warning">pending</span>;
  return null;
}

function tokensPerSecond(outputTokens: number, durationMs: number): string {
  if (!durationMs || !outputTokens) return "—";
  return (outputTokens / (durationMs / 1000)).toFixed(1);
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
      <span className="flex min-w-0 flex-col gap-1">
        <span className="font-mono text-sm font-semibold">
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
          <h5 className="section-kicker">Błąd</h5>
          <p className="text-lg leading-relaxed text-danger">{job.error}</p>
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
      <div className="grid grid-cols-4 gap-x-4 gap-y-3 text-sm">
        <InfoRow
          label="Wywołano"
          value={formatDateMinute(job.created_at)}
          valueClassName="text-md"
        />
        <InfoRow
          label="Zakończono"
          value={formatDateMinute(job.finished_at)}
          valueClassName="text-md"
        />
        <InfoRow
          label="Czas generacji"
          value={formatDuration(job.duration_ms)}
          valueClassName="text-md"
        />
        <InfoRow
          label="Tokens / s"
          value={tokensPerSecond(job.usage.output_tokens, job.duration_ms)}
          valueClassName="text-md"
        />
        <InfoRow label="Input tokens" value={job.usage.input_tokens} valueClassName="text-md" />
        <InfoRow label="Output tokens" value={job.usage.output_tokens} valueClassName="text-md" />
        {job.usage.thinking_tokens > 0 ? (
          <InfoRow
            label="Thinking tokens"
            value={job.usage.thinking_tokens}
            valueClassName="text-md"
          />
        ) : null}
        <InfoRow label="Total tokens" value={job.usage.total_tokens} valueClassName="text-md" />
        <InfoRow label="Summary mode" value={job.summary_mode} valueClassName="text-md" />
      </div>

      <section>
        <h5 className="section-kicker">Krótkie podsumowanie</h5>
        <p className="text-lg leading-relaxed">{job.summary_data?.summary}</p>
      </section>

      <section>
        <h5 className="section-kicker">Najważniejsze punkty</h5>
        <div className="grid gap-3 text-lg leading-relaxed [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_p]:whitespace-pre-wrap">
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
  if (isLoading) return <p className="text-base text-muted">Ładowanie wyników...</p>;
  if (!sourceUrl) return null;

  const title = jobs[0]?.summary_data?.title || "";
  const jobsFilteredSorted = debugMode ? jobs : jobs.filter((job) => job.status === "completed");

  const sectionTitle = debugMode ? "Wynik" : "Wyniki dla modeli";

  return (
    <aside className="fixed inset-x-0 bottom-0 z-30 grid h-[75vh] content-start gap-4 overflow-y-auto border-t border-panel-border bg-panel-solid p-4 split:sticky split:top-4 split:z-auto split:h-[calc(100vh-2rem)] split:border split:p-6">
      <div className="flex items-center justify-between border-b border-panel-border pb-3">
        <h3 className="font-mono text-xl">Szczegóły</h3>
        <Button variant="ghost" onClick={onClose}>
          Zamknij
        </Button>
      </div>

      <article className="grid gap-4 min-w-0">
        <h3 className="font-mono text-lg leading-snug text-ink">{title}</h3>

        <a
          href={sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="wrap-anywhere font-mono text-lg font-bold text-link no-underline leading-snug"
        >
          {sourceUrl}
        </a>

        <section className="grid content-start gap-3 border-t border-panel-border pt-4 min-w-0">
          <h5 className="font-mono text-base font-semibold uppercase tracking-wider text-muted">
            {sectionTitle}
          </h5>

          {jobsFilteredSorted.length === 0 ? (
            <p className="text-base text-muted">Brak wyników.</p>
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
