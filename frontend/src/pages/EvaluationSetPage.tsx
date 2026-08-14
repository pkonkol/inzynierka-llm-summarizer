import { useEffect, useState } from "react";
import { getSupportedModels, getSupportedModes } from "../api/client";
import {
    createEvaluationRun,
    deleteEvaluationRun,
    deleteEvaluationSet,
    evaluateMissingGoldenMetrics,
    exportEvaluationSet,
    getEvaluationSet,
    listEvaluationRuns,
} from "../api/research";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DeepevalItems } from "../components/DeepevalItems";
import { InfoRow } from "../components/InfoRow";
import { InputTextSection } from "../components/InputTextSection";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { FieldLabel, Input, Select } from "../components/ui/Field";
import { PageShell, SectionHeading } from "../components/ui/PageShell";
import { Panel } from "../components/ui/Panel";
import type {
    EvaluationRunListItem,
    EvaluationSetDetail,
    EvaluationSetEntry,
} from "../types/research";
import { navigateTo } from "../utils/researchRouting";
import { splitProviderModel } from "../utils/utils";

function formatLabel(key: string): string {
    return key.replace(/_/g, " ");
}

function MetricsSection({ title, data }: { title: string; data: Record<string, number | null> }) {
    return (
        <div className="space-y-2">
            <SectionHeading>{title}</SectionHeading>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                {Object.entries(data).map(([key, value]) => (
                    <InfoRow key={key} label={formatLabel(key)} value={value} />
                ))}
            </div>
        </div>
    );
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

type EntryCollapsibleKey = "input" | "metrics";

function EntryCard({
    index,
    entry,
    setId,
}: {
    index: number;
    entry: EvaluationSetEntry;
    setId: string;
}) {
    const [openSection, setOpenSection] = useState<EntryCollapsibleKey | null>(null);

    const toggleSection = (key: EntryCollapsibleKey) => {
        setOpenSection((current) => (current === key ? null : key));
    };

    return (
        <Panel as="article" padding="sm">
            <p className="m-0 text-sm text-ink">
                <span className="font-medium">{index + 1}</span>
                {" · "}
                <span className="lowercase text-muted">
                    {entry.title} · {entry.url}
                </span>
            </p>

            <p className="m-0 mt-2 whitespace-pre-wrap text-base text-ink">
                {entry.golden_summary}
            </p>

            <div className="mt-3 grid grid-cols-2 gap-3">
                <Button variant="disclosure" size="xs" onClick={() => toggleSection("input")}>
                    <span>Input text</span>
                    <span>{openSection === "input" ? "▼" : "▶"}</span>
                </Button>

                <Button variant="disclosure" size="xs" onClick={() => toggleSection("metrics")}>
                    <span>Metrics</span>
                    <span>{openSection === "metrics" ? "▼" : "▶"}</span>
                </Button>
            </div>

            {openSection === "input" ? (
                <div className="border border-t-0 border-panel-border">
                    <InputTextSection setId={setId} entryId={entry.entry_id} />
                </div>
            ) : null}

            {openSection === "metrics" && entry.golden_metrics ? (
                <div className="border border-t-0 border-panel-border space-y-3 p-3">
                    <MetricsSection title="Source" data={entry.golden_metrics.source} />
                    <MetricsSection title="Summary" data={entry.golden_metrics.summary} />
                    {entry.golden_metrics.deepeval.length > 0 ? (
                        <div className="space-y-2 border-t border-panel-border pt-3">
                            <SectionHeading>Deepeval</SectionHeading>
                            <DeepevalItems items={entry.golden_metrics.deepeval} />
                        </div>
                    ) : null}
                </div>
            ) : openSection === "metrics" ? (
                <p className="m-0 border border-t-0 border-panel-border p-3 text-xs italic text-muted">
                    Metrics not computed yet.
                </p>
            ) : null}
        </Panel>
    );
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

    const [newRunAvailableModels, setNewRunAvailableModels] = useState<Record<string, string[]>>(
        {},
    );
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
        <PageShell>
            <section className="panel-shell min-w-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <p className="section-kicker">Evaluation set</p>
                        <h1 className="m-0 font-mono text-xl uppercase tracking-wider">
                            {selectedSet?.name ?? "Loading..."}
                        </h1>
                        <p className="helper-copy mt-2">
                            {selectedSet
                                ? `${selectedSet.language} · ${selectedSet.entries.length} entries`
                                : "Ładowanie szczegółów seta..."}
                        </p>
                    </div>

                    <Button
                        variant="primary"
                        size="sm"
                        onClick={() => void handleEvaluateMetrics()}
                        disabled={!selectedSet || isEvaluatingMetrics}
                    >
                        {isEvaluatingMetrics ? "Evaluating..." : "Evaluate metrics"}
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => void handleExportSet()}
                        disabled={!selectedSet || isExporting}
                    >
                        {isExporting ? "Exporting..." : "Export JSON"}
                    </Button>
                    <Button size="sm" onClick={() => navigateTo("/research")}>
                        Back to sets
                    </Button>
                    <Button
                        variant="dangerOutline"
                        size="sm"
                        onClick={() => setIsSetDeletePending(true)}
                        disabled={!selectedSet}
                    >
                        Delete set
                    </Button>
                </div>

                {flashMessage ? <Alert className="mt-4">{flashMessage}</Alert> : null}

                {errorMessage ? (
                    <Alert tone="danger" className="mt-4">
                        {errorMessage}
                    </Alert>
                ) : null}

                {selectedSet ? (
                    <Panel as="section" padding="sm" className="mt-4 grid gap-3">
                        <div>
                            <p className="m-0 text-sm uppercase tracking-wider text-label">
                                New evaluation run
                            </p>
                            <p className="helper-copy mt-1">
                                Naiwny runner generuje tylko AI summary i podstawowe metryki
                                tekstowe. Bez GEval.
                            </p>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                            <div className="grid gap-1.5 md:col-span-2">
                                <FieldLabel htmlFor="new-run-model">Model</FieldLabel>
                                <Select
                                    id="new-run-model"
                                    value={newRunSelectedModel}
                                    onChange={(event) => setNewRunSelectedModel(event.target.value)}
                                    disabled={isSubmittingNewRun || isLoadingNewRunOptions}
                                >
                                    {Object.entries(newRunAvailableModels).map(
                                        ([provider, modelList]) =>
                                            modelList.map((model) => (
                                                <option
                                                    key={`${provider}:${model}`}
                                                    value={`${provider}:${model}`}
                                                >
                                                    {provider} – {model}
                                                </option>
                                            )),
                                    )}
                                </Select>
                            </div>

                            <div className="grid gap-1.5">
                                <FieldLabel htmlFor="new-run-mode">Summary mode</FieldLabel>
                                <Select
                                    id="new-run-mode"
                                    value={newRunSummaryMode}
                                    onChange={(event) => setNewRunSummaryMode(event.target.value)}
                                    disabled={isSubmittingNewRun || isLoadingNewRunOptions}
                                >
                                    {Object.entries(newRunAvailableModes).map(
                                        ([modeKey, modeLabel]) => (
                                            <option key={modeKey} value={modeKey}>
                                                {modeLabel}
                                            </option>
                                        ),
                                    )}
                                </Select>
                            </div>

                            <div className="grid gap-1.5">
                                <FieldLabel htmlFor="new-run-delay">
                                    Delay between entries (ms)
                                </FieldLabel>
                                <Input
                                    id="new-run-delay"
                                    type="number"
                                    min={0}
                                    step={100}
                                    value={newRunDelayMs}
                                    onChange={(event) =>
                                        setNewRunDelayMs(Number(event.target.value))
                                    }
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-2.5">
                            <Button
                                variant="primary"
                                onClick={() => void handleSubmitNewRun()}
                                disabled={
                                    isSubmittingNewRun ||
                                    isLoadingNewRunOptions ||
                                    !newRunSelectedModel
                                }
                            >
                                {isSubmittingNewRun ? "Creating..." : "Create evaluation run"}
                            </Button>
                        </div>
                    </Panel>
                ) : null}

                <Panel as="section" padding="sm" className="mt-4 grid gap-3">
                    <div>
                        <p className="m-0 text-sm uppercase tracking-wider text-label">
                            Evaluation runs
                        </p>
                    </div>

                    {isLoadingExistingRuns ? (
                        <p className="helper-copy">Ładowanie runów...</p>
                    ) : existingRuns.length === 0 ? (
                        <p className="helper-copy">Brak EvaluationRunów dla tego seta.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-left text-base">
                                <thead>
                                    <tr className="border-b border-panel-border">
                                        <th className="px-2.5 py-2 font-medium">Provider</th>
                                        <th className="px-2.5 py-2 font-medium">Model</th>
                                        <th className="px-2.5 py-2 font-medium">Mode</th>
                                        <th className="px-2.5 py-2 font-medium">Status</th>
                                        <th className="px-2.5 py-2 font-medium">Entries</th>
                                        <th className="px-2.5 py-2 font-medium">Created</th>
                                        <th className="px-2.5 py-2 font-medium text-right">
                                            Action
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {existingRuns.map((run) => (
                                        <tr
                                            key={run.evaluation_run_id}
                                            className="border-b border-panel-border"
                                        >
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
                                                    <Button
                                                        size="sm"
                                                        onClick={() =>
                                                            navigateTo(
                                                                `/research/runs/${run.evaluation_run_id}`,
                                                            )
                                                        }
                                                    >
                                                        Open
                                                    </Button>
                                                    <Button
                                                        variant="dangerOutline"
                                                        size="sm"
                                                        onClick={() => setRunPendingDelete(run)}
                                                    >
                                                        Delete
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Panel>

                {isLoadingDetail ? (
                    <p className="helper-copy mt-4">Ładowanie szczegółów EvaluationSet...</p>
                ) : selectedSet ? (
                    <div className="mt-4 grid gap-3">
                        {selectedSet.entries.map((entry, index) => (
                            <EntryCard
                                key={entry.entry_id}
                                index={index}
                                entry={entry}
                                setId={setId}
                            />
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
                message={
                    runPendingDelete
                        ? `Usunąć run ${runPendingDelete.model_provider}:${runPendingDelete.model_name} (${runPendingDelete.evaluation_run_id})?`
                        : ""
                }
                isConfirming={isDeletingRun}
                onConfirm={() => void handleConfirmDeleteRun()}
                onClose={() => setRunPendingDelete(null)}
            />
        </PageShell>
    );
}
