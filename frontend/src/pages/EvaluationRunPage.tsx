import { useEffect, useState } from "react";

import {
    evaluateRunDeepeval,
    getEvaluationRun,
    getEvaluationRunEntries,
    getEvaluationSetEntryInputText,
} from "../api/research";
import { Collapsible } from "../components/Collapsible";
import { DeepevalItems, type DeepevalDisplayItem } from "../components/DeepevalItems";
import { InfoRow } from "../components/InfoRow";
import { PreBlock } from "../components/PreBlock";
import { navigateTo } from "../utils/researchRouting";
import type { EvaluationRunEntry, EvaluationRunMeta, SourceMeta } from "../types/research";

function EntryMetaLine({ sourceMeta }: { sourceMeta: SourceMeta }) {
    return (
        <p className="m-0 mt-0.5 text-[0.78rem] lowercase text-muted">
            {sourceMeta.title} · {sourceMeta.url}
        </p>
    );
}

function InputTextSection({ setId, entryId }: { setId: string; entryId: string }) {
    const [inputText, setInputText] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;

        getEvaluationSetEntryInputText(setId, entryId)
            .then((data) => {
                if (!isMounted) return;
                setInputText(data.input_text);
            })
            .catch((error: unknown) => {
                if (!isMounted) return;
                setErrorMessage(`Nie udało się pobrać input text: ${String(error)}`);
            })
            .finally(() => {
                if (isMounted) setIsLoading(false);
            });

        return () => {
            isMounted = false;
        };
    }, [setId, entryId]);

    if (isLoading) return <p className="m-0 p-3 text-[0.82rem] text-muted">Ładowanie...</p>;
    if (errorMessage) return <p className="m-0 p-3 text-[0.82rem] text-danger">{errorMessage}</p>;

    return <PreBlock>{inputText ?? ""}</PreBlock>;
}

function formatLabel(key: string): string {
    return key.replace(/_/g, " ");
}

function MetricRow({ label, golden, ai }: { label: string; golden: number | null | undefined; ai: number | null | undefined }) {
    return (
        <div className="grid grid-cols-2 gap-3">
            <InfoRow label={label} value={golden} />
            <InfoRow label={label} value={ai} />
        </div>
    );
}

function ColumnsHeader() {
    return (
        <div className="grid grid-cols-2 gap-3">
            <h6 className="m-0 font-display text-[0.78rem] font-semibold uppercase tracking-wider text-muted">Golden</h6>
            <h6 className="m-0 font-display text-[0.78rem] font-semibold uppercase tracking-wider text-muted">AI</h6>
        </div>
    );
}

