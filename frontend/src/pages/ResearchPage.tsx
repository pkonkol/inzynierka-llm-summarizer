import { useEffect, useMemo, useState } from "react";

import {
    evaluateMissingGoldenMetrics,
    createEvaluationSet,
    getEvaluationSet,
    listEvaluationSets,
    exportEvaluationSet,
    listEvaluationRuns,
    createEvaluationRun,
 } from "../api/research";
import {
    getSupportedModels,
    getSupportedModes,
} from "../api/client";
import { RunDetailPage } from "./RunDetailPage";


import { splitProviderModel } from "../utils/utils";


import type {
    EvaluationSetDetail,
    EvaluationSetImportPayload,
    EvaluationSetListItem,
    EvaluationRunListItem,
} from "../types/research";

const PRETTY_EXAMPLE = `{
  "name": "cnn-sample1",
  "language": "en",
  "entries": [
    {
      "input_text": "Example input text",
      "golden_summary": "Example golden summary",
      "source_meta": {
        "title": "Example title",
        "url": "https://example.com/article"
      },
      "golden_metrics": null
    }
  ]
}`;

function getResearchSetIdFromPath(pathname: string): string | null {
    const match = pathname.match(/^\/research\/([^/]+)$/);
    return match?.[1] ?? null;
}

function getRunIdFromPath(pathname: string): string | null {
    const match = pathname.match(/^\/research\/runs\/([^/]+)$/);
    return match?.[1] ?? null;
}


function navigateTo(path: string) {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
}

function downloadJson(filename: string, data: unknown) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

export function ResearchPage() {
    const [rawJson, setRawJson] = useState(PRETTY_EXAMPLE);
    const [sets, setSets] = useState<EvaluationSetListItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isImporting, setIsImporting] = useState(false);
    const [flashMessage, setFlashMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const [pathname, setPathname] = useState(window.location.pathname);
    const [selectedSet, setSelectedSet] = useState<EvaluationSetDetail | null>(null);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);

    const [isExporting, setIsExporting] = useState(false);

    const [isEvaluatingMetrics, setIsEvaluatingMetrics] = useState(false);

    const [runs, setRuns] = useState<EvaluationRunListItem[]>([]);
    const [isLoadingRuns, setIsLoadingRuns] = useState(false);
    const [isCreatingRun, setIsCreatingRun] = useState(false);

    const [runModels, setRunModels] = useState<Record<string, string[]>>({});
    const [runModes, setRunModes] = useState<Record<string, string>>({});
    const [selectedRunModel, setSelectedRunModel] = useState("");
    const [runSummaryMode, setRunSummaryMode] = useState("simple");
    const [runDelayMs, setRunDelayMs] = useState(1500);
    const [isLoadingRunMeta, setIsLoadingRunMeta] = useState(true);


    const parsedPreview = useMemo(() => {
        try {
            const parsed = JSON.parse(rawJson) as EvaluationSetImportPayload;
            return {
                name: parsed.name,
                language: parsed.language,
                entryCount: parsed.entries?.length ?? 0,
                isValid: true,
            };
        } catch {
            return {
                name: null,
                language: null,
                entryCount: 0,
                isValid: false,
            };
        }
    }, [rawJson]);

    const selectedSetId = getResearchSetIdFromPath(pathname);
    const runId = getRunIdFromPath(pathname);
    const isDetailView = Boolean(selectedSetId);


    const loadSets = async () => {
        const data = await listEvaluationSets();
        setSets(data);
    };

    const loadSetDetail = async (setId: string) => {
        setIsLoadingDetail(true);
        try {
            const data = await getEvaluationSet(setId);
            setSelectedSet(data);
        } finally {
            setIsLoadingDetail(false);
        }
    };

    const loadRuns = async (setId: string) => {
        setIsLoadingRuns(true);
        try {
            const data = await listEvaluationRuns(setId);
            setRuns(data);
        } finally {
            setIsLoadingRuns(false);
        }
    };


    const handleImport = async () => {
        setErrorMessage(null);
        setFlashMessage(null);

        let payload: EvaluationSetImportPayload;
        try {
            payload = JSON.parse(rawJson) as EvaluationSetImportPayload;
        } catch {
            setErrorMessage("Niepoprawny JSON.");
            return;
        }

        setIsImporting(true);
        try {
            const created = await createEvaluationSet(payload);
            setFlashMessage(`Zaimportowano EvaluationSet: ${created.name} (${created.entry_count} entries).`);
            await loadSets();
        } catch (error) {
            setErrorMessage(`Import nie powiódł się: ${String(error)}`);
        } finally {
            setIsImporting(false);
        }
    };

    const handleExportSet = async () => {
        if (!selectedSetId || !selectedSet) return;

        setErrorMessage(null);
        setFlashMessage(null);
        setIsExporting(true);

        try {
            const data = await exportEvaluationSet(selectedSetId);
            downloadJson(`${selectedSet.name}.json`, data);
            setFlashMessage(`Wyeksportowano EvaluationSet: ${selectedSet.name}.`);
        } catch (error) {
            setErrorMessage(`Export nie powiódł się: ${String(error)}`);
        } finally {
            setIsExporting(false);
        }
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            setRawJson(text);
            setErrorMessage(null);
        } catch (error) {
            setErrorMessage(`Nie udało się odczytać pliku: ${String(error)}`);
        }

        event.target.value = "";
    };

    const handleEvaluateMetrics = async () => {
        if (!selectedSetId) return;

        setErrorMessage(null);
        setFlashMessage(null);
        setIsEvaluatingMetrics(true);

        try {
            const result = await evaluateMissingGoldenMetrics(selectedSetId);
            setFlashMessage(
                `Golden metrics updated for ${result.updated_entries} of ${result.total_entries} entries.`,
            );
            await loadSetDetail(selectedSetId);
        } catch (error) {
            setErrorMessage(`Golden metrics evaluation failed: ${String(error)}`);
        } finally {
            setIsEvaluatingMetrics(false);
        }
    };

    const handleCreateRun = async () => {
        if (!selectedSetId || !selectedSet) return;

        setErrorMessage(null);
        setFlashMessage(null);
        setIsCreatingRun(true);

        try {
            const { provider, modelName } = splitProviderModel(selectedRunModel);

            const created = await createEvaluationRun(selectedSetId, {
                model_provider: provider,
                model_name: modelName,
                summary_mode: runSummaryMode,
                language: "en",
                rate_limit_delay_ms: runDelayMs,
            });

            setFlashMessage(`EvaluationRun created: ${created.evaluation_run_id}`);
            await loadRuns(selectedSetId);
        } catch (error) {
            setErrorMessage(`Create run failed: ${String(error)}`);
        } finally {
            setIsCreatingRun(false);
        }
    };

    useEffect(() => {
        let isMounted = true;

        const initialize = async () => {
            try {
                const data = await listEvaluationSets();
                if (!isMounted) return;
                setSets(data);
            } catch (error) {
                if (!isMounted) return;
                setErrorMessage(`Nie udało się pobrać EvaluationSetów: ${String(error)}`);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        void initialize();
        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        if (!flashMessage) return;
        const t = setTimeout(() => setFlashMessage(null), 4500);
        return () => clearTimeout(t);
    }, [flashMessage]);

    useEffect(() => {
        const onPop = () => setPathname(window.location.pathname);
        window.addEventListener("popstate", onPop);
        return () => window.removeEventListener("popstate", onPop);
    }, []);

    useEffect(() => {
        if (!selectedSetId) {
            setSelectedSet(null);
            setRuns([]);
            return;
        }

        void loadSetDetail(selectedSetId);
        void loadRuns(selectedSetId);
    }, [selectedSetId]);

        useEffect(() => {
        let isMounted = true;

        const loadRunMeta = async () => {
            try {
                const [models, modes] = await Promise.all([
                    getSupportedModels(),
                    getSupportedModes(),
                ]);

                if (!isMounted) return;

                setRunModels(models);
                setRunModes(modes);

                const firstProvider = Object.keys(models)[0];
                const firstModel = firstProvider ? models[firstProvider]?.[0] : "";
                if (firstProvider && firstModel) {
                    setSelectedRunModel(`${firstProvider}:${firstModel}`);
                }

                const firstMode = Object.keys(modes)[0];
                if (firstMode) {
                    setRunSummaryMode(firstMode);
                }
            } catch (error) {
                if (!isMounted) return;
                setErrorMessage(`Nie udało się pobrać konfiguracji runa: ${String(error)}`);
            } finally {
                if (isMounted) setIsLoadingRunMeta(false);
            }
        };

        void loadRunMeta();

        return () => {
            isMounted = false;
        };
    }, []);


    const importPanel = (
        <section className="panel-shell min-w-0">
            <p className="section-kicker">Research</p>
            <h1 className="m-0 font-display text-[1.1rem] uppercase tracking-[0.04em]">
                Evaluation set import
            </h1>
            <p className="helper-copy mt-2">
                Importuj małe curated datasety JSON. To jest osobny moduł badawczy, niezależny od zwykłych jobs.
            </p>

            <div className="mt-4 flex flex-wrap gap-2.5">
                <label className="inline-flex cursor-pointer items-center justify-center border border-panel-border bg-panel-solid px-3 py-2 text-[0.9rem] text-ink hover:bg-subtle-hover">
                    <input
                        type="file"
                        accept=".json,application/json"
                        className="hidden"
                        onChange={handleFileChange}
                    />
                    Wczytaj plik JSON
                </label>
                <button
                    type="button"
                    onClick={() => setRawJson(PRETTY_EXAMPLE)}
                    className="border border-panel-border bg-panel-solid px-3 py-2 text-[0.9rem] text-ink hover:bg-subtle-hover"
                >
                    Wstaw przykład
                </button>
            </div>

            <div className="mt-4 grid gap-3">
                <label className="grid gap-1.5">
                    <span className="text-[0.9rem] text-label">Import JSON</span>
                    <textarea
                        value={rawJson}
                        onChange={(event) => setRawJson(event.target.value)}
                        spellCheck={false}
                        className="min-h-[320px] w-full border border-input-border bg-panel-solid px-3 py-2 font-mono text-[0.9rem] text-ink outline-none focus:border-input-focus"
                    />
                </label>

                <div className="grid gap-1 border border-panel-border bg-panel-solid px-3 py-2.5 text-[0.9rem]">
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                        <span>Status: {parsedPreview.isValid ? "valid JSON" : "invalid JSON"}</span>
                        <span>Name: {parsedPreview.name ?? "—"}</span>
                        <span>Language: {parsedPreview.language ?? "—"}</span>
                        <span>Entries: {parsedPreview.entryCount}</span>
                    </div>
                </div>

                <div className="flex items-center gap-2.5">
                    <button
                        type="button"
                        onClick={() => void handleImport()}
                        disabled={isImporting}
                        className="border border-panel-border bg-accent-500 px-3.5 py-2 text-[0.94rem] text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isImporting ? "Importing..." : "Import evaluation set"}
                    </button>
                </div>

                {flashMessage ? (
                    <div className="border border-success-border bg-success-bg px-3.5 py-2.5 text-[0.94rem] text-success-text">
                        {flashMessage}
                    </div>
                ) : null}

                {errorMessage ? (
                    <div className="border border-danger bg-panel-solid px-3.5 py-2.5 text-[0.94rem] text-danger">
                        {errorMessage}
                    </div>
                ) : null}
            </div>
        </section>
    );

    const listPanel = (
        <section className="panel-shell min-w-0">
            <div className="flex items-end justify-between gap-3">
                <div>
                    <p className="section-kicker">Evaluation sets</p>
                    <h2 className="m-0 font-display text-[1.05rem] uppercase tracking-[0.04em]">
                        Existing sets
                    </h2>
                </div>
                <button
                    type="button"
                    onClick={() => void loadSets()}
                    className="border border-panel-border bg-panel-solid px-3 py-2 text-[0.85rem] text-ink hover:bg-subtle-hover"
                >
                    Refresh
                </button>
            </div>

            {isLoading ? (
                <p className="helper-copy mt-4">Ładowanie listy EvaluationSet...</p>
            ) : sets.length === 0 ? (
                <p className="helper-copy mt-4">Brak EvaluationSetów. Zaimportuj pierwszy dataset.</p>
            ) : (
                <div className="mt-4 overflow-x-auto">
                    <table className="w-full border-collapse text-left text-[0.94rem]">
                        <thead>
                            <tr className="border-b border-divider">
                                <th className="px-2.5 py-2 font-medium">Name</th>
                                <th className="px-2.5 py-2 font-medium">Language</th>
                                <th className="px-2.5 py-2 font-medium">Entries</th>
                                <th className="px-2.5 py-2 font-medium">Created</th>
                                <th className="px-2.5 py-2 font-medium text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sets.map((set) => (
                                <tr key={set.evaluation_set_id} className="border-b border-divider">
                                    <td className="px-2.5 py-2.5">{set.name}</td>
                                    <td className="px-2.5 py-2.5">{set.language}</td>
                                    <td className="px-2.5 py-2.5">{set.entry_count}</td>
                                    <td className="px-2.5 py-2.5">
                                        {new Date(set.created_at).toLocaleString()}
                                    </td>
                                    <td className="px-2.5 py-2.5 text-right">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                // window.history.pushState({}, "", `/research/${set.evaluation_set_id}`);
                                                navigateTo(`/research/${set.evaluation_set_id}`)
                                                // window.dispatchEvent(new PopStateEvent("popstate"));
                                            }}
                                            className="border border-panel-border bg-panel-solid px-3 py-1.5 text-[0.85rem] text-ink hover:bg-subtle-hover"
                                        >
                                            Open
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );

    const evaluationRunForm = (
        <>
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
                                value={selectedRunModel}
                                onChange={(event) => setSelectedRunModel(event.target.value)}
                                disabled={isCreatingRun || isLoadingRunMeta}
                                className="h-11 border border-input-border bg-panel-solid px-3 text-ink outline-none focus:border-input-focus disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {Object.entries(runModels).map(([provider, modelList]) =>
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
                                value={runSummaryMode}
                                onChange={(event) => setRunSummaryMode(event.target.value)}
                                disabled={isCreatingRun || isLoadingRunMeta}
                                className="h-11 border border-input-border bg-panel-solid px-3 text-ink outline-none focus:border-input-focus disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {Object.entries(runModes).map(([modeKey, modeLabel]) => (
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
                                value={runDelayMs}
                                onChange={(event) => setRunDelayMs(Number(event.target.value))}
                                className="h-11 border border-input-border bg-panel-solid px-3 text-ink outline-none focus:border-input-focus"
                            />
                        </label>
                    </div>

                    <div className="flex items-center gap-2.5">
                        <button
                            type="button"
                            onClick={() => void handleCreateRun()}
                            disabled={isCreatingRun || isLoadingRunMeta || !selectedRunModel}
                            className="border border-panel-border bg-accent-500 px-3.5 py-2 text-[0.94rem] text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isCreatingRun ? "Creating..." : "Create evaluation run"}
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

                {isLoadingRuns ? (
                    <p className="helper-copy">Ładowanie runów...</p>
                ) : runs.length === 0 ? (
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
                                {runs.map((run) => (
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
                                            <button
                                                type="button"
                                                onClick={() => navigateTo(`/research/runs/${run.evaluation_run_id}`)}
                                                className="border border-panel-border bg-panel-solid px-3 py-1.5 text-[0.85rem] text-ink hover:bg-subtle-hover"
                                            >
                                                Open
                                            </button>
                                        </td>
                                    </tr>

                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </>
    );

    const detailPanel = (
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
            </div>

            {evaluationRunForm}

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
                                        Source meta
                                    </p>
                                    <pre className="m-0 mt-1 overflow-x-auto whitespace-pre-wrap border border-panel-border bg-page px-3 py-2 font-mono text-[0.82rem] text-muted">
{JSON.stringify(entry.source_meta, null, 2)}
                                    </pre>
                                </div>

                                <div>
                                    <p className="m-0 text-[0.82rem] uppercase tracking-[0.04em] text-label">
                                        Golden metrics
                                    </p>
                                    <pre className="m-0 mt-1 overflow-x-auto whitespace-pre-wrap border border-panel-border bg-page px-3 py-2 font-mono text-[0.82rem] text-muted">
{JSON.stringify(entry.golden_metrics, null, 2)}
                                    </pre>
                                </div>
                            </div>
                        </article>
                    ))}
                </div>
            ) : (
                <p className="helper-copy mt-4">Nie znaleziono EvaluationSet.</p>
            )}
        </section>
    );

    return (
        <main className="mx-auto grid w-full max-w-355 gap-4 px-3.5 py-7">
            {runId ? (
                <RunDetailPage runId={runId} />
            ) : isDetailView ? (
                detailPanel
            ) : (<>
                {importPanel}
                {listPanel}
            </>)}

        </main>
    );
}