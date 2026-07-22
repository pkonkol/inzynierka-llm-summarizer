import { useEffect, useMemo, useState } from "react";

import { createEvaluationSet, getEvaluationSet, listEvaluationSets, exportEvaluationSet } from "../api/research";
import type {
        EvaluationSetDetail,
    EvaluationSetImportPayload,
    EvaluationSetListItem,
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
            return;
        }

        void loadSetDetail(selectedSetId);
    }, [selectedSetId]);

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
            {isDetailView ? (
                detailPanel
            ) : (<>
                {importPanel}
                {listPanel}
            </>)}

        </main>
    );
}