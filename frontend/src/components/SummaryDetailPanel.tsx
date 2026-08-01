import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Collapsible } from "./Collapsible";
import { DeepevalItems } from "./DeepevalItems";
import { InfoRow } from "./InfoRow";
import { PreBlock } from "./PreBlock";
import { formatDateMinute, formatDuration } from "../utils/format";
import type { JobMetrics, JobStatus, JobStatusValue, PromptMessage } from "../types/api";

interface JobDetailPanelProps {
    sourceUrl: string | null;
    jobs: JobStatus[];
    isOpen: boolean;
    isLoading: boolean;
    onClose: () => void;
    debugMode?: boolean;
}

const METRIC_SECTIONS = [
    { key: "source", label: "Source", field: "source" as const },
    { key: "summary", label: "Summary", field: "summary" as const },
    { key: "key_takeaways", label: "Key Takeaways", field: "key_takeaways" as const },
    { key: "compression", label: "Summary / Source", field: "compression" as const },
] as const;

const DEEPEVAL_SECTIONS = [
    { key: "summary", label: "summary", field: "summary" as const },
    { key: "summary_input", label: "summary_input", field: "summary_input" as const },
    { key: "takeaways", label: "takeaways", field: "takeaways" as const },
    { key: "takeaways_input", label: "takeaways_input", field: "takeaways_input" as const },
    { key: "summary_takeaways", label: "summary_takeaways", field: "summary_takeaways" as const },
] as const;

function DeepevalSections({ metrics }: { metrics: NonNullable<JobStatus["deepeval_metrics"]> }) {
    const renderedSections = DEEPEVAL_SECTIONS.map(section => {
        const items = metrics[section.field];
        if (!items || items.length === 0) return null;

        return (
            <div key={section.key} className="space-y-2">
                <h6 className="m-0 font-display text-[0.72rem] font-semibold uppercase tracking-wider text-ink">
                    {section.label}
                </h6>
                <DeepevalItems items={items} />
            </div>
        );
    });

    return <div className="space-y-3">{renderedSections}</div>;
}

