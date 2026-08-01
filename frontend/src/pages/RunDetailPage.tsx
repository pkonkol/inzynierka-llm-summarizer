import { useEffect, useState } from "react";

import { getEvaluationRun } from "../api/research";
import type { EvaluationRunDetail } from "../types/research";

function navigateTo(path: string) {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
}

type Props = {
    runId: string;
};

export function RunDetailPage({ runId }: Props) {
    const [run, setRun] = useState<EvaluationRunDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const loadRun = async () => {
        try {
            const data = await getEvaluationRun(runId);
            setRun(data);
            setErrorMessage(null);
        } catch (error) {
            setErrorMessage(`Nie udało się pobrać runa: ${String(error)}`);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        setIsLoading(true);
        void loadRun();
    }, [runId]);

    const handleBack = () => {
        navigateTo(run ? `/research/${run.evaluation_set_id}` : "/research");
    };

    return (
        <section className="panel-shell min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="section-kicker">Evaluation run</p>
                    <h1 className="m-0 font-display text-[1.1rem] uppercase tracking-[0.04em]">
                        {run ? `${run.model_provider} – ${run.model_name}` : "Loading..."}
                    </h1>
                    <p className="helper-copy mt-2">
                        {run
                            ? `${run.evaluation_set_name} · mode: ${run.summary_mode} · lang: ${run.language}`
                            : "Ładowanie szczegółów runa..."}
                    </p>
                </div>

                <div className="flex gap-2.5">
                    <button
                        type="button"
                        onClick={() => void loadRun()}
                        disabled={isLoading}
                        className="border border-panel-border bg-panel-solid px-3 py-2 text-[0.85rem] text-ink hover:bg-subtle-hover disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        Refresh
                    </button>
                    <button
                        type="button"
                        onClick={handleBack}
                        className="border border-panel-border bg-panel-solid px-3 py-2 text-[0.85rem] text-ink hover:bg-subtle-hover"
                    >
                        Back to set
                    </button>
                </div>
            </div>

            {errorMessage ? (
                <div className="mt-4 border border-danger bg-panel-solid px-3.5 py-2.5 text-[0.94rem] text-danger">
                    {errorMessage}
                </div>
            ) : null}

            {run ? (
                <>
                    <div className="mt-4 grid gap-1 border border-panel-border bg-panel-solid px-3.5 py-2.5 text-[0.9rem]">
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                            <span>Status: {run.status}</span>
                            <span>Created: {new Date(run.created_at).toLocaleString()}</span>
                            <span>Finished: {run.finished_at ? new Date(run.finished_at).toLocaleString() : "—"}</span>
                        </div>
                        <pre className="m-0 mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-[0.82rem] text-muted">
{JSON.stringify(run.aggregate_metrics, null, 2)}
                        </pre>
                    </div>

                    <div className="mt-4 grid gap-3">
                        {run.entries.map((entry, index) => (
                            <article
                                key={entry.entry_id}
                                className="border border-panel-border bg-panel-solid px-3.5 py-3"
                            >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <p className="m-0 text-[0.82rem] uppercase tracking-[0.04em] text-label">
                                        Entry {index + 1} · {entry.status}
                                    </p>
                                    <p className="m-0 font-mono text-[0.82rem] text-muted">{entry.entry_id}</p>
                                </div>

                                {entry.error ? (
                                    <p className="m-0 mt-2 text-[0.9rem] text-danger">{entry.error}</p>
                                ) : null}

                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                    <div>
                                        <p className="m-0 text-[0.82rem] uppercase tracking-[0.04em] text-label">
                                            Golden summary
                                        </p>
                                        <p className="m-0 mt-1 whitespace-pre-wrap text-[0.95rem] text-ink">
                                            {entry.golden_summary}
                                        </p>
                                    </div>

                                    <div>
                                        <p className="m-0 text-[0.82rem] uppercase tracking-[0.04em] text-label">
                                            AI summary
                                        </p>
                                        <p className="m-0 mt-1 whitespace-pre-wrap text-[0.95rem] text-ink">
                                            {entry.ai_summary ?? "—"}
                                        </p>
                                    </div>
                                </div>

                                {entry.ai_key_takeaways.length > 0 ? (
                                    <div className="mt-3">
                                        <p className="m-0 text-[0.82rem] uppercase tracking-[0.04em] text-label">
                                            AI key takeaways
                                        </p>
                                        <ul className="m-0 mt-1 list-disc pl-5 text-[0.9rem] text-ink">
                                            {entry.ai_key_takeaways.map((item, i) => (
                                                <li key={i}>{item}</li>
                                            ))}
                                        </ul>
                                    </div>
                                ) : null}

                                <div className="mt-3 grid gap-3 md:grid-cols-3">
                                    <div>
                                        <p className="m-0 text-[0.82rem] uppercase tracking-[0.04em] text-label">
                                            Golden metrics
                                        </p>
                                        <pre className="m-0 mt-1 overflow-x-auto whitespace-pre-wrap border border-panel-border bg-page px-3 py-2 font-mono text-[0.82rem] text-muted">
{JSON.stringify(entry.golden_metrics, null, 2)}
                                        </pre>
                                    </div>
                                    <div>
                                        <p className="m-0 text-[0.82rem] uppercase tracking-[0.04em] text-label">
                                            AI metrics
                                        </p>
                                        <pre className="m-0 mt-1 overflow-x-auto whitespace-pre-wrap border border-panel-border bg-page px-3 py-2 font-mono text-[0.82rem] text-muted">
{JSON.stringify(entry.ai_metrics, null, 2)}
                                        </pre>
                                    </div>
                                    <div>
                                        <p className="m-0 text-[0.82rem] uppercase tracking-[0.04em] text-label">
                                            Cross metrics
                                        </p>
                                        <pre className="m-0 mt-1 overflow-x-auto whitespace-pre-wrap border border-panel-border bg-page px-3 py-2 font-mono text-[0.82rem] text-muted">
{JSON.stringify(entry.cross_metrics, null, 2)}
                                        </pre>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                </>
            ) : isLoading ? (
                <p className="helper-copy mt-4">Ładowanie szczegółów runa...</p>
            ) : null}
        </section>
    );
}