import type { JobListItem } from "../types/api";

interface CompletedJobsListProps {
    jobs: JobListItem[];
    selectedJobId: string | null;
    isLoading: boolean;
    onSelectJob: (jobId: string) => void;
}

export function CompletedJobsList({
    jobs,
    selectedJobId,
    isLoading,
    onSelectJob,
}: CompletedJobsListProps) {
    return (
        <section className="jobs-section">
            <div className="jobs-header">
                <h2>Gotowe podsumowania</h2>
                <span>{jobs.length}</span>
            </div>
            {isLoading ? <p className="jobs-empty">Ladowanie listy...</p> : null}
            {!isLoading && jobs.length === 0 ? (
                <p className="jobs-empty">Brak gotowych wynikow. Dodaj pierwszy URL powyzej.</p>
            ) : null}
            <ul className="jobs-list">
                {jobs.map((job) => (
                    <li key={job.job_id}>
                        <button
                            type="button"
                            className={selectedJobId === job.job_id ? "job-item active" : "job-item"}
                            onClick={() => onSelectJob(job.job_id)}
                        >
                            <strong>{job.title || "Bez tytulu"}</strong>
                            <span>{job.source_url}</span>
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}