function MetricsSection({
    metrics,
    deepevalMetrics,
}: {
    metrics: JobMetrics;
    deepevalMetrics: NonNullable<JobStatus["deepeval_metrics"]>;
}) {
    const defaultMetricsBlocks = METRIC_SECTIONS.map(section => {
        const data = metrics[section.field];
        if (!data) return null;

        const gridItems = Object.entries(data).map(([k, v]) => (
            <InfoRow key={k} label={k.replace(/_/g, " ")} value={v} />
        ));

        return (
            <div key={section.key} className="space-y-2">
                <h6 className="m-0 font-display text-[0.78rem] font-semibold uppercase tracking-wider text-muted">
                    {section.label}
                </h6>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {gridItems}
                </div>
            </div>
        );
    });

    const deepevalBlock = deepevalMetrics ? (
        <div className="space-y-3 border-t border-divider pt-3">
            <h6 className="m-0 font-display text-[0.78rem] font-semibold uppercase tracking-wider text-muted">
                Deepeval
            </h6>
            <DeepevalSections metrics={deepevalMetrics} />
        </div>
    ) : null;

    return (
        <Collapsible label="Metrics">
            <div className="space-y-4 p-3">
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
    template: PromptMessage[] | [string, string][];
    params: Record<string, string>;
    inputText: string;
}) {
    if ((!template || template.length === 0) && !inputText) return null;

    let templateBlock = null;
    if (template && template.length > 0) {
        const messages = template.map((m) =>
            Array.isArray(m) ? { role: m[0], content: m[1] } : m
        );
        
        const renderedMessages = messages.map((msg, i) => (
            <div key={i} className="mb-2 min-w-0">
                <span className="font-mono text-[0.72rem] uppercase text-muted">{msg.role}: </span>
                <PreBlock>{msg.content}</PreBlock>
            </div>
        ));

        templateBlock = (
            <div className="min-w-0">
                <p className="mb-1 text-[0.72rem] uppercase tracking-wider text-muted">Template</p>
                {renderedMessages}
            </div>
        );
    }

    let paramsBlock = null;
    if (params && Object.keys(params).length > 0) {
        paramsBlock = (
            <div className="min-w-0">
                <p className="mb-1 text-[0.72rem] uppercase tracking-wider text-muted">Parametry</p>
                <PreBlock>{JSON.stringify(params, null, 2)}</PreBlock>
            </div>
        );
    }

    let inputBlock = null;
    if (inputText) {
        inputBlock = (
            <div className="min-w-0">
                <p className="mb-1 text-[0.72rem] uppercase tracking-wider text-muted">Input text</p>
                <pre className="m-0 max-h-96 overflow-y-auto overflow-x-auto whitespace-pre-wrap wrap-break-word bg-subtle p-2 text-[0.75rem] leading-normal min-w-0">
                    {inputText}
                </pre>
            </div>
        );
    }

    return (
        <Collapsible label="Prompt">
            <div className="space-y-3 p-3 min-w-0">
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
    if (status === "failed") return <span className="ml-2 font-mono text-[0.68rem] uppercase text-error">failed</span>;
    if (status === "pending") return <span className="ml-2 font-mono text-[0.68rem] uppercase text-warning">pending</span>;
    return null;
}

function tokensPerSecond(outputTokens: number, durationMs: number): string {
    if (!durationMs || !outputTokens) return "—";
    return (outputTokens / (durationMs / 1000)).toFixed(1);
}

function JobEntry({ job, defaultOpen = false }: { job: JobStatus, defaultOpen?: boolean }) {
    const [open, setOpen] = useState(defaultOpen);
    const modelLabel = job.model_name ? `${job.model_provider}:${job.model_name}` : job.model_provider;

    const header = (
        <button
            type="button"
            onClick={() => setOpen(v => !v)}
            className="flex w-full items-start justify-between px-4 py-3 text-left transition-colors hover:bg-subtle"
        >
            <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-mono text-[0.85rem] font-semibold">
                    {modelLabel}{statusBadge(job.status)}
                </span>
                <span className="text-[0.78rem] text-muted">{formatDateMinute(job.created_at)}</span>
            </span>
            <span className="ml-3 mt-0.5 shrink-0 text-[0.8rem] text-muted">{open ? "▼" : "▶"}</span>
        </button>
    );

    const details = open && (
        <div className="space-y-4 border-t border-panel-border bg-subtle px-4 py-3 min-w-0 overflow-hidden">
            {job.status === "failed" && job.error ? (
                <section>
                    <h5 className="section-kicker">Błąd</h5>
                    <p className="m-0 text-[1.02rem] leading-[1.72] text-error">{job.error}</p>
                </section>
            ) : (
                <JobDetails job={job} />
            )}
        </div>
    );

    return (
        <div className="mb-2 border border-panel-border min-w-0">
            {header}
            {details}
        </div>
    );
}

function JobDetails({ job }: { job: JobStatus }) {
    const shouldRenderDetails = job.status !== "pending" && job.status !== "failed";
    if (!shouldRenderDetails) return null;

    const takeawaysMarkdown = (job.summary_data?.key_takeaways ?? [])
        .map(item => `- ${item}`)
        .join("\n");

    return (
        <>
            <div className="grid grid-cols-4 gap-x-4 gap-y-3 text-[0.85rem]">
                <InfoRow label="Wywołano" value={formatDateMinute(job.created_at)} valueClassName="text-[0.88rem]" />
                <InfoRow label="Zakończono" value={formatDateMinute(job.finished_at)} valueClassName="text-[0.88rem]" />
                <InfoRow label="Czas generacji" value={formatDuration(job.duration_ms)} valueClassName="text-[0.88rem]" />
                <InfoRow label="Tokens / s" value={tokensPerSecond(job.usage.output_tokens, job.duration_ms)} valueClassName="text-[0.88rem]" />
                <InfoRow label="Input tokens" value={job.usage.input_tokens} valueClassName="text-[0.88rem]" />
                <InfoRow label="Output tokens" value={job.usage.output_tokens} valueClassName="text-[0.88rem]" />
                {job.usage.thinking_tokens > 0 ? <InfoRow label="Thinking tokens" value={job.usage.thinking_tokens} valueClassName="text-[0.88rem]" /> : null}
                <InfoRow label="Total tokens" value={job.usage.total_tokens} valueClassName="text-[0.88rem]" />
                <InfoRow label="Summary mode" value={job.summary_mode} valueClassName="text-[0.88rem]" />
            </div>

            <section>
                <h5 className="section-kicker">Krótkie podsumowanie</h5>
                <p className="m-0 text-[1.02rem] leading-[1.72]">{job.summary_data?.summary}</p>
            </section>

            <section>
                <h5 className="section-kicker">Najważniejsze punkty</h5>
                <div className="grid gap-3 text-[1.02rem] leading-[1.72] [&_ul]:m-0 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_ol]:m-0 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_p]:m-0 [&_p]:whitespace-pre-wrap [&_li>p]:m-0">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{takeawaysMarkdown}</ReactMarkdown>
                </div>
            </section>

            <MetricsSection metrics={job.metrics} deepevalMetrics={job.deepeval_metrics} />
            <RawOutput text={job.raw_output} />
            <PromptSection template={job.prompt_template} params={job.prompt_params} inputText={job.input_text} />
            <RawMetadata data={job.raw_metadata} />
        </>
    );
}

export function SummaryDetailPanel({ sourceUrl, jobs, isOpen, isLoading, onClose, debugMode = false }: JobDetailPanelProps) {
    if (!isOpen) return null;
    if (isLoading) return <p className="m-0 text-[0.95rem] text-muted">Ładowanie wyników...</p>;
    if (!sourceUrl) return null;

    const title = jobs[0]?.summary_data?.title || "";
    const jobsFilteredSorted = debugMode
        ? jobs
        : jobs.filter(job => job.status === "completed");

    const sectionTitle = debugMode ? "Wynik" : "Wyniki dla modeli";

    return (
        <aside className="fixed inset-x-0 bottom-0 z-30 h-[75vh] overflow-y-auto border-t border-panel-border bg-panel-solid p-5 shadow-detail-mobile lg:sticky lg:top-4 lg:z-auto lg:h-[calc(100vh-32px)] lg:border lg:p-6 lg:shadow-detail-desktop xl:w-190">
            <div className="mb-4.5 flex items-center justify-between border-b border-divider pb-3">
                <h3 className="m-0 font-display text-[1.1rem]">Szczegóły</h3>
                <button type="button" onClick={onClose} className="h-9 cursor-pointer border border-panel-border bg-close-bg px-3 text-ink">
                    Zamknij
                </button>
            </div>

            <article className="grid gap-4.5 min-w-0">
                <h3 className="m-0 pb-3 font-display text-[1.05rem] leading-[1.4] text-ink">{title}</h3>

                <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="wrap-anywhere font-mono text-[1.05rem] font-bold text-link no-underline leading-[1.35]"
                >
                    {sourceUrl}
                </a>

                <section className="border-t border-divider pt-4 min-w-0">
                    <h5 className="m-0 mb-3 font-display text-[0.95rem] font-semibold uppercase tracking-wider text-muted">
                        {sectionTitle}
                    </h5>

                    {jobsFilteredSorted.length === 0 ? (
                        <p className="m-0 text-[0.95rem] text-muted">Brak wyników.</p>
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
