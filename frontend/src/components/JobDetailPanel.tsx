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

function getStatusClass(status: JobStatus["status"]): string {
    if (status === "completed") {
        return "bg-status-completed-bg text-status-completed-text";
    }

    if (status === "failed") {
        return "bg-status-failed-bg text-status-failed-text";
    }

    return "bg-status-pending-bg text-status-pending-text";
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const seconds = (ms / 1000).toFixed(1);
    return `${seconds}s`;
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
                    <div className="grid grid-cols-2 gap-2 text-[0.85rem]">
                        <div>
                            <span className="text-muted block text-[0.75rem] uppercase tracking-wider">Input Tokens</span>
                            <span className="font-display">{job.usage.input_tokens}</span>
                        </div>
                        <div>
                            <span className="text-muted block text-[0.75rem] uppercase tracking-wider">Output Tokens</span>
                            <span className="font-display">{job.usage.output_tokens}</span>
                        </div>
                        {job.usage.thinking_tokens > 0 && (
                            <div>
                                <span className="text-muted block text-[0.75rem] uppercase tracking-wider">Thinking Tokens</span>
                                <span className="font-display">{job.usage.thinking_tokens}</span>
                            </div>
                        )}
                        <div>
                            <span className="text-muted block text-[0.75rem] uppercase tracking-wider">Total Tokens</span>
                            <span className="font-display">{job.usage.total_tokens}</span>
                        </div>
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
                </div>
            )}
        </div>
    );
}

export function JobDetailPanel({ job, isOpen, isLoading, onClose }: JobDetailPanelProps) {
    const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

    if (!isOpen) {
        return null;
    }

    // If single job, expand it by default
    const displayedJobId = job?.job_id;
    const isExpanded = expandedJobId === displayedJobId || !expandedJobId;

    return (
        <aside className="fixed inset-x-0 bottom-0 z-30 h-[75vh] overflow-y-auto border-t border-panel-border bg-panel-solid p-5 shadow-detail-mobile lg:sticky lg:top-4 lg:z-auto lg:h-[calc(100vh-32px)] lg:border lg:p-6 lg:shadow-detail-desktop">
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
                    <div>
                        <p
                            className={`m-0 w-fit border border-panel-border px-2.5 py-1 text-[0.82rem] font-bold uppercase tracking-[0.01em] ${getStatusClass(job.status)}`}
                        >
                            Status: {job.status}
                        </p>
                    </div>
                    <div>
                        <h4 className="m-0 font-display text-[1.9rem] leading-[1.3]">
                            {job.summary_data?.title || "Brak tytulu"}
                        </h4>
                    </div>
                    <a href={job.source_url} target="_blank" rel="noreferrer" className="wrap-anywhere text-[0.88rem] text-link no-underline">
                        {job.source_url}
                    </a>

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
