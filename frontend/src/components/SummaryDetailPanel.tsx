import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { errorText, getJobStatus } from "../api/client";
import { useFetchOnMount } from "../hooks/useFetchOnMount";
import type { DeepevalItem, JobMetrics, JobStatusResponse } from "../types/api.generated";
import type { JobStatus, PromptMessage } from "../types/local";
import { downloadJson } from "../utils/download";
import { buildExportPayload, exportFilename } from "../utils/evaluationSetExport";
import { formatDateMinute, formatDuration } from "../utils/format";
import { isJobInProgress, isManualSource } from "../utils/jobs";
import {
  FUNCTION_LABELS,
  formatLengthTarget,
  OUTPUT_FORMAT_LABELS,
  STANCE_LABELS,
} from "../utils/summarySpecLabels";
import { DeepevalItems } from "./DeepevalItems";
import { useFlash } from "./FlashProvider";
import { InfoList, InfoRow } from "./InfoRow";
import { MetricsSection } from "./MetricsSection";
import { StatusLabel } from "./StatusLabel";
import { Button, type ButtonVariant } from "./ui/Button";
import { DisclosureSections } from "./ui/DisclosureSections";
import { SectionHeading } from "./ui/PageShell";
import { PreBlock } from "./ui/PreBlock";

interface JobDetailPanelProps {
  sourceUrl: string | null;
  jobs: JobStatusResponse[];
  isOpen: boolean;
  isLoading: boolean;
  onClose: () => void;
  debugMode?: boolean;
}

const ORIGIN_LABELS: Record<JobStatusResponse["origin"], string> = {
  admin: "Konsola",
  public: "Strona publiczna",
};

const METRIC_SECTIONS = [
  { key: "source", label: "Źródło", field: "source" as const },
  { key: "summary", label: "Podsumowanie", field: "summary" as const },
] as const;

function JobMetricsPanel({
  metrics,
  deepevalMetrics,
}: {
  metrics: JobMetrics;
  deepevalMetrics: DeepevalItem[];
}) {
  const defaultMetricsBlocks = METRIC_SECTIONS.map((section) => {
    const data = metrics[section.field];
    if (!data) return null;
    return <MetricsSection key={section.key} title={section.label} data={data} />;
  });

  const deepevalBlock =
    deepevalMetrics.length > 0 ? (
      <div className="grid gap-3">
        <SectionHeading>Deepeval</SectionHeading>
        <DeepevalItems items={deepevalMetrics} />
      </div>
    ) : null;

  return (
    <div className="grid gap-4">
      {defaultMetricsBlocks}
      {deepevalBlock}
    </div>
  );
}

