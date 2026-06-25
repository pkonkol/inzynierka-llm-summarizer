import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

function InfoRow({ label, value }: { label: string; value: string | number }) {
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
        <pre className="m-0 overflow-x-auto whitespace-pre-wrap break-words bg-subtle p-3 text-[0.75rem] leading-[1.5] min-w-0">
            {children}
        </pre>
    );
}

function MetricsGrid({ data }: { data: Record<string, number | null> }) {
    const fmt = (v: number | null | undefined) =>
        v === null || v === undefined ? "—" : String(v);
    return (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {Object.entries(data).map(([k, v]) => (
                <InfoRow key={k} label={k.replace(/_/g, " ")} value={fmt(v)} />
            ))}
        </div>
    );
}

function MetricsSection({ metrics }: { metrics: JobMetrics }) {
    const tabs = [
        { key: "source",        label: "Source",           data: metrics.source },
        { key: "summary",       label: "Summary",          data: metrics.summary },
        { key: "key_takeaways", label: "Key Takeaways",    data: metrics.key_takeaways },
        { key: "compression",   label: "Summary / Source", data: metrics.compression },
    ].filter(t => t.data && Object.keys(t.data).length > 0);

    if (tabs.length === 0) return null;

    const [active, setActive] = useState(tabs[0].key);
    const current = tabs.find(t => t.key === active) ?? tabs[0];

    return (
        <Collapsible label="Metrics">
            <div className="p-3 space-y-3">
                <div className="flex gap-1 flex-wrap">
                    {tabs.map(t => (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => setActive(t.key)}
                            className={`px-2 py-1 text-[0.7rem] uppercase tracking-wider border transition-colors ${
                                active === t.key
                                    ? "border-panel-border bg-subtle text-ink font-semibold"
                                    : "border-transparent text-muted hover:text-ink"
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
                <MetricsGrid data={current.data} />
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
                        <pre className="m-0 max-h-96 overflow-y-auto overflow-x-auto whitespace-pre-wrap break-words bg-subtle p-2 text-[0.75rem] leading-[1.5] min-w-0">
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
                    {job.summary_data?.title && (
                        <span className="mt-0.5 font-display text-[0.88rem] leading-[1.3]">{job.summary_data.title}</span>
                    )}
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
                            <InfoRow label="Tokens / s" value={tokensPerSecond(job.usage?.output_tokens ?? 0, job.duration_ms)} />
                            <InfoRow label="Input tokens" value={job.usage?.input_tokens ?? 0} />
                            <InfoRow label="Output tokens" value={job.usage?.output_tokens ?? 0} />
                            {(job.usage?.thinking_tokens ?? 0) > 0 && (
                                <InfoRow label="Thinking tokens" value={job.usage.thinking_tokens} />
                            )}
                            <InfoRow label="Total tokens" value={job.usage?.total_tokens ?? 0} />
                        </div>
                    )}

                    {job.summary_data && (
                        <>
                            <section>
                                <h5 className="section-kicker">Krótkie podsumowanie</h5>
                                <p className="m-0 text-[1.02rem] leading-[1.72]">{job.summary_data.short_summary || "Brak treści"}</p>
                            </section>
                            <section>
                                <h5 className="section-kicker">Najważniejsze punkty</h5>
                                <div className="grid gap-3 text-[1.02rem] leading-[1.72] [&_ul]:m-0 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_ol]:m-0 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_p]:m-0 [&_p]:whitespace-pre-wrap [&_li>p]:m-0">
                                    {job.summary_data.key_takeaways ? (
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{job.summary_data.key_takeaways}</ReactMarkdown>
                                    ) : (
                                        <p className="m-0">Brak treści</p>
                                    )}
                                </div>
                            </section>
                        </>
                    )}

                    <RawOutput text={job.raw_output ?? ""} />

                    <MetricsSection metrics={job.metrics ?? { source: {}, summary: {}, key_takeaways: {}, compression: {} }} />

                    <PromptSection
                        template={job.prompt_template ?? []}
                        params={job.prompt_params ?? {}}
                        inputText={job.input_text ?? ""}
                    />

                    <RawMetadata data={job.raw_metadata} />
                </div>
            )}
        </div>
    );
}

export function JobDetailPanel({ sourceUrl, jobs, isOpen, isLoading, onClose, debugMode = false }: JobDetailPanelProps) {
    if (!isOpen) return null;

    const passed = jobs.filter(j => j.status !== "failed");
    const failed = jobs.filter(j => j.status === "failed");

    return (
        <aside className="fixed inset-x-0 bottom-0 z-30 h-[75vh] overflow-y-auto border-t border-panel-border bg-panel-solid p-5 shadow-detail-mobile lg:sticky lg:top-4 lg:z-auto lg:h-[calc(100vh-32px)] lg:border lg:p-6 lg:shadow-detail-desktop">
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
                <p className="m-0 text-[0.95rem] text-muted">Wybierz URL z listy, aby zobaczyć szczegóły.</p>
            ) : (
                <article className="grid gap-4.5 min-w-0">
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
