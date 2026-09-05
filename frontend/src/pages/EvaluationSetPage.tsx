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
import { cn } from "../components/ui/cn";
import { DisclosureSections } from "../components/ui/DisclosureSections";
import { FieldLabel, Input, Select } from "../components/ui/Field";
import { LinkButton } from "../components/ui/LinkButton";
import { PageShell, SectionHeading } from "../components/ui/PageShell";
import { Panel } from "../components/ui/Panel";
import { Table, Td, Tr } from "../components/ui/Table";
import type {
  EvaluationRunListItemResponse,
  EvaluationSetDetailResponse,
  EvaluationSetEntryResponse,
} from "../types/api.generated";
import { downloadJson } from "../utils/download";
import { formatDateMinute, formatMetricLabel } from "../utils/format";
import { navigateTo } from "../utils/researchRouting";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { splitProviderModel } from "../utils/utils";

function MetricsSection({ title, data }: { title: string; data: Record<string, number | null> }) {
  return (
    <div className="grid gap-2">
      <SectionHeading>{title}</SectionHeading>
      <div className="metric-row">
        {Object.entries(data).map(([key, value]) => (
          <InfoRow key={key} label={formatMetricLabel(key)} value={value} />
        ))}
      </div>
    </div>
  );
}

// One row: model, mode, delay, the skip toggle and the submit button.
const NEW_RUN_COLUMNS = "sm:grid-cols-[minmax(8rem,1fr)_minmax(12rem,1.5fr)_7rem_auto_auto]";

