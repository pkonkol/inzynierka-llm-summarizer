import type { JobStatus } from "../types/api";

interface JobDetailPanelProps {
    job: JobStatus | null;
    isOpen: boolean;
    isLoading: boolean;
    onClose: () => void;
}

export function JobDetailPanel({ job, isOpen, isLoading, onClose }: JobDetailPanelProps) {
    return (
        <aside className={isOpen ? "detail-panel open" : "detail-panel"}>
            <div className="detail-header">
                <h3>Szczegoly</h3>
                <button type="button" onClick={onClose}>
                    Zamknij
                </button>
            </div>

            {!isLoading && !job ? (
                <p className="detail-empty">Wybierz podsumowanie z listy, aby zobaczyc szczegoly.</p>
            ) : null}

            {isLoading ? <p className="detail-empty">Ladowanie szczegolow...</p> : null}

            {!isLoading && job ? (
                <article className="detail-content">
                    <p className={`status-pill ${job.status}`}>Status: {job.status}</p>
                    <h4>{job.summary_data?.title || "Brak tytulu"}</h4>
                    <a href={job.source_url} target="_blank" rel="noreferrer">
                        {job.source_url}
                    </a>
                    <section>
                        <h5>Krotkie podsumowanie</h5>
                        <p>{job.summary_data?.short_summary || "Brak tresci"}</p>
                    </section>
                    <section>
                        <h5>Najwazniejsze punkty</h5>
                        <p>{job.summary_data?.key_takeaways || "Brak tresci"}</p>
                    </section>
                    {job.error ? (
                        <section>
                            <h5>Blad</h5>
                            <p>{job.error}</p>
                        </section>
                    ) : null}
                </article>
            ) : null}
        </aside>
    );
}
