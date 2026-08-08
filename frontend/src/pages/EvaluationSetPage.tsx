import { useEffect, useState } from "react";

import {
    createEvaluationRun,
    deleteEvaluationRun,
    deleteEvaluationSet,
    evaluateMissingGoldenMetrics,
    exportEvaluationSet,
    getEvaluationSet,
    listEvaluationRuns,
} from "../api/research";
import { getSupportedModels, getSupportedModes } from "../api/client";
import { Collapsible } from "../components/Collapsible";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { navigateTo } from "../utils/researchRouting";
import { splitProviderModel } from "../utils/utils";
import type { EvaluationRunListItem, EvaluationSetDetail } from "../types/research";

function downloadJson(filename: string, data: unknown) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

type Props = {
    setId: string;
};

export function EvaluationSetPage({ setId }: Props) {
    const [selectedSet, setSelectedSet] = useState<EvaluationSetDetail | null>(null);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isEvaluatingMetrics, setIsEvaluatingMetrics] = useState(false);
    const [flashMessage, setFlashMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const [existingRuns, setExistingRuns] = useState<EvaluationRunListItem[]>([]);
    const [isLoadingExistingRuns, setIsLoadingExistingRuns] = useState(false);
    const [isSubmittingNewRun, setIsSubmittingNewRun] = useState(false);

    const [newRunAvailableModels, setNewRunAvailableModels] = useState<Record<string, string[]>>({});
    const [newRunAvailableModes, setNewRunAvailableModes] = useState<Record<string, string>>({});
    const [newRunSelectedModel, setNewRunSelectedModel] = useState("");
    const [newRunSummaryMode, setNewRunSummaryMode] = useState("simple");
    const [newRunDelayMs, setNewRunDelayMs] = useState(1500);
    const [isLoadingNewRunOptions, setIsLoadingNewRunOptions] = useState(true);

    const [isSetDeletePending, setIsSetDeletePending] = useState(false);
    const [isDeletingSet, setIsDeletingSet] = useState(false);
    const [runPendingDelete, setRunPendingDelete] = useState<EvaluationRunListItem | null>(null);
    const [isDeletingRun, setIsDeletingRun] = useState(false);

    const loadSetDetail = async () => {
        setIsLoadingDetail(true);
        try {
            const data = await getEvaluationSet(setId);
            setSelectedSet(data);
        } finally {
            setIsLoadingDetail(false);
        }
    };

    const loadExistingRuns = async () => {
        setIsLoadingExistingRuns(true);
        try {
            const data = await listEvaluationRuns(setId);
            setExistingRuns(data);
        } finally {
            setIsLoadingExistingRuns(false);
        }
    };

    const handleExportSet = async () => {
        if (!selectedSet) return;

        setErrorMessage(null);
        setFlashMessage(null);
        setIsExporting(true);

        try {
            const data = await exportEvaluationSet(setId);
            downloadJson(`${selectedSet.name}.json`, data);
            setFlashMessage(`Wyeksportowano EvaluationSet: ${selectedSet.name}.`);
        } catch (error) {
            setErrorMessage(`Export nie powiódł się: ${String(error)}`);
        } finally {
            setIsExporting(false);
        }
    };

    const handleEvaluateMetrics = async () => {
        setErrorMessage(null);
        setFlashMessage(null);
        setIsEvaluatingMetrics(true);

        try {
            const result = await evaluateMissingGoldenMetrics(setId);
            setFlashMessage(
                `Golden metrics updated for ${result.updated_entries} of ${result.total_entries} entries.`,
            );
            await loadSetDetail();
        } catch (error) {
            setErrorMessage(`Golden metrics evaluation failed: ${String(error)}`);
        } finally {
            setIsEvaluatingMetrics(false);
        }
    };

    const handleSubmitNewRun = async () => {
        if (!selectedSet) return;

        setErrorMessage(null);
        setFlashMessage(null);
        setIsSubmittingNewRun(true);

        try {
            const { provider, modelName } = splitProviderModel(newRunSelectedModel);

            const created = await createEvaluationRun(setId, {
                model_provider: provider,
                model_name: modelName,
                summary_mode: newRunSummaryMode,
                language: "en",
                rate_limit_delay_ms: newRunDelayMs,
            });

            setFlashMessage(`EvaluationRun created: ${created.evaluation_run_id}`);
            await loadExistingRuns();
        } catch (error) {
            setErrorMessage(`Create run failed: ${String(error)}`);
        } finally {
            setIsSubmittingNewRun(false);
        }
    };

    const handleConfirmDeleteSet = async () => {
        setIsDeletingSet(true);
        try {
            await deleteEvaluationSet(setId);
            navigateTo("/research");
        } catch (error) {
            setErrorMessage(`Delete set failed: ${String(error)}`);
            setIsDeletingSet(false);
            setIsSetDeletePending(false);
        }
    };

    const handleConfirmDeleteRun = async () => {
        if (!runPendingDelete) return;
        setIsDeletingRun(true);
        try {
            await deleteEvaluationRun(runPendingDelete.evaluation_run_id);
            setRunPendingDelete(null);
            await loadExistingRuns();
        } catch (error) {
            setErrorMessage(`Delete run failed: ${String(error)}`);
        } finally {
            setIsDeletingRun(false);
        }
    };

    useEffect(() => {
        void loadSetDetail();
        void loadExistingRuns();
    }, [setId]);

    useEffect(() => {
        if (!flashMessage) return;
        const t = setTimeout(() => setFlashMessage(null), 4500);
        return () => clearTimeout(t);
    }, [flashMessage]);

    useEffect(() => {
        let isMounted = true;

        const loadNewRunOptions = async () => {
            try {
                const [models, modes] = await Promise.all([
                    getSupportedModels(),
                    getSupportedModes(),
                ]);

                if (!isMounted) return;

                setNewRunAvailableModels(models);
                setNewRunAvailableModes(modes);

                const firstProvider = Object.keys(models)[0];
                const firstModel = firstProvider ? models[firstProvider]?.[0] : "";
                if (firstProvider && firstModel) {
                    setNewRunSelectedModel(`${firstProvider}:${firstModel}`);
                }

                const firstMode = Object.keys(modes)[0];
                if (firstMode) {
                    setNewRunSummaryMode(firstMode);
                }
            } catch (error) {
                if (!isMounted) return;
                setErrorMessage(`Nie udało się pobrać konfiguracji runa: ${String(error)}`);
            } finally {
                if (isMounted) setIsLoadingNewRunOptions(false);
            }
        };

        void loadNewRunOptions();

        return () => {
            isMounted = false;
        };
    }, []);

    return (
        <main className="mx-auto grid w-full max-w-355 gap-4 px-3.5 py-7">
            <section className="panel-shell min-w-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <p className="section-kicker">Evaluation set</p>
                        <h1 className="m-0 font-display text-[1.1rem] uppercase tracking-[0.04em]">
                            {selectedSet?.name ?? "Loading..."}
                        </h1>
                        <p className="helper-copy mt-2">
                            {selectedSet
                                ? `${selectedSet.language} · ${selectedSet.entries.length} entries`
                                : "Ładowanie szczegółów seta..."}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => void handleEvaluateMetrics()}
                        disabled={!selectedSet || isEvaluatingMetrics}
                        className="border border-panel-border bg-accent-500 px-3 py-2 text-[0.85rem] text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isEvaluatingMetrics ? "Evaluating..." : "Evaluate metrics"}
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleExportSet()}
                        disabled={!selectedSet || isExporting}
                        className="border border-panel-border bg-panel-solid px-3 py-2 text-[0.85rem] text-ink hover:bg-subtle-hover disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isExporting ? "Exporting..." : "Export JSON"}
                    </button>
                    <button
                        type="button"
                        onClick={() => navigateTo("/research")}
                        className="border border-panel-border bg-panel-solid px-3 py-2 text-[0.85rem] text-ink hover:bg-subtle-hover"
                    >
                        Back to sets
                    </button>
                    <button
                        type="button"
                        onClick={() => setIsSetDeletePending(true)}
                        disabled={!selectedSet}
                        className="border border-danger bg-panel-solid px-3 py-2 text-[0.85rem] text-danger hover:bg-subtle-hover disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        Delete set
                    </button>
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

                {selectedSet ? (
                    <section className="mt-4 grid gap-3 border border-panel-border bg-panel-solid px-3.5 py-3">
                        <div>
                            <p className="m-0 text-[0.82rem] uppercase tracking-[0.04em] text-label">
                                New evaluation run
                            </p>
                            <p className="helper-copy mt-1">
                                Naiwny runner generuje tylko AI summary i podstawowe metryki tekstowe. Bez GEval.
                            </p>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                            <label className="grid gap-1.5 md:col-span-2">
                                <span className="text-[0.9rem] text-label">Model</span>
                                <select
                                    value={newRunSelectedModel}
                                    onChange={(event) => setNewRunSelectedModel(event.target.value)}
                                    disabled={isSubmittingNewRun || isLoadingNewRunOptions}
                                    className="h-11 border border-input-border bg-panel-solid px-3 text-ink outline-none focus:border-input-focus disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {Object.entries(newRunAvailableModels).map(([provider, modelList]) =>
                                        modelList.map((model) => (
                                            <option key={`${provider}:${model}`} value={`${provider}:${model}`}>
                                                {provider} – {model}
                                            </option>
                                        ))
                                    )}
                                </select>
                            </label>

                            <label className="grid gap-1.5">
                                <span className="text-[0.9rem] text-label">Summary mode</span>
                                <select
                                    value={newRunSummaryMode}
                                    onChange={(event) => setNewRunSummaryMode(event.target.value)}
                                    disabled={isSubmittingNewRun || isLoadingNewRunOptions}
                                    className="h-11 border border-input-border bg-panel-solid px-3 text-ink outline-none focus:border-input-focus disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {Object.entries(newRunAvailableModes).map(([modeKey, modeLabel]) => (
                                        <option key={modeKey} value={modeKey}>
                                            {modeLabel}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="grid gap-1.5">
                                <span className="text-[0.9rem] text-label">Delay between entries (ms)</span>
                                <input
                                    type="number"
                                    min={0}
                                    step={100}
                                    value={newRunDelayMs}
                                    onChange={(event) => setNewRunDelayMs(Number(event.target.value))}
                                    className="h-11 border border-input-border bg-panel-solid px-3 text-ink outline-none focus:border-input-focus"
                                />
                            </label>
                        </div>

                        <div className="flex items-center gap-2.5">
                            <button
                                type="button"
                                onClick={() => void handleSubmitNewRun()}
                                disabled={isSubmittingNewRun || isLoadingNewRunOptions || !newRunSelectedModel}
                                className="border border-panel-border bg-accent-500 px-3.5 py-2 text-[0.94rem] text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isSubmittingNewRun ? "Creating..." : "Create evaluation run"}
                            </button>
                        </div>
                    </section>
                ) : null}

                <section className="mt-4 grid gap-3 border border-panel-border bg-panel-solid px-3.5 py-3">
                    <div>
                        <p className="m-0 text-[0.82rem] uppercase tracking-[0.04em] text-label">
                            Evaluation runs
                        </p>
                    </div>

                    {isLoadingExistingRuns ? (
                        <p className="helper-copy">Ładowanie runów...</p>
                    ) : existingRuns.length === 0 ? (
                        <p className="helper-copy">Brak EvaluationRunów dla tego seta.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-left text-[0.94rem]">
                                <thead>
                                    <tr className="border-b border-divider">
                                        <th className="px-2.5 py-2 font-medium">Provider</th>
                                        <th className="px-2.5 py-2 font-medium">Model</th>
                                        <th className="px-2.5 py-2 font-medium">Mode</th>
                                        <th className="px-2.5 py-2 font-medium">Status</th>
                                        <th className="px-2.5 py-2 font-medium">Entries</th>
                                        <th className="px-2.5 py-2 font-medium">Created</th>
                                        <th className="px-2.5 py-2 font-medium text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {existingRuns.map((run) => (
                                        <tr key={run.evaluation_run_id} className="border-b border-divider">
                                            <td className="px-2.5 py-2.5">{run.model_provider}</td>
                                            <td className="px-2.5 py-2.5">{run.model_name}</td>
                                            <td className="px-2.5 py-2.5">{run.summary_mode}</td>
                                            <td className="px-2.5 py-2.5">{run.status}</td>
                                            <td className="px-2.5 py-2.5">{run.entry_count}</td>
                                            <td className="px-2.5 py-2.5">
                                                {new Date(run.created_at).toLocaleString()}
                                            </td>
                                            <td className="px-2.5 py-2.5 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => navigateTo(`/research/runs/${run.evaluation_run_id}`)}
                                                        className="border border-panel-border bg-panel-solid px-3 py-1.5 text-[0.85rem] text-ink hover:bg-subtle-hover"
                                                    >
                                                        Open
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setRunPendingDelete(run)}
                                                        className="border border-danger bg-panel-solid px-3 py-1.5 text-[0.85rem] text-danger hover:bg-subtle-hover"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                {isLoadingDetail ? (
                    <p className="helper-copy mt-4">Ładowanie szczegółów EvaluationSet...</p>
                ) : selectedSet ? (
                    <div className="mt-4 grid gap-3">
                        {selectedSet.entries.map((entry, index) => (
                            <article
                                key={entry.entry_id}
                                className="border border-panel-border bg-panel-solid px-3.5 py-3"
                            >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                        <p className="m-0 text-[0.82rem] uppercase tracking-[0.04em] text-label">
                                            Entry {index + 1}
                                        </p>
                                        <p className="m-0 mt-1 font-mono text-[0.82rem] text-muted">
                                            {entry.entry_id}
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-3 grid gap-3">
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
                                            Source
                                        </p>
                                        <p className="m-0 mt-1 text-[0.82rem] text-muted">
                                            {entry.title} · {entry.url}
                                        </p>
                                    </div>

                                    <Collapsible label="Golden metrics">
                                        <pre className="m-0 overflow-x-auto whitespace-pre-wrap bg-subtle p-3 font-mono text-[0.82rem] leading-normal text-muted">
{JSON.stringify(entry.golden_metrics, null, 2)}
                                        </pre>
                                    </Collapsible>
                                </div>
                            </article>
                        ))}
                    </div>
                ) : (
                    <p className="helper-copy mt-4">Nie znaleziono EvaluationSet.</p>
                )}
            </section>

            <ConfirmDialog
                isOpen={isSetDeletePending}
                title="Usunąć evaluation set?"
                message={
                    selectedSet
                        ? `Usunąć "${selectedSet.name}"?${existingRuns.length > 0 ? ` Usunie to też ${existingRuns.length} evaluation run(y/ów).` : ""}`
                        : ""
                }
                isConfirming={isDeletingSet}
                onConfirm={() => void handleConfirmDeleteSet()}
                onClose={() => setIsSetDeletePending(false)}
            />

            <ConfirmDialog
                isOpen={Boolean(runPendingDelete)}
                title="Usunąć evaluation run?"
                message={runPendingDelete ? `Usunąć run ${runPendingDelete.model_provider}:${runPendingDelete.model_name} (${runPendingDelete.evaluation_run_id})?` : ""}
                isConfirming={isDeletingRun}
                onConfirm={() => void handleConfirmDeleteRun()}
                onClose={() => setRunPendingDelete(null)}
            />
        </main>
    );
}
