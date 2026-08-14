import { useEffect, useMemo, useState } from "react";

import { createEvaluationSet, listEvaluationSets } from "../api/research";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { PageShell } from "../components/ui/PageShell";
import type { EvaluationSetImportPayload, EvaluationSetListItem } from "../types/research";
import { navigateTo } from "../utils/researchRouting";

const PRETTY_EXAMPLE = `{
  "name": "cnn-sample1",
  "language": "en",
  "entries": [
    {
      "input_text": "Example input text",
      "golden_summary": "Example golden summary",
      "title": "Example title",
      "url": "https://example.com/article",
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
            setFlashMessage(
                `Zaimportowano EvaluationSet: ${created.name} (${created.entry_count} entries).`,
            );
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

    return (
        <PageShell>
            <section className="panel-shell min-w-0">
                <p className="section-kicker">Research</p>
                <h1 className="m-0 font-mono text-xl uppercase tracking-wider">
                    Evaluation set import
                </h1>
                <p className="helper-copy mt-2">
                    Importuj małe curated datasety JSON. To jest osobny moduł badawczy, niezależny
                    od zwykłych jobs.
                </p>

                <div className="mt-4 flex flex-wrap gap-2.5">
                    <label className="inline-flex cursor-pointer items-center justify-center border border-panel-border bg-panel-solid px-3 py-2 text-md text-ink hover:bg-subtle-hover">
                        <input
                            type="file"
                            accept=".json,application/json"
                            className="hidden"
                            onChange={handleFileChange}
                        />
                        Wczytaj plik JSON
                    </label>
                    <Button size="sm" onClick={() => setRawJson(PRETTY_EXAMPLE)}>
                        Wstaw przykład
                    </Button>
                </div>

                <div className="mt-4 grid gap-3">
                    <label className="grid gap-1.5">
                        <span className="text-md text-label">Import JSON</span>
                        <textarea
                            value={rawJson}
                            onChange={(event) => setRawJson(event.target.value)}
                            spellCheck={false}
                            className="min-h-[320px] w-full border border-input-border bg-panel-solid px-3 py-2 font-mono text-md text-ink outline-none focus:border-input-focus"
                        />
                    </label>

                    <div className="grid gap-1 border border-panel-border bg-panel-solid px-3 py-2.5 text-md">
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                            <span>
                                Status: {parsedPreview.isValid ? "valid JSON" : "invalid JSON"}
                            </span>
                            <span>Name: {parsedPreview.name ?? "—"}</span>
                            <span>Language: {parsedPreview.language ?? "—"}</span>
                            <span>Entries: {parsedPreview.entryCount}</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                        <Button
                            variant="primary"
                            onClick={() => void handleImport()}
                            disabled={isImporting}
                        >
                            {isImporting ? "Importing..." : "Import evaluation set"}
                        </Button>
                    </div>

                    {flashMessage ? <Alert>{flashMessage}</Alert> : null}

                    {errorMessage ? <Alert tone="danger">{errorMessage}</Alert> : null}
                </div>
            </section>

            <section className="panel-shell min-w-0">
                <div className="flex items-end justify-between gap-3">
                    <div>
                        <p className="section-kicker">Evaluation sets</p>
                        <h2 className="m-0 font-mono text-lg uppercase tracking-wider">
                            Existing sets
                        </h2>
                    </div>
                    <Button size="sm" onClick={() => void loadSets()}>
                        Refresh
                    </Button>
                </div>

                {isLoading ? (
                    <p className="helper-copy mt-4">Ładowanie listy EvaluationSet...</p>
                ) : sets.length === 0 ? (
                    <p className="helper-copy mt-4">
                        Brak EvaluationSetów. Zaimportuj pierwszy dataset.
                    </p>
                ) : (
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full border-collapse text-left text-base">
                            <thead>
                                <tr className="border-b border-panel-border">
                                    <th className="px-2.5 py-2 font-medium">Name</th>
                                    <th className="px-2.5 py-2 font-medium">Language</th>
                                    <th className="px-2.5 py-2 font-medium">Entries</th>
                                    <th className="px-2.5 py-2 font-medium">Created</th>
                                    <th className="px-2.5 py-2 font-medium text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sets.map((set) => (
                                    <tr
                                        key={set.evaluation_set_id}
                                        className="border-b border-panel-border"
                                    >
                                        <td className="px-2.5 py-2.5">{set.name}</td>
                                        <td className="px-2.5 py-2.5">{set.language}</td>
                                        <td className="px-2.5 py-2.5">{set.entry_count}</td>
                                        <td className="px-2.5 py-2.5">
                                            {new Date(set.created_at).toLocaleString()}
                                        </td>
                                        <td className="px-2.5 py-2.5 text-right">
                                            <Button
                                                size="sm"
                                                onClick={() =>
                                                    navigateTo(`/research/${set.evaluation_set_id}`)
                                                }
                                            >
                                                Open
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </PageShell>
    );
}
