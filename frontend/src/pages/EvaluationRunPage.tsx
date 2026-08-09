import { useEffect, useState } from "react";

import {
    evaluateRunDeepeval,
    getEvaluationRun,
    getEvaluationRunEntries,
} from "../api/research";
import { DeepevalItems, type DeepevalDisplayItem } from "../components/DeepevalItems";
import { InfoRow } from "../components/InfoRow";
import { InputTextSection } from "../components/InputTextSection";
import { PreBlock } from "../components/PreBlock";
import { navigateTo } from "../utils/researchRouting";
import type { EvaluationRunEntry, EvaluationRunMeta, SummaryDeterministicMetrics } from "../types/research";

type EntryCollapsibleKey = "input" | "metrics";

const PAIRWISE_TIE_MARGIN = 0.05;

function pairwiseWinnerLabel(score: number): "golden" | "ai" | "tie" {
    if (score > 0.5 + PAIRWISE_TIE_MARGIN) return "ai";
    if (score < 0.5 - PAIRWISE_TIE_MARGIN) return "golden";
    return "tie";
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
    const goldenSummary: Partial<SummaryDeterministicMetrics> = entry.golden_metrics?.summary ?? {};
    const aiSummary: Partial<SummaryDeterministicMetrics> = entry.ai_metrics?.summary ?? {};

    const allLabels = Array.from(
        new Set([...Object.keys(goldenSummary), ...Object.keys(aiSummary)]),
    ) as (keyof SummaryDeterministicMetrics)[];

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
                        AI key takeaways
                    </h6>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        <InfoRow label="Bullet count" value={entry.ai_metrics.key_takeaways.bullet_count} />
                        <InfoRow label="Total lines" value={entry.ai_metrics.key_takeaways.total_lines} />
                        <InfoRow label="Word count" value={entry.ai_metrics.key_takeaways.word_count} />
                        <InfoRow label="Unique word count" value={entry.ai_metrics.key_takeaways.unique_word_count} />
                        <InfoRow label="Type token ratio" value={entry.ai_metrics.key_takeaways.type_token_ratio} />
                        <InfoRow label="Avg bullet word count" value={entry.ai_metrics.key_takeaways.avg_bullet_word_count} />
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function DeepevalMetricsColumns({ entry }: { entry: EvaluationRunEntry }) {
    const goldenItems: DeepevalDisplayItem[] = entry.golden_metrics?.deepeval ?? [];
    const aiItems: DeepevalDisplayItem[] = entry.ai_metrics?.deepeval ?? [];

    if (goldenItems.length === 0 && aiItems.length === 0) return null;

    return (
        <div className="space-y-2 border-t border-divider pt-3">
            <h6 className="m-0 font-display text-[0.78rem] font-semibold uppercase tracking-wider text-muted">Deepeval</h6>
            <div className="grid grid-cols-2 gap-3">
                <div>{goldenItems.length > 0 ? <DeepevalItems items={goldenItems} /> : <p className="m-0 text-[0.78rem] italic text-muted">—</p>}</div>
                <div>{aiItems.length > 0 ? <DeepevalItems items={aiItems} /> : <p className="m-0 text-[0.78rem] italic text-muted">—</p>}</div>
            </div>
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
                                    winner: {pairwiseWinnerLabel(item.score)} · score: {item.score}
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

function RunEntryCard({ index, entry, evaluationSetId }: { index: number; entry: EvaluationRunEntry; evaluationSetId: string }) {
    const [openSection, setOpenSection] = useState<EntryCollapsibleKey | null>(null);

    const toggleSection = (key: EntryCollapsibleKey) => {
        setOpenSection(current => (current === key ? null : key));
    };

    return (
        <article className="border border-panel-border bg-panel-solid px-3.5 py-3">
            <p className="m-0 text-[0.82rem] text-ink">
                <span className="font-medium">{index + 1}</span>
                {" · "}
                <span>{entry.status}</span>
                {" · "}
                <span className="lowercase text-muted">{entry.title} · {entry.url}</span>
            </p>

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

            <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                    type="button"
                    onClick={() => toggleSection("input")}
                    className="flex items-center justify-between border border-panel-border px-3 py-2 text-left text-[0.75rem] uppercase tracking-wider text-muted transition-colors hover:bg-subtle"
                >
                    <span>Input text</span>
                    <span>{openSection === "input" ? "▼" : "▶"}</span>
                </button>

                <button
                    type="button"
                    onClick={() => toggleSection("metrics")}
                    className="flex items-center justify-between border border-panel-border px-3 py-2 text-left text-[0.75rem] uppercase tracking-wider text-muted transition-colors hover:bg-subtle"
                >
                    <span>Metrics</span>
                    <span>{openSection === "metrics" ? "▼" : "▶"}</span>
                </button>
            </div>

            {openSection === "input" ? (
                <div className="border border-t-0 border-panel-border">
                    <InputTextSection setId={evaluationSetId} entryId={entry.entry_id} />
                </div>
            ) : null}

            {openSection === "metrics" ? (
                <div className="border border-t-0 border-panel-border">
                    <EntryMetrics entry={entry} />
                </div>
            ) : null}
        </article>
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
                ) : entries && run ? (
                    <div className="mt-4 grid gap-3">
                        {entries.map((entry, index) => (
                            <RunEntryCard
                                key={entry.entry_id}
                                index={index}
                                entry={entry}
                                evaluationSetId={run.evaluation_set_id}
                            />
                        ))}
                    </div>
                ) : null}
            </section>
        </main>
    );
}