function PromptSection({ job }: { job: JobStatusResponse }) {
  const template: PromptMessage[] = job.prompt_template;
  const params = job.prompt_params;
  const inputText = job.input_text;

  let templateBlock = null;
  if (template.length > 0) {
    const renderedMessages = template.map(([role, content]) => (
      <div key={role} className="grid min-w-0 gap-1 text-caption">
        <span className="text-mute">{role}:</span>
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
        <PreBlock withoutBackground className="max-h-96 max-w-measure overflow-y-auto">
          {inputText}
        </PreBlock>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-3">
      {templateBlock}
      {paramsBlock}
      {inputBlock}
    </div>
  );
}

function statusBadge(status: JobStatus) {
  if (status === "failed" || isJobInProgress(status)) {
    return (
      <span className="text-caption">
        <StatusLabel status={status} />
      </span>
    );
  }
  return null;
}

function ExportButton({
  jobIds,
  sourceUrl,
  label,
  variant,
}: {
  jobIds: string[];
  sourceUrl: string;
  label: string;
  variant: ButtonVariant;
}) {
  const showFlash = useFlash();
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    setIsExporting(true);
    try {
      const fullJobs = await Promise.all(jobIds.map(getJobStatus)); // by-url projects input_text away
      downloadJson(exportFilename(sourceUrl, jobIds), buildExportPayload(fullJobs, sourceUrl));
    } catch (error) {
      showFlash(`Nie udało się wyeksportować podsumowań: ${errorText(error)}`, "danger");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Button variant={variant} onClick={() => void handleExport()} disabled={isExporting}>
      {isExporting ? "Pobieranie..." : label}
    </Button>
  );
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
      className="flex min-h-11 w-full cursor-pointer items-baseline gap-3 py-3 text-left"
    >
      <span aria-hidden="true" className="shrink-0">
        {open ? "[-]" : "[+]"}
      </span>
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="wrap-anywhere font-medium">{modelLabel}</span>
        {statusBadge(job.status)}
        <span className="text-caption text-mute">{formatDateMinute(job.created_at)}</span>
      </span>
    </button>
  );

  const details = open && (
    <div className="grid min-w-0 gap-4 overflow-clip pb-4">
      {job.status === "failed" && job.error ? (
        <section>
          <h4>Błąd</h4>
          <p className="wrap-anywhere text-danger-hover">{job.error}</p>
        </section>
      ) : isJobInProgress(job.status) ? null : (
        <JobDetails job={job} />
      )}
    </div>
  );

  return (
    <div className="min-w-0">
      {header}
      {details}
    </div>
  );
}

function JobDetails({ job }: { job: JobStatusResponse }) {
  // by-url projects the bulky fields away, so the disclosures below need the full document.
  const { data: fullJob, errorMessage } = useFetchOnMount(
    () => getJobStatus(job.job_id),
    job.job_id,
    "Nie udało się pobrać szczegółów",
  );
  const placeholder = errorMessage ? (
    <p className="text-danger-hover">{errorMessage}</p>
  ) : (
    <p className="text-mute">Ładowanie...</p>
  );

  const summaryText = job.summary_data?.summary ?? null;

  return (
    <>
      <InfoList>
        <InfoRow label="Wywołano" value={formatDateMinute(job.created_at)} />
        <InfoRow label="Pochodzenie" value={ORIGIN_LABELS[job.origin]} />
        <InfoRow label="Czas generacji" value={formatDuration(job.duration_ms)} />
        <InfoRow label="Tokeny wejściowe" value={job.usage.input_tokens} />
        <InfoRow label="Tokeny wyjściowe" value={job.usage.output_tokens} />
        {job.usage.thinking_tokens > 0 ? (
          <InfoRow label="Tokeny rozumowania" value={job.usage.thinking_tokens} />
        ) : null}
        <InfoRow label="Tokeny łącznie" value={job.usage.total_tokens} />
        <InfoRow label="Strategia przetwarzania" value={job.processing_strategy} />
        <InfoRow label="Format" value={OUTPUT_FORMAT_LABELS[job.summary_spec.output_format]} />
        <InfoRow label="Narracja" value={STANCE_LABELS[job.summary_spec.narrative_stance]} />
        <InfoRow label="Funkcja" value={FUNCTION_LABELS[job.summary_spec.summary_function]} />
        {job.resolved_length ? (
          <InfoRow
            label="Cel długości"
            value={formatLengthTarget(
              job.resolved_length.target_words,
              job.resolved_length.target_sentences,
            )}
          />
        ) : null}
      </InfoList>

      {summaryText === null ? null : (
        <section className="grid gap-2">
          <h4>Podsumowanie</h4>
          <div className="markdown max-w-measure font-reading text-reading">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{summaryText}</ReactMarkdown>
          </div>
        </section>
      )}

      <DisclosureSections
        sections={[
          {
            key: "metrics",
            label: "Metryki",
            content: (
              <JobMetricsPanel metrics={job.metrics} deepevalMetrics={job.deepeval_metrics} />
            ),
          },
          {
            key: "prompt",
            label: "Prompt",
            content: fullJob ? <PromptSection job={fullJob} /> : placeholder,
          },
          {
            key: "rawMetadata",
            label: "Surowe metadane",
            content: fullJob ? (
              <PreBlock>{JSON.stringify(fullJob.raw_metadata, null, 2)}</PreBlock>
            ) : (
              placeholder
            ),
          },
        ]}
        trailing={
          <ExportButton
            jobIds={[job.job_id]}
            sourceUrl={job.source_url}
            label="Pobierz JSON"
            variant="secondary"
          />
        }
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

  const completedJobs = jobs.filter((job) => job.status === "completed");
  // Each job gets its own title from the title model, so the heading follows the first one that has one.
  const title = completedJobs[0]?.summary_data?.title;
  const jobsFilteredSorted = debugMode ? jobs : completedJobs;

  const sectionTitle = debugMode ? "Wynik" : "Wyniki dla modeli";
  const exportableJobIds = completedJobs.map((job) => job.job_id);

  // The shell renders from the first frame, so opening a row cannot leave the split layout
  // with an unstyled right column and no way to close it.
  let body: React.ReactNode;
  if (isLoading) {
    body = <p className="text-mute">Ładowanie wyników...</p>;
  } else if (!sourceUrl) {
    body = <p className="text-mute">Brak wyników.</p>;
  } else {
    body = (
      <article className="grid gap-4 min-w-0">
        {title ? <h3 className="text-subtitle">{title}</h3> : null}

        {isManualSource(sourceUrl) ? null : (
          <a href={sourceUrl} target="_blank" rel="noreferrer" className="wrap-anywhere">
            {sourceUrl}
          </a>
        )}

        <section className="grid min-w-0 content-start gap-2">
          <h4>{sectionTitle}</h4>

          {jobsFilteredSorted.length === 0 ? (
            <p className="text-mute">Brak wyników.</p>
          ) : (
            <div className="grid divide-y divide-hairline">
              {jobsFilteredSorted.map((job, index) => (
                <JobEntry key={job.job_id} job={job} defaultOpen={index === 0} />
              ))}
            </div>
          )}
        </section>
      </article>
    );
  }

  return (
    <aside className="fixed inset-x-0 bottom-0 z-30 grid h-[75vh] min-w-0 content-start gap-4 overflow-y-auto border-t border-hairline-strong bg-canvas p-4 lg:sticky lg:top-4 lg:z-auto lg:h-[calc(100vh-2rem)] lg:border lg:border-hairline">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline pb-2">
        <h2>Szczegóły</h2>
        <div className="flex flex-wrap items-center gap-2">
          {sourceUrl && exportableJobIds.length > 0 ? (
            <ExportButton
              jobIds={exportableJobIds}
              sourceUrl={sourceUrl}
              label="Pobierz wszystkie"
              variant="secondary"
            />
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            Zamknij
          </Button>
        </div>
      </div>

      {body}
    </aside>
  );
}
