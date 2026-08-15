import { useEffect, useState } from "react";
import { errorText, getSupportedModels, getSupportedModes } from "../api/client";
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
import { useFlash } from "../components/FlashProvider";
import { InfoRow } from "../components/InfoRow";
import { InputTextSection } from "../components/InputTextSection";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { DisclosureButton } from "../components/ui/DisclosureButton";
import { FieldLabel, Input, Select } from "../components/ui/Field";
import { LinkButton } from "../components/ui/LinkButton";
import { PageShell, SectionHeading } from "../components/ui/PageShell";
import { Panel } from "../components/ui/Panel";
import { Table, Td, Tr } from "../components/ui/Table";
import type {
  EvaluationRunListItem,
  EvaluationSetDetail,
  EvaluationSetEntry,
} from "../types/research";
import { navigateTo } from "../utils/researchRouting";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { splitProviderModel } from "../utils/utils";

function formatLabel(key: string): string {
  return key.replace(/_/g, " ");
}

function MetricsSection({ title, data }: { title: string; data: Record<string, number | null> }) {
  return (
    <div className="grid gap-2">
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
    <Panel as="article" padding="sm" className="grid gap-3">
      <p className="text-sm text-ink">
        <span className="font-medium">{index + 1}</span>
        {" · "}
        <span className="lowercase text-muted">
          {entry.title} · {entry.url}
        </span>
      </p>

      <p className="whitespace-pre-wrap text-base text-ink">{entry.golden_summary}</p>

      <div className="grid grid-cols-2 gap-3">
        <DisclosureButton
          label="Input text"
          isOpen={openSection === "input"}
          onToggle={() => toggleSection("input")}
        />

        <DisclosureButton
          label="Metrics"
          isOpen={openSection === "metrics"}
          onToggle={() => toggleSection("metrics")}
        />
      </div>

      {openSection === "input" ? (
        <div className="border border-t-0 border-panel-border">
          <InputTextSection setId={setId} entryId={entry.entry_id} />
        </div>
      ) : null}

      {openSection === "metrics" && entry.golden_metrics ? (
        <div className="grid gap-3 border border-t-0 border-panel-border p-3">
          <MetricsSection title="Source" data={entry.golden_metrics.source} />
          <MetricsSection title="Summary" data={entry.golden_metrics.summary} />
          {entry.golden_metrics.deepeval.length > 0 ? (
            <div className="grid gap-2 border-t border-panel-border pt-3">
              <SectionHeading>Deepeval</SectionHeading>
              <DeepevalItems items={entry.golden_metrics.deepeval} />
            </div>
          ) : null}
        </div>
      ) : openSection === "metrics" ? (
        <p className="border border-t-0 border-panel-border p-3 text-xs italic text-muted">
          Metrics not computed yet.
        </p>
      ) : null}
    </Panel>
  );
}

const RUN_COLUMNS = ["Provider", "Model", "Mode", "Status", "Entries", "Created", "Action"];

