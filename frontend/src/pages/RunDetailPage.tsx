import { useEffect, useState } from "react";

import { getEvaluationRun } from "../api/research";
import type { EvaluationRunDetail } from "../types/research";

function navigateTo(path: string) {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
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

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
    if (value === null || value === undefined || value === "") return null;
    return (
        <div className="flex flex-col gap-0.5">
            <span className="block text-[0.72rem] uppercase tracking-wider text-muted">{label}</span>
            <span className="font-mono text-[0.82rem]">{value}</span>
        </div>
    );
}

function DeepevalItems({ items }: { items: { name: string; score: number | null; passed: boolean | null; reason: string | null }[] }) {
    return (
        <div className="space-y-2">
            {items.map(item => {
                const statusText = item.passed != null ? (item.passed ? "passed" : "failed") : null;
                const scoreText = item.score != null ? `score: ${item.score}` : null;
                const bits = [statusText, scoreText].filter(Boolean);
                return (
                    <div key={item.name} className="border border-panel-border bg-panel-bg px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-[0.82rem] font-semibold uppercase tracking-wider text-ink">{item.name}</span>
                            {bits.length > 0 && <span className="font-mono text-[0.75rem] text-muted">{bits.join(" · ")}</span>}
                        </div>
                        {item.reason ? <p className="mt-2 m-0 text-[0.82rem] leading-[1.55] text-muted">{item.reason}</p> : null}
                    </div>
                );
            })}
        </div>
    );
}

function GoldenMetricsBlock({ data }: { data: Record<string, unknown> | null }) {
    if (!data) return null;

    const textStats = data.text_stats as Record<string, number | null> | undefined;
    const readability = data.readability as Record<string, number | null> | undefined;
    const deepeval = data.deepeval as Record<string, { name: string; score: number | null; passed: boolean | null; reason: string | null }[]> | undefined;

    return (
        <div className="space-y-4 p-3">
            {textStats ? (
                <div className="space-y-2">
                    <h6 className="m-0 font-display text-[0.78rem] font-semibold uppercase tracking-wider text-muted">Text stats</h6>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        {Object.entries(textStats).map(([k, v]) => <InfoRow key={k} label={k.replace(/_/g, " ")} value={v} />)}
                    </div>
                </div>
            ) : null}
            {readability ? (
                <div className="space-y-2">
                    <h6 className="m-0 font-display text-[0.78rem] font-semibold uppercase tracking-wider text-muted">Readability</h6>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        {Object.entries(readability).map(([k, v]) => <InfoRow key={k} label={k.replace(/_/g, " ")} value={v} />)}
                    </div>
                </div>
            ) : null}
            {deepeval ? (
                <div className="space-y-3 border-t border-divider pt-3">
                    <h6 className="m-0 font-display text-[0.78rem] font-semibold uppercase tracking-wider text-muted">Deepeval</h6>
                    {Object.entries(deepeval).map(([section, items]) => items.length > 0 ? (
                        <div key={section} className="space-y-2">
                            <span className="font-mono text-[0.72rem] uppercase tracking-wider text-muted">{section}</span>
                            <DeepevalItems items={items} />
                        </div>
                    ) : null)}
                </div>
            ) : null}
        </div>
    );
}

function AiMetricsBlock({ data }: { data: Record<string, unknown> | null }) {
    if (!data) return null;

    const sections = ["summary", "key_takeaways", "compression"] as const;

    return (
        <div className="space-y-4 p-3">
            {sections.map(section => {
                const sectionData = data[section] as Record<string, number | null> | undefined;
                if (!sectionData) return null;
                return (
                    <div key={section} className="space-y-2">
                        <h6 className="m-0 font-display text-[0.78rem] font-semibold uppercase tracking-wider text-muted">{section.replace(/_/g, " ")}</h6>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                            {Object.entries(sectionData).map(([k, v]) => <InfoRow key={k} label={k.replace(/_/g, " ")} value={v} />)}
                        </div>
                    </div>
                );
            })}
        </div>
    );
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

                                <div className="mt-3 grid gap-2">
                                    {entry.golden_metrics ? (
                                        <Collapsible label="Golden metrics">
                                            <GoldenMetricsBlock data={entry.golden_metrics as Record<string, unknown>} />
                                        </Collapsible>
                                    ) : null}
                                    {entry.ai_metrics ? (
                                        <Collapsible label="AI metrics">
                                            <AiMetricsBlock data={entry.ai_metrics as Record<string, unknown>} />
                                        </Collapsible>
                                    ) : null}
                                    <Collapsible label="Cross metrics">
                                        {entry.cross_metrics ? (
                                            <pre className="m-0 overflow-x-auto whitespace-pre-wrap bg-subtle p-3 text-[0.75rem] leading-normal min-w-0">{JSON.stringify(entry.cross_metrics, null, 2)}</pre>
                                        ) : (
                                            <p className="m-0 p-3 text-[0.82rem] text-muted">Not computed yet.</p>
                                        )}
                                    </Collapsible>
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