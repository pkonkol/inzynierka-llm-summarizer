import { useEffect, useMemo, useState } from "react";

import { createEvaluationSet, listEvaluationSets } from "../api/research";
import type {
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

export function ResearchPage() {
    const [rawJson, setRawJson] = useState(PRETTY_EXAMPLE);
    const [sets, setSets] = useState<EvaluationSetListItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isImporting, setIsImporting] = useState(false);
    const [flashMessage, setFlashMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

    const loadSets = async () => {
        const data = await listEvaluationSets();
        setSets(data);
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
                                                window.history.pushState({}, "", `/research/${set.evaluation_set_id}`);
                                                window.dispatchEvent(new PopStateEvent("popstate"));
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

    return (
        <main className="mx-auto grid w-full max-w-355 gap-4 px-3.5 py-7">
            {importPanel}
            {listPanel}
        </main>
    );
}