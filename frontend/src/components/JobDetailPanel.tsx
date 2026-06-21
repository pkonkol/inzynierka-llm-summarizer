import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { JobStatus } from "../types/api";

interface JobDetailPanelProps {
    job: JobStatus | null;
    isOpen: boolean;
    isLoading: boolean;
    onClose: () => void;
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

function formatDate(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("pl-PL", {
        year: "numeric", month: "2-digit", day: "2-digit",
    });
}

function InfoRow({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="flex flex-col gap-0.5">
            <span className="text-muted block text-[0.72rem] uppercase tracking-wider">{label}</span>
            <span className="text-[0.88rem] font-mono">{value}</span>
        </div>
    );
}

function RawMetadata({ data }: { data: Record<string, unknown> }) {
    const [open, setOpen] = useState(false);
    if (!data || Object.keys(data).length === 0) return null;

    return (
        <div className="border border-panel-border">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="w-full px-3 py-2 text-left text-[0.75rem] uppercase tracking-wider text-muted hover:bg-subtle transition-colors flex items-center justify-between"
            >
                <span>Raw metadata</span>
                <span>{open ? "▼" : "▶"}</span>
            </button>
            {open && (
                <pre className="m-0 overflow-x-auto p-3 text-[0.75rem] leading-[1.5] bg-subtle">
                    {JSON.stringify(data, null, 2)}
                </pre>
            )}
        </div>
    );
}

function SummaryResult({ job, isExpanded, onToggle }: { job: JobStatus; isExpanded: boolean; onToggle: () => void }) {
    const modelLabel = job.model_name ? `${job.model_provider}:${job.model_name}` : job.model_provider;

    return (
        <div className="border border-panel-border mb-3">
            <button
                type="button"
                onClick={onToggle}
                className="w-full px-4 py-3 text-left font-display text-[0.95rem] font-semibold flex items-center justify-between hover:bg-subtle transition-colors"
            >
                <span>{modelLabel}</span>
                <span className="text-[0.8rem] text-muted">({formatDuration(job.duration_ms)})</span>
                <span className="ml-2">{isExpanded ? "▼" : "▶"}</span>
            </button>

            {isExpanded && (
                <div className="px-4 py-3 border-t border-panel-border bg-subtle space-y-4">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-[0.85rem]">
                        <InfoRow label="Wywołano" value={formatDate(job.created_at)} />
                        <InfoRow label="Zakończono" value={formatDate(job.finished_at)} />
                        <InfoRow label="Czas generacji" value={formatDuration(job.duration_ms)} />
                        <InfoRow label="Input tokens" value={job.usage.input_tokens} />
                        <InfoRow label="Output tokens" value={job.usage.output_tokens} />
                        {job.usage.thinking_tokens > 0 && (
                            <InfoRow label="Thinking tokens" value={job.usage.thinking_tokens} />
                        )}
                        <InfoRow label="Total tokens" value={job.usage.total_tokens} />
                    </div>

                    <section>
                        <h5 className="section-kicker">Krotkie podsumowanie</h5>
                        <p className="m-0 text-[1.02rem] leading-[1.72]">{job.summary_data?.short_summary || "Brak tresci"}</p>
                    </section>

                    <section>
                        <h5 className="section-kicker">Najwazniejsze punkty</h5>
                        <div className="grid gap-3 text-[1.02rem] leading-[1.72] [&_ul]:m-0 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_ol]:m-0 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_p]:m-0 [&_p]:whitespace-pre-wrap [&_li>p]:m-0">
                            {job.summary_data?.key_takeaways ? (
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {job.summary_data.key_takeaways}
                                </ReactMarkdown>
                            ) : (
                                <p className="m-0">Brak tresci</p>
                            )}
                        </div>
                    </section>

                    {job.error && (
                        <section>
                            <h5 className="section-kicker">Blad</h5>
                            <p className="m-0 text-[1.02rem] leading-[1.72]">{job.error}</p>
                        </section>
                    )}

                    <RawMetadata data={job.raw_metadata} />
                </div>
            )}
        </div>
    );
}

export function JobDetailPanel({ job, isOpen, isLoading, onClose }: JobDetailPanelProps) {
    const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

    if (!isOpen) return null;

    const displayedJobId = job?.job_id;
    const isExpanded = expandedJobId === displayedJobId || !expandedJobId;

    return (
        <aside className="fixed inset-x-0 bottom-0 z-30 h-[75vh] overflow-y-auto border-t border-panel-border bg-panel-solid p-5 shadow-detail-mobile lg:sticky lg:top-4 lg:z-auto lg:h-[calc(100vh-32px)] lg:border lg:p-6 lg:shadow-detail-desktop">
            {/* Header */}
            <div className="mb-4.5 flex items-center justify-between border-b border-divider pb-3">
                <h3 className="m-0 font-display text-[1.1rem]">Szczegoly</h3>
                <button
                    type="button"
                    onClick={onClose}
                    className="h-9 cursor-pointer border border-panel-border bg-close-bg px-3 text-ink"
                >
                    Zamknij
                </button>
            </div>

            {!isLoading && !job ? (
                <p className="m-0 text-[0.95rem] text-muted">Wybierz podsumowanie z listy, aby zobaczyc szczegoly.</p>
            ) : null}

            {isLoading ? <p className="m-0 text-[0.95rem] text-muted">Ladowanie szczegolow...</p> : null}

            {!isLoading && job ? (
                <article className="grid gap-4.5">
                    {/* Big URL + meta header */}
                    <div className="grid gap-1.5">
                        <a
                            href={job.source_url}
                            target="_blank"
                            rel="noreferrer"
                            className="wrap-anywhere font-mono text-[1.05rem] font-bold text-link no-underline leading-[1.35]"
                        >
                            {job.source_url}
                        </a>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.82rem] text-muted">
                            <span>Model: {job.model_provider}:{job.model_name}</span>
                            <span>{formatDate(job.created_at)}</span>
                        </div>
                        {/* Title */}
                        {job.summary_data?.title ? (
                            <h4 className="m-0 mt-1 font-display text-[1.55rem] leading-[1.3]">
                                {job.summary_data.title}
                            </h4>
                        ) : null}
                    </div>

                    <div className="border-t border-divider pt-4">
                        <h5 className="m-0 mb-3 font-display text-[0.95rem] font-semibold uppercase tracking-wider text-muted">Wyniki dla modeli</h5>
                        {job && (
                            <SummaryResult
                                job={job}
                                isExpanded={isExpanded}
                                onToggle={() => setExpandedJobId(isExpanded ? null : displayedJobId || null)}
                            />
                        )}
                    </div>
                </article>
            ) : null}
        </aside>
    );
}