function RunsTable({
  runs,
  onDelete,
}: {
  runs: EvaluationRunListItem[];
  onDelete: (run: EvaluationRunListItem) => void;
}) {
  return (
    <Table headers={RUN_COLUMNS}>
      {runs.map((run) => (
        <Tr key={run.evaluation_run_id}>
          <Td>{run.model_provider}</Td>
          <Td>{run.model_name}</Td>
          <Td>{run.summary_mode}</Td>
          <Td>{run.status}</Td>
          <Td>{run.entry_count}</Td>
          <Td>{new Date(run.created_at).toLocaleString()}</Td>
          <Td className="text-right">
            <div className="flex justify-end gap-2">
              <LinkButton size="sm" href={`/research/runs/${run.evaluation_run_id}`}>
                Open
              </LinkButton>
              <Button variant="dangerOutline" size="sm" onClick={() => onDelete(run)}>
                Delete
              </Button>
            </div>
          </Td>
        </Tr>
      ))}
    </Table>
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
  const showFlash = useFlash();
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

  useDocumentTitle(selectedSet?.name ?? null);

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
    setIsExporting(true);

    try {
      const data = await exportEvaluationSet(setId);
      downloadJson(`${selectedSet.name}.json`, data);
      showFlash(`Wyeksportowano EvaluationSet: ${selectedSet.name}.`);
    } catch (error) {
      showFlash(`Nie udało się wyeksportować EvaluationSetu: ${errorText(error)}`, "danger");
    } finally {
      setIsExporting(false);
    }
  };

  const handleEvaluateMetrics = async () => {
    setErrorMessage(null);
    setIsEvaluatingMetrics(true);

    try {
      const result = await evaluateMissingGoldenMetrics(setId);
      showFlash(
        `Golden metrics updated for ${result.updated_entries} of ${result.total_entries} entries.`,
      );
      await loadSetDetail();
    } catch (error) {
      showFlash(`Nie udało się policzyć golden metrics: ${errorText(error)}`, "danger");
    } finally {
      setIsEvaluatingMetrics(false);
    }
  };

  const handleSubmitNewRun = async () => {
    if (!selectedSet) return;

    setErrorMessage(null);
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

      showFlash(`EvaluationRun created: ${created.evaluation_run_id}`);
      await loadExistingRuns();
    } catch (error) {
      showFlash(`Nie udało się utworzyć runa: ${errorText(error)}`, "danger");
    } finally {
      setIsSubmittingNewRun(false);
    }
  };

  const handleConfirmDeleteSet = async () => {
    setIsDeletingSet(true);
    try {
      await deleteEvaluationSet(setId);
      showFlash(`Usunięto EvaluationSet: ${selectedSet?.name ?? setId}.`);
      navigateTo("/research");
    } catch (error) {
      showFlash(`Nie udało się usunąć EvaluationSetu: ${errorText(error)}`, "danger");
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
      showFlash(`Nie udało się usunąć runa: ${errorText(error)}`, "danger");
    } finally {
      setIsDeletingRun(false);
    }
  };

  useEffect(() => {
    void loadSetDetail();
    void loadExistingRuns();
  }, [setId]);

  useEffect(() => {
    let isMounted = true;

    const loadNewRunOptions = async () => {
      try {
        const [models, modes] = await Promise.all([getSupportedModels(), getSupportedModes()]);

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
        setErrorMessage(`Nie udało się pobrać konfiguracji runa: ${errorText(error)}`);
      } finally {
        if (isMounted) setIsLoadingNewRunOptions(false);
      }
    };

    void loadNewRunOptions();

    return () => {
      isMounted = false;
    };
  }, []);

  let entriesSection = <p className="helper-copy">Ładowanie szczegółów EvaluationSet...</p>;
  if (!isLoadingDetail && selectedSet) {
    entriesSection = (
      <div className="grid gap-3">
        {selectedSet.entries.map((entry, index) => (
          <EntryCard key={entry.entry_id} index={index} entry={entry} setId={setId} />
        ))}
      </div>
    );
  } else if (!isLoadingDetail) {
    entriesSection = <p className="helper-copy">Nie znaleziono EvaluationSet.</p>;
  }

  let runsSection = <p className="helper-copy">Ładowanie runów...</p>;
  if (!isLoadingExistingRuns && existingRuns.length === 0) {
    runsSection = <p className="helper-copy">Brak EvaluationRunów dla tego seta.</p>;
  } else if (!isLoadingExistingRuns) {
    runsSection = <RunsTable runs={existingRuns} onDelete={setRunPendingDelete} />;
  }

  return (
    <PageShell>
      <section className="panel-shell grid min-w-0 gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-2">
            <p className="section-kicker">Evaluation set</p>
            <h1 className="font-mono text-xl uppercase tracking-wider">
              {selectedSet?.name ?? "Loading..."}
            </h1>
            <p className="helper-copy">
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
          <LinkButton size="sm" href="/research">
            Back to sets
          </LinkButton>
          <Button
            variant="dangerOutline"
            size="sm"
            onClick={() => setIsSetDeletePending(true)}
            disabled={!selectedSet}
          >
            Delete set
          </Button>
        </div>

        {errorMessage ? <Alert tone="danger">{errorMessage}</Alert> : null}

        {selectedSet ? (
          <Panel as="section" padding="sm" className="grid gap-3">
            <div className="grid gap-1">
              <p className="text-sm uppercase tracking-wider text-label">New evaluation run</p>
              <p className="helper-copy">
                Naiwny runner generuje tylko AI summary i podstawowe metryki tekstowe. Bez GEval.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-2 md:col-span-2">
                <FieldLabel htmlFor="new-run-model">Model</FieldLabel>
                <Select
                  id="new-run-model"
                  value={newRunSelectedModel}
                  onChange={(event) => setNewRunSelectedModel(event.target.value)}
                  disabled={isSubmittingNewRun || isLoadingNewRunOptions}
                >
                  {Object.entries(newRunAvailableModels).map(([provider, modelList]) =>
                    modelList.map((model) => (
                      <option key={`${provider}:${model}`} value={`${provider}:${model}`}>
                        {provider} – {model}
                      </option>
                    )),
                  )}
                </Select>
              </div>

              <div className="grid gap-2">
                <FieldLabel htmlFor="new-run-mode">Summary mode</FieldLabel>
                <Select
                  id="new-run-mode"
                  value={newRunSummaryMode}
                  onChange={(event) => setNewRunSummaryMode(event.target.value)}
                  disabled={isSubmittingNewRun || isLoadingNewRunOptions}
                >
                  {Object.entries(newRunAvailableModes).map(([modeKey, modeLabel]) => (
                    <option key={modeKey} value={modeKey}>
                      {modeLabel}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid gap-2">
                <FieldLabel htmlFor="new-run-delay">Delay between entries (ms)</FieldLabel>
                <Input
                  id="new-run-delay"
                  type="number"
                  min={0}
                  step={100}
                  value={newRunDelayMs}
                  onChange={(event) => setNewRunDelayMs(Number(event.target.value))}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                onClick={() => void handleSubmitNewRun()}
                disabled={isSubmittingNewRun || isLoadingNewRunOptions || !newRunSelectedModel}
              >
                {isSubmittingNewRun ? "Creating..." : "Create evaluation run"}
              </Button>
            </div>
          </Panel>
        ) : null}

        <Panel as="section" padding="sm" className="grid gap-3">
          <div>
            <p className="text-sm uppercase tracking-wider text-label">Evaluation runs</p>
          </div>

          {runsSection}
        </Panel>

        {entriesSection}
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
