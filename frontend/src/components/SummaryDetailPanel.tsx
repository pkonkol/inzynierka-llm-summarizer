import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { formatDateMinute, formatDuration } from "../utils/format";
import type { DeepevalMetricItem, JobMetrics, JobStatus, JobStatusValue, PromptMessage } from "../types/api";

interface JobDetailPanelProps {
    sourceUrl: string | null;
    jobs: JobStatus[];
    isOpen: boolean;
    isLoading: boolean;
    onClose: () => void;
    debugMode?: boolean;
}

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
    if (value === null || value === undefined || value === "") return null;
    return (
        <div className="flex flex-col gap-0.5">
            <span className="block text-[0.72rem] uppercase tracking-wider text-muted">{label}</span>
            <span className="font-mono text-[0.88rem]">{value}</span>
        </div>
    );
}

function Collapsible({ label, children }: { label: string; children: React.ReactNode }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="border border-panel-border min-w-0">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-[0.75rem] uppercase tracking-wider text-muted transition-colors hover:bg-subtle"
            >
                <span>{label}</span>
                <span>{open ? "▼" : "▶"}</span>
            </button>
            {open && <div className="border-t border-panel-border min-w-0 overflow-hidden">{children}</div>}
        </div>
    );
}

function PreBlock({ children }: { children: string }) {
    return (
        <pre className="m-0 overflow-x-auto whitespace-pre-wrap wrap-break-word bg-subtle p-3 text-[0.75rem] leading-normal min-w-0">
            {children}
        </pre>
    );
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

function MetricsGrid({ data }: { data: Record<string, number | null> }) {
    return (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {Object.entries(data).map(([k, v]) => (
                <InfoRow key={k} label={k.replace(/_/g, " ")} value={v} />
            ))}
        </div>
    );
}

function DeepevalItemRow({ item }: { item: DeepevalMetricItem }) {
    const valueBits = [
        item.passed === undefined || item.passed === null ? null : (item.passed ? "passed" : "failed"),
        item.score === undefined || item.score === null ? null : `score: ${item.score}`,
    ].filter(Boolean) as string[];

    return (
        <div className="border border-panel-border bg-panel-bg px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[0.82rem] font-semibold uppercase tracking-wider text-ink">
                    {item.name}
                </span>
                {valueBits.length > 0 ? <span className="font-mono text-[0.75rem] text-muted">{valueBits.join(" · ")}</span> : null}
            </div>
            {item.reason ? <p className="mt-2 m-0 text-[0.88rem] leading-[1.55] text-muted">{item.reason}</p> : null}
        </div>
    );
}

function DeepevalSections({ metrics }: { metrics: NonNullable<JobStatus["deepeval_metrics"]> }) {
    return (
        <div className="space-y-3">
            {DEEPEVAL_SECTIONS.map(section => {
                const items = metrics[section.field];
                if (items.length === 0) return null;
                return (
                    <div key={section.key} className="space-y-2">
                        <h6 className="m-0 font-display text-[0.72rem] font-semibold uppercase tracking-wider text-ink">
                            {section.label}
                        </h6>
                        <div className="space-y-2">
                            {items.map((item) => (
                                <DeepevalItemRow key={item.name} item={item} />
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function MetricsSection({
    metrics,
    deepevalMetrics,
}: {
    metrics: JobMetrics;
    deepevalMetrics: NonNullable<JobStatus["deepeval_metrics"]>;
}) {
    return (
        <Collapsible label="Metrics">
            <div className="space-y-4 p-3">
                {METRIC_SECTIONS.map(section => (
                    <div key={section.key} className="space-y-2">
                        <h6 className="m-0 font-display text-[0.78rem] font-semibold uppercase tracking-wider text-muted">
                            {section.label}
                        </h6>
                        <MetricsGrid data={metrics[section.field]} />
                    </div>
                ))}

                <div className="space-y-3 border-t border-divider pt-3">
                    <h6 className="m-0 font-display text-[0.78rem] font-semibold uppercase tracking-wider text-muted">
                        Deepeval
                    </h6>
                    <DeepevalSections metrics={deepevalMetrics} />
                </div>
            </div>
        </Collapsible>
    );
}

function RawMetadata({ data }: { data: Record<string, unknown> }) {
    if (!data || Object.keys(data).length === 0) return null;
    return (
        <Collapsible label="Raw metadata">
            <PreBlock>{JSON.stringify(data, null, 2)}</PreBlock>
        </Collapsible>
    );
}

function RawOutput({ text }: { text: string }) {
    if (!text) return null;
    return (
        <Collapsible label="Raw output">
            <PreBlock>{text}</PreBlock>
        </Collapsible>
    );
}

function PromptSection({
    template, params, inputText,
}: {
    template: PromptMessage[] | [string, string][];
    params: Record<string, string>;
    inputText: string;
}) {
    if (template.length === 0 && !inputText) return null;
    const messages = template.map((m) =>
        Array.isArray(m) ? { role: m[0], content: m[1] } : m
    );
    return (
        <Collapsible label="Prompt">
            <div className="space-y-3 p-3 min-w-0">
                {messages.length > 0 && (
                    <div className="min-w-0">
                        <p className="mb-1 text-[0.72rem] uppercase tracking-wider text-muted">Template</p>
                        {messages.map((msg, i) => (
                            <div key={i} className="mb-2 min-w-0">
                                <span className="font-mono text-[0.72rem] uppercase text-muted">{msg.role}: </span>
                                <PreBlock>{msg.content}</PreBlock>
                            </div>
                        ))}
                    </div>
                )}
                {Object.keys(params).length > 0 && (
                    <div className="min-w-0">
                        <p className="mb-1 text-[0.72rem] uppercase tracking-wider text-muted">Parametry</p>
                        <PreBlock>{JSON.stringify(params, null, 2)}</PreBlock>
                    </div>
                )}
                {inputText && (
                    <div className="min-w-0">
                        <p className="mb-1 text-[0.72rem] uppercase tracking-wider text-muted">Input text</p>
                        <pre className="m-0 max-h-96 overflow-y-auto overflow-x-auto whitespace-pre-wrap wrap-break-word bg-subtle p-2 text-[0.75rem] leading-normal min-w-0">
                            {inputText}
                        </pre>
                    </div>
                )}
            </div>
        </Collapsible>
    );
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

function JobEntry({ job }: { job: JobStatus }) {
    const [open, setOpen] = useState(false);
    const modelLabel = job.model_name ? `${job.model_provider}:${job.model_name}` : job.model_provider;

    return (
        <div className="mb-2 border border-panel-border min-w-0">
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

            {open && (
                <div className="space-y-4 border-t border-panel-border bg-subtle px-4 py-3 min-w-0 overflow-hidden">
                    {job.status === "failed" && job.error && (
                        <section>
                            <h5 className="section-kicker">Błąd</h5>
                            <p className="m-0 text-[1.02rem] leading-[1.72] text-error">{job.error}</p>
                        </section>
                    )}

                    {job.status !== "pending" && (
                        <div className="grid grid-cols-4 gap-x-4 gap-y-3 text-[0.85rem]">
                            <InfoRow label="Wywołano" value={formatDateMinute(job.created_at)} />
                            <InfoRow label="Zakończono" value={formatDateMinute(job.finished_at)} />
                            <InfoRow label="Czas generacji" value={formatDuration(job.duration_ms)} />
                            <InfoRow label="Tokens / s" value={tokensPerSecond(job.usage.output_tokens, job.duration_ms)} />
                            <InfoRow label="Input tokens" value={job.usage.input_tokens} />
                            <InfoRow label="Output tokens" value={job.usage.output_tokens} />
                            {job.usage.thinking_tokens > 0 ? <InfoRow label="Thinking tokens" value={job.usage.thinking_tokens} /> : null}
                            <InfoRow label="Total tokens" value={job.usage.total_tokens} />
                            <InfoRow label="Summary mode" value={job.summary_mode} />
                            {DEEPEVAL_SECTIONS.map((group) => {
                            const items = job.deepeval_metrics[group.field];
                            return (
                                <>
                                {items.map((item) => (
                                    <InfoRow key={item.name} label={item.name} value={item.score} />
                                ))}
                                </>
                            );
                            })}
                        </div>
                    )}

                    <section>
                        <h5 className="section-kicker">Krótkie podsumowanie</h5>
                        <p className="m-0 text-[1.02rem] leading-[1.72]">{job.summary_data!.short_summary}</p>
                    </section>
                    <section>
                        <h5 className="section-kicker">Najważniejsze punkty</h5>
                        <div className="grid gap-3 text-[1.02rem] leading-[1.72] [&_ul]:m-0 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_ol]:m-0 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_p]:m-0 [&_p]:whitespace-pre-wrap [&_li>p]:m-0">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{job.summary_data!.key_takeaways}</ReactMarkdown>
                        </div>
                    </section>

                    <MetricsSection
                        metrics={job.metrics}
                        deepevalMetrics={job.deepeval_metrics}
                    />

                    <RawOutput text={job.raw_output} />

                    <PromptSection
                        template={job.prompt_template}
                        params={job.prompt_params}
                        inputText={job.input_text}
                    />

                    <RawMetadata data={job.raw_metadata} />
                </div>
            )}
        </div>
    );
}

export function SummaryDetailPanel({ sourceUrl, jobs, isOpen, isLoading, onClose, debugMode = false }: JobDetailPanelProps) {
    if (!isOpen) return null;

    console.log(jobs);
    const title = jobs[0]?.summary_data?.title || "";

    const passed = jobs.filter(j => j.status !== "failed");
    const failed = jobs.filter(j => j.status === "failed");

    return (
        <aside className="fixed inset-x-0 bottom-0 z-30 h-[75vh] overflow-y-auto border-t border-panel-border bg-panel-solid p-5 shadow-detail-mobile lg:sticky lg:top-4 lg:z-auto lg:h-[calc(100vh-32px)] lg:border lg:p-6 lg:shadow-detail-desktop xl:w-190">
            <div className="mb-4.5 flex items-center justify-between border-b border-divider pb-3">
                <h3 className="m-0 font-display text-[1.1rem]">Szczegóły</h3>
                <button
                    type="button"
                    onClick={onClose}
                    className="h-9 cursor-pointer border border-panel-border bg-close-bg px-3 text-ink"
                >
                    Zamknij
                </button>
            </div>

            {isLoading ? (
                <p className="m-0 text-[0.95rem] text-muted">Ładowanie wyników...</p>
            ) : !sourceUrl ? (
                null
            ) : (
                <article className="grid gap-4.5 min-w-0">
                    <h3 className="m-0 border-b border-divider pb-3 font-display text-[1.05rem] leading-[1.4] text-ink">{title}</h3>

                    <a
                        href={sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="wrap-anywhere font-mono text-[1.05rem] font-bold text-link no-underline leading-[1.35]"
                    >
                        {sourceUrl}
                    </a>

                    {debugMode ? (
                        <div className="border-t border-divider pt-4 min-w-0">
                            <h5 className="m-0 mb-3 font-display text-[0.95rem] font-semibold uppercase tracking-wider text-muted">Wynik</h5>
                            {jobs.length === 0 ? (
                                <p className="m-0 text-[0.95rem] text-muted">Brak wyników.</p>
                            ) : (
                                jobs.map(job => <JobEntry key={job.job_id} job={job} />)
                            )}
                        </div>
                    ) : (
                        <>
                            <div className="border-t border-divider pt-4 min-w-0">
                                <h5 className="m-0 mb-3 font-display text-[0.95rem] font-semibold uppercase tracking-wider text-muted">Wyniki dla modeli</h5>
                                {passed.length === 0 ? (
                                    <p className="m-0 text-[0.95rem] text-muted">Brak wyników.</p>
                                ) : (
                                    passed.map(job => <JobEntry key={job.job_id} job={job} />)
                                )}
                            </div>
                            {failed.length > 0 && (
                                <>
                                    <hr className="border-t border-divider" />
                                    <div className="min-w-0">
                                        <h5 className="m-0 mb-3 font-display text-[0.95rem] font-semibold uppercase tracking-wider text-error">Nieudane ({failed.length})</h5>
                                        {failed.map(job => <JobEntry key={job.job_id} job={job} />)}
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </article>
            )}
        </aside>
    );
}
