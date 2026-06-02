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

export function JobDetailPanel({ job, isOpen, isLoading, onClose }: JobDetailPanelProps) {
    if (!isOpen) {
        return null;
    }

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
                    <p
                        className={`m-0 w-fit border border-panel-border px-2.5 py-1 text-[0.82rem] font-bold uppercase tracking-[0.01em] ${getStatusClass(job.status)}`}
                    >
                        Status: {job.status}
                    </p>
                    <h4 className="m-0 font-display text-[1.9rem] leading-[1.3]">
                        {job.summary_data?.title || "Brak tytulu"}
                    </h4>
                    <a href={job.source_url} target="_blank" rel="noreferrer" className="wrap-anywhere text-[0.88rem] text-link no-underline">
                        {job.source_url}
                    </a>
                    <section>
                        <h5 className="section-kicker">Krotkie podsumowanie</h5>
                        <p className="m-0 text-[1.02rem] leading-[1.72]">{job.summary_data?.short_summary || "Brak tresci"}</p>
                    </section>
                    <section>
                        <h5 className="section-kicker">Najwazniejsze punkty</h5>
                        <p className="m-0 text-[1.02rem] leading-[1.72]">{job.summary_data?.key_takeaways || "Brak tresci"}</p>
                    </section>
                    {job.error ? (
                        <section>
                            <h5 className="section-kicker">Blad</h5>
                            <p className="m-0 text-[1.02rem] leading-[1.72]">{job.error}</p>
                        </section>
                    ) : null}
                </article>
            ) : null}
        </aside>
    );
}