function EntryCard({
  index,
  entry,
  setId,
}: {
  index: number;
  entry: EvaluationSetEntryResponse;
  setId: string;
}) {
  return (
    <div className="grid gap-3 border-t border-panel-border p-4">
      <h4>
        {index + 1}
        {" · "}
        <span className="mono-value font-normal lowercase text-muted">
          {entry.title} · {entry.url}
        </span>
      </h4>

      <p className="whitespace-pre-wrap text-ink">{entry.golden_summary}</p>

      <DisclosureSections
        sections={[
          {
            key: "input",
            label: "Tekst źródłowy",
            content: <InputTextSection setId={setId} entryId={entry.entry_id} />,
          },
          {
            key: "metrics",
            label: "Metryki",
            content: entry.golden_metrics ? (
              <div className="grid gap-3 bg-subtle p-3">
                <MetricsSection title="Źródło" data={entry.golden_metrics.source} />
                <MetricsSection title="Podsumowanie" data={entry.golden_metrics.summary} />
                {entry.golden_metrics.deepeval.length > 0 ? (
                  <div className="grid gap-2 border-t border-panel-border pt-4">
                    <SectionHeading>Deepeval</SectionHeading>
                    <DeepevalItems items={entry.golden_metrics.deepeval} />
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="p-3 text-muted">Metryki jeszcze nie policzone.</p>
            ),
          },
        ]}
      />
    </div>
  );
}

const RUN_COLUMNS = ["Dostawca", "Model", "Tryb", "Status", "Wpisów", "Utworzono", "Akcja"];

function RunsTable({
  runs,
  onDelete,
}: {
  runs: EvaluationRunListItemResponse[];
  onDelete: (run: EvaluationRunListItemResponse) => void;
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
          <Td>{formatDateMinute(run.created_at)}</Td>
          <Td className="text-right">
            <div className="flex justify-end gap-2">
              <LinkButton size="sm" href={`/research/runs/${run.evaluation_run_id}`}>
                Otwórz
              </LinkButton>
              <Button variant="dangerOutline" size="sm" onClick={() => onDelete(run)}>
                Usuń
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
  const [selectedSet, setSelectedSet] = useState<EvaluationSetDetailResponse | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(true);
  const [detailLoadError, setDetailLoadError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isEvaluatingMetrics, setIsEvaluatingMetrics] = useState(false);
  const showFlash = useFlash();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [existingRuns, setExistingRuns] = useState<EvaluationRunListItemResponse[]>([]);
  const [isLoadingExistingRuns, setIsLoadingExistingRuns] = useState(true);
  const [runsLoadError, setRunsLoadError] = useState<string | null>(null);
  const [isSubmittingNewRun, setIsSubmittingNewRun] = useState(false);

  const [newRunAvailableModels, setNewRunAvailableModels] = useState<Record<string, string[]>>({});
  const [newRunAvailableModes, setNewRunAvailableModes] = useState<Record<string, string>>({});
  const [newRunSelectedModel, setNewRunSelectedModel] = useState("");
  const [newRunSummaryMode, setNewRunSummaryMode] = useState("simple");
  const [newRunSkipTakeaways, setNewRunSkipTakeaways] = useState(false);
  const [newRunDelayMs, setNewRunDelayMs] = useState(1500);
  const [isLoadingNewRunOptions, setIsLoadingNewRunOptions] = useState(true);

  const [isSetDeletePending, setIsSetDeletePending] = useState(false);
  const [isDeletingSet, setIsDeletingSet] = useState(false);
  const [runPendingDelete, setRunPendingDelete] = useState<EvaluationRunListItemResponse | null>(
    null,
  );
  const [isDeletingRun, setIsDeletingRun] = useState(false);

  useDocumentTitle(selectedSet?.name ?? null);

  const loadSetDetail = async () => {
    setIsLoadingDetail(true);
    try {
      const data = await getEvaluationSet(setId);
      setSelectedSet(data);
      setDetailLoadError(null);
    } catch (error) {
      setDetailLoadError(errorText(error));
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const loadExistingRuns = async () => {
    setIsLoadingExistingRuns(true);
    try {
      const data = await listEvaluationRuns(setId);
      setExistingRuns(data);
      setRunsLoadError(null);
    } catch (error) {
      setRunsLoadError(errorText(error));
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
      showFlash(`Nie udało się policzyć metryk wzorca: ${errorText(error)}`, "danger");
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
        skip_takeaways: newRunSkipTakeaways,
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

  let entriesSection: React.ReactNode = (
    <p className="text-muted">Ładowanie szczegółów zbioru...</p>
  );
  if (!isLoadingDetail && selectedSet) {
    entriesSection = (
      <div className="grid">
        {selectedSet.entries.map((entry, index) => (
          <EntryCard key={entry.entry_id} index={index} entry={entry} setId={setId} />
        ))}
      </div>
    );
  } else if (!isLoadingDetail) {
    entriesSection = null;
  }

  let runsSection: React.ReactNode = <p className="text-muted">Ładowanie przebiegów...</p>;
  if (!isLoadingExistingRuns && runsLoadError) {
    runsSection = null;
  } else if (!isLoadingExistingRuns && existingRuns.length === 0) {
    runsSection = <p className="text-muted">Brak przebiegów dla tego zbioru.</p>;
  } else if (!isLoadingExistingRuns) {
    runsSection = <RunsTable runs={existingRuns} onDelete={setRunPendingDelete} />;
  }

  return (
    <PageShell>
      <section className="panel-shell grid min-w-0 gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-muted">Zbiór</span>
            {selectedSet ? (
              <>
                <span className="mono-value">{selectedSet.name}</span>
                <span className="text-muted">·</span>
                <span className="mono-value">{selectedSet.entries.length} wpisów</span>
              </>
            ) : (
              <span className="text-muted">
                {isLoadingDetail ? "ładowanie..." : "zbiór niedostępny"}
              </span>
            )}
          </h1>

          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleEvaluateMetrics()}
              disabled={!selectedSet || isEvaluatingMetrics}
            >
              {isEvaluatingMetrics ? "Liczenie..." : "Policz metryki"}
            </Button>
            <Button
              size="sm"
              onClick={() => void handleExportSet()}
              disabled={!selectedSet || isExporting}
            >
              {isExporting ? "Eksportowanie..." : "Eksport JSON"}
            </Button>
            <LinkButton size="sm" href="/research">
              Wróć do listy
            </LinkButton>
            <Button variant="dangerOutline" size="sm" onClick={() => setIsSetDeletePending(true)}>
              Usuń zbiór
            </Button>
          </div>
        </div>

        {detailLoadError ? (
          <Alert tone="danger">Nie udało się wczytać zbioru: {detailLoadError}</Alert>
        ) : null}
        {runsLoadError ? (
          <Alert tone="danger">Nie udało się wczytać przebiegów: {runsLoadError}</Alert>
        ) : null}
        {errorMessage ? <Alert tone="danger">{errorMessage}</Alert> : null}

        {selectedSet ? (
          <Panel as="section" padding="sm" className="grid gap-3">
            <h2>Nowy przebieg</h2>

            <div className={cn("grid gap-3 sm:items-end", NEW_RUN_COLUMNS)}>
              <div className="grid gap-2">
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
                <FieldLabel htmlFor="new-run-mode">Tryb podsumowania</FieldLabel>
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
                <FieldLabel htmlFor="new-run-delay">Odstęp (ms)</FieldLabel>
                <Input
                  id="new-run-delay"
                  type="number"
                  min={0}
                  step={100}
                  value={newRunDelayMs}
                  onChange={(event) => setNewRunDelayMs(Number(event.target.value))}
                />
              </div>

              <label className="flex items-center gap-2 whitespace-nowrap text-muted sm:h-control">
                <input
                  type="checkbox"
                  checked={newRunSkipTakeaways}
                  onChange={(event) => setNewRunSkipTakeaways(event.target.checked)}
                  disabled={isSubmittingNewRun}
                  className="h-4 w-4 border border-input-border"
                />
                Pomiń punkty kluczowe
              </label>

              <Button
                variant="primary"
                size="lg"
                onClick={() => void handleSubmitNewRun()}
                disabled={isSubmittingNewRun || isLoadingNewRunOptions || !newRunSelectedModel}
              >
                {isSubmittingNewRun ? "Tworzenie..." : "Utwórz przebieg"}
              </Button>
            </div>
          </Panel>
        ) : null}

        <Panel as="section" padding="sm" className="grid gap-3">
          <div>
            <h2>Przebiegi</h2>
          </div>

          {runsSection}
        </Panel>

        <h2>Wpisy</h2>
        {entriesSection}
      </section>

      <ConfirmDialog
        isOpen={isSetDeletePending}
        title="Usunąć evaluation set?"
        message={`Usunąć "${selectedSet?.name ?? setId}"?${existingRuns.length > 0 ? ` Usunie to też ${existingRuns.length} evaluation run(y/ów).` : ""}`}
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