function DeterministicMetricsColumns({ entry }: { entry: EvaluationRunEntry }) {
    const goldenSummary = entry.golden_metrics?.summary ?? {};
    const aiSummary = entry.ai_metrics?.summary ?? {};

    const allLabels = Array.from(new Set([...Object.keys(goldenSummary), ...Object.keys(aiSummary)]));

    return (
        <div className="space-y-2">
            {allLabels.length > 0 ? (
                <>
                    <ColumnsHeader />
                    {!entry.golden_metrics ? (
                        <p className="m-0 text-[0.78rem] italic text-muted">Golden metrics not computed for this entry.</p>
                    ) : null}
                    {allLabels.map((label) => (
                        <MetricRow key={label} label={formatLabel(label)} golden={goldenSummary[label]} ai={aiSummary[label]} />
                    ))}
                </>
            ) : null}

            {entry.ai_metrics ? (
                <div className="space-y-2 border-t border-divider pt-3">
                    <h6 className="m-0 font-display text-[0.78rem] font-semibold uppercase tracking-wider text-muted">
                        AI takeaways &amp; compression
                    </h6>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        {Object.entries(entry.ai_metrics.key_takeaways).map(([label, value]) => (
                            <InfoRow key={label} label={formatLabel(label)} value={value} />
                        ))}
                        {Object.entries(entry.ai_metrics.compression).map(([label, value]) => (
                            <InfoRow key={label} label={formatLabel(label)} value={value} />
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function DeepevalMetricsColumns({ entry }: { entry: EvaluationRunEntry }) {
    const goldenDeepeval = entry.golden_metrics?.deepeval;
    const aiDeepeval = entry.ai_metrics?.deepeval;

    const sections = Array.from(
        new Set([
            ...(goldenDeepeval ? Object.keys(goldenDeepeval) : []),
            ...(aiDeepeval ? Object.keys(aiDeepeval) : []),
        ]),
    ) as (keyof NonNullable<typeof goldenDeepeval> | keyof NonNullable<typeof aiDeepeval>)[];

    if (sections.length === 0) return null;

    return (
        <div className="space-y-3 border-t border-divider pt-3">
            <h6 className="m-0 font-display text-[0.78rem] font-semibold uppercase tracking-wider text-muted">Deepeval</h6>
            {sections.map((section) => {
                const goldenItems = (goldenDeepeval as Record<string, DeepevalDisplayItem[]> | undefined)?.[section as string] ?? [];
                const aiItems = (aiDeepeval as Record<string, DeepevalDisplayItem[]> | undefined)?.[section as string] ?? [];
                if (goldenItems.length === 0 && aiItems.length === 0) return null;

                return (
                    <div key={section as string} className="space-y-2">
                        <span className="font-mono text-[0.72rem] uppercase tracking-wider text-muted">{section as string}</span>
                        <div className="grid grid-cols-2 gap-3">
                            <div>{goldenItems.length > 0 ? <DeepevalItems items={goldenItems} /> : <p className="m-0 text-[0.78rem] italic text-muted">—</p>}</div>
                            <div>{aiItems.length > 0 ? <DeepevalItems items={aiItems} /> : <p className="m-0 text-[0.78rem] italic text-muted">—</p>}</div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function CrossMetricsSection({ entry }: { entry: EvaluationRunEntry }) {
    if (!entry.cross_metrics) {
        return <p className="m-0 p-3 text-[0.82rem] text-muted">Not computed yet.</p>;
    }

    const { rouge1, rouge2, rougeL, meteor, deepeval } = entry.cross_metrics;

    return (
        <div className="space-y-3 p-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                <InfoRow label="rouge1" value={rouge1} />
                <InfoRow label="rouge2" value={rouge2} />
                <InfoRow label="rougeL" value={rougeL} />
                <InfoRow label="meteor" value={meteor} />
            </div>
            {deepeval.length > 0 ? (
                <div className="space-y-2 border-t border-divider pt-3">
                    {deepeval.map((item) => (
                        <div key={item.name} className="border border-panel-border bg-panel-bg px-3 py-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-mono text-[0.82rem] font-semibold uppercase tracking-wider text-ink">
                                    {item.name}
                                </span>
                                <span className="font-mono text-[0.75rem] text-muted">
                                    winner: {item.winner} · A: {item.score_A} · B: {item.score_B}
                                </span>
                            </div>
                            <p className="mt-2 m-0 text-[0.82rem] leading-[1.55] text-muted">{item.reason}</p>
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function EntryMetrics({ entry }: { entry: EvaluationRunEntry }) {
    return (
        <div className="space-y-4 p-3">
            <div>
                <h6 className="m-0 mb-2 font-display text-[0.78rem] font-semibold uppercase tracking-wider text-muted">Cross metrics</h6>
                <CrossMetricsSection entry={entry} />
            </div>
            <div className="border-t border-divider pt-3">
                <DeterministicMetricsColumns entry={entry} />
                <DeepevalMetricsColumns entry={entry} />
            </div>
        </div>
    );
}

type Props = {
    runId: string;
};

export function EvaluationRunPage({ runId }: Props) {
    const [run, setRun] = useState<EvaluationRunMeta | null>(null);
    const [entries, setEntries] = useState<EvaluationRunEntry[] | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingEntries, setIsLoadingEntries] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [flashMessage, setFlashMessage] = useState<string | null>(null);
    const [isEvaluatingDeepeval, setIsEvaluatingDeepeval] = useState(false);

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

    const loadEntries = async () => {
        setIsLoadingEntries(true);
        try {
            const data = await getEvaluationRunEntries(runId);
            setEntries(data.entries);
        } catch (error) {
            setErrorMessage(`Nie udało się pobrać entries: ${String(error)}`);
        } finally {
            setIsLoadingEntries(false);
        }
    };

    useEffect(() => {
        setIsLoading(true);
        setIsLoadingEntries(true);
        void loadRun();
        void loadEntries();
    }, [runId]);

    useEffect(() => {
        if (!flashMessage) return;
        const timeoutId = setTimeout(() => setFlashMessage(null), 4500);
        return () => clearTimeout(timeoutId);
    }, [flashMessage]);

    const handleBack = () => {
        navigateTo(run ? `/research/${run.evaluation_set_id}` : "/research");
    };

    const handleDeepeval = async () => {
        setErrorMessage(null);
        setFlashMessage(null);
        setIsEvaluatingDeepeval(true);
        try {
            await evaluateRunDeepeval(runId);
            setFlashMessage("GEval queued. Refresh za chwilę aby zobaczyć wyniki.");
        } catch (error) {
            setErrorMessage(`GEval failed: ${String(error)}`);
        } finally {
            setIsEvaluatingDeepeval(false);
        }
    };

    const handleRefresh = () => {
        void loadRun();
        void loadEntries();
    };

    return (
        <main className="mx-auto grid w-full max-w-355 gap-4 px-3.5 py-7">
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
                            onClick={() => void handleDeepeval()}
                            disabled={!run || run.status === "pending" || run.status === "running" || isEvaluatingDeepeval}
                            className="border border-panel-border bg-accent-500 px-3 py-2 text-[0.85rem] text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isEvaluatingDeepeval ? "Running..." : "Run GEVal"}
                        </button>
                        <button
                            type="button"
                            onClick={handleRefresh}
                            disabled={isLoading || isLoadingEntries}
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

                {flashMessage ? (
                    <div className="mt-4 border border-success-border bg-success-bg px-3.5 py-2.5 text-[0.94rem] text-success-text">
                        {flashMessage}
                    </div>
                ) : null}

                {errorMessage ? (
                    <div className="mt-4 border border-danger bg-panel-solid px-3.5 py-2.5 text-[0.94rem] text-danger">
                        {errorMessage}
                    </div>
                ) : null}

                {run ? (
                    <div className="mt-4 grid gap-1 border border-panel-border bg-panel-solid px-3.5 py-2.5 text-[0.9rem]">
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                            <span>Status: {run.status}</span>
                            <span>Created: {new Date(run.created_at).toLocaleString()}</span>
                            <span>Finished: {run.finished_at ? new Date(run.finished_at).toLocaleString() : "—"}</span>
                        </div>
                        <div className="mt-1 text-[0.82rem] text-muted">
                            <PreBlock>{JSON.stringify(run.aggregate_metrics, null, 2)}</PreBlock>
                        </div>
                    </div>
                ) : isLoading ? (
                    <p className="helper-copy mt-4">Ładowanie szczegółów runa...</p>
                ) : null}

                {isLoadingEntries ? (
                    <p className="helper-copy mt-4">Ładowanie entries...</p>
                ) : entries ? (
                    <div className="mt-4 grid gap-3">
                        {entries.map((entry, index) => (
                            <article
                                key={entry.entry_id}
                                className="border border-panel-border bg-panel-solid px-3.5 py-3"
                            >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                        <p className="m-0 text-[0.82rem] uppercase tracking-[0.04em] text-label">
                                            Entry {index + 1} · {entry.status}
                                        </p>
                                        <EntryMetaLine sourceMeta={entry.source_meta} />
                                    </div>
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
                                    </div>
                                </div>

                                <div className="mt-3 grid gap-2">
                                    <Collapsible label="Input text">
                                        {run ? (
                                            <InputTextSection setId={run.evaluation_set_id} entryId={entry.entry_id} />
                                        ) : null}
                                    </Collapsible>
                                    <Collapsible label="Metrics">
                                        <EntryMetrics entry={entry} />
                                    </Collapsible>
                                </div>
                            </article>
                        ))}
                    </div>
                ) : null}
            </section>
        </main>
    );
}
