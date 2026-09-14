import { useState } from "react";
import {
  createEvaluationRun,
  deleteEvaluationRun,
  deleteEvaluationSet,
  evaluateMissingGoldenMetrics,
  exportEvaluationSet,
  getEvaluationSet,
  listEvaluationRuns,
} from "../api/research";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DeepevalItems } from "../components/DeepevalItems";
import { InputTextSection } from "../components/InputTextSection";
import { MetricsSection } from "../components/MetricsSection";
import { EVALUATION_TRAIL } from "../components/NavDock";
import { StatusLabel } from "../components/StatusLabel";
import { SummarySpecFields } from "../components/SummarySpecFields";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { cn } from "../components/ui/cn";
import { DisclosureSections } from "../components/ui/DisclosureSections";
import { FieldLabel, Input, ModelOptions, Select } from "../components/ui/Field";
import { LinkButton } from "../components/ui/LinkButton";
import { PageShell, SectionHeading } from "../components/ui/PageShell";
import { Panel } from "../components/ui/Panel";
import { Table, Td, Tr } from "../components/ui/Table";
import type {
  EvaluationRunCreateRequest,
  EvaluationRunListItemResponse,
  EvaluationSetEntryResponse,
} from "../types/api.generated";
import { downloadJson } from "../utils/download";
import { formatDateMinute } from "../utils/format";
import { navigateTo } from "../utils/routing";
import { useAsyncAction } from "../utils/useAsyncAction";
import { useConfirmDelete } from "../utils/useConfirmDelete";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { useListPolling } from "../utils/useListPolling";
import { useReloadableResource } from "../utils/useReloadableResource";
import { useSummarizationOptions } from "../utils/useSummarizationOptions";
import { useSummarySpecForm } from "../utils/useSummarySpecForm";
import { splitProviderModel } from "../utils/utils";

// One row: model, delay and the submit button; the summary spec fields sit below it.
const NEW_RUN_COLUMNS = "sm:grid-cols-[minmax(12rem,1fr)_7rem_auto]";

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
          <Td>{run.processing_strategy}</Td>
          <Td>
            <StatusLabel status={run.status} />
          </Td>
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
  const setDetail = useReloadableResource(
    () => getEvaluationSet(setId),
    setId,
    "Nie udało się wczytać zbioru",
  );
  const runs = useReloadableResource(
    () => listEvaluationRuns(setId),
    setId,
    "Nie udało się wczytać przebiegów",
  );
  const selectedSet = setDetail.data;
  // null means "no answer yet" — a real third state, not a missing value.
  const existingRuns = runs.data ?? [];

  const [newRunDelayMs, setNewRunDelayMs] = useState(1500);
  const {
    models: newRunAvailableModels,
    processingStrategies: newRunAvailableStrategies,
    presets: newRunPresets,
    selectedModel: newRunSelectedModel,
    setSelectedModel: setNewRunSelectedModel,
    selectedProcessingStrategy: newRunProcessingStrategy,
    setSelectedProcessingStrategy: setNewRunProcessingStrategy,
    isLoading: isLoadingNewRunOptions,
    errorMessage,
  } = useSummarizationOptions();
  const newRunSpecForm = useSummarySpecForm(newRunPresets, { offerMatchReference: true });

  useDocumentTitle(selectedSet?.name ?? null);

  const exportSet = useAsyncAction(
    async (setName: string) => {
      const data = await exportEvaluationSet(setId);
      downloadJson(`${setName}.json`, data);
      return setName;
    },
    {
      errorPrefix: "Nie udało się wyeksportować EvaluationSetu",
      successMessage: (setName) => `Wyeksportowano EvaluationSet: ${setName}.`,
    },
  );

  const evaluateMetrics = useAsyncAction(() => evaluateMissingGoldenMetrics(setId), {
    errorPrefix: "Nie udało się policzyć metryk wzorca",
    successMessage: (result) =>
      `Policzono metryki wzorcowe dla ${result.updated_entries} z ${result.total_entries} wpisów.`,
    onSuccess: () => setDetail.reload(),
  });

  const submitNewRun = useAsyncAction(
    () => {
      const specError = newRunSpecForm.validationError();
      if (specError) throw new Error(specError);
      const { provider, modelName } = splitProviderModel(newRunSelectedModel);
      return createEvaluationRun(setId, {
        model_provider: provider,
        model_name: modelName,
        processing_strategy:
          newRunProcessingStrategy as EvaluationRunCreateRequest["processing_strategy"],
        summary_spec: newRunSpecForm.buildSpec(),
        language: "auto",
        rate_limit_delay_ms: newRunDelayMs,
      });
    },
    {
      errorPrefix: "Nie udało się utworzyć runa",
      successMessage: (created) => `Utworzono przebieg: ${created.evaluation_run_id}`,
      onSuccess: () => runs.reload(),
    },
  );

  const deleteSet = useConfirmDelete<string>({
    title: "Usunąć evaluation set?",
    message: () =>
      `Usunąć "${selectedSet?.name ?? setId}"?${existingRuns.length > 0 ? ` Usunie to też ${existingRuns.length} evaluation run(y/ów).` : ""}`,
    onConfirm: async (id) => {
      await deleteEvaluationSet(id);
    },
    errorPrefix: "Nie udało się usunąć EvaluationSetu",
    successMessage: () => `Usunięto EvaluationSet: ${selectedSet?.name ?? setId}.`,
    afterConfirm: () => navigateTo("/research"),
    keepOpenOnSuccess: true,
  });

  const deleteRun = useConfirmDelete<EvaluationRunListItemResponse>({
    title: "Usunąć evaluation run?",
    message: (run) =>
      `Usunąć run ${run.model_provider}:${run.model_name} (${run.evaluation_run_id})?`,
    onConfirm: async (run) => {
      await deleteEvaluationRun(run.evaluation_run_id);
    },
    errorPrefix: "Nie udało się usunąć runa",
    afterConfirm: () => runs.reload(),
  });

  // pending = queued, running = a worker is on it; both mean the row will change.
  useListPolling(
    runs.reload,
    existingRuns.some((run) => run.status === "pending" || run.status === "running"),
  );

  let entriesSection: React.ReactNode = (
    <p className="text-muted">Ładowanie szczegółów zbioru...</p>
  );
  if (!setDetail.isInitialLoading && selectedSet) {
    entriesSection = (
      <div className="grid">
        {selectedSet.entries.map((entry, index) => (
          <EntryCard key={entry.entry_id} index={index} entry={entry} setId={setId} />
        ))}
      </div>
    );
  } else if (!setDetail.isInitialLoading) {
    entriesSection = null;
  }

  let runsSection: React.ReactNode = <p className="text-muted">Ładowanie przebiegów...</p>;
  if (!runs.isInitialLoading) {
    runsSection =
      existingRuns.length === 0 ? (
        <p className="text-muted">Brak przebiegów dla tego zbioru.</p>
      ) : (
        <RunsTable runs={existingRuns} onDelete={deleteRun.request} />
      );
  }

  return (
    <PageShell>
      <section className="panel-shell grid min-w-0 gap-4">
        <Breadcrumbs trail={EVALUATION_TRAIL} />

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
                {setDetail.isInitialLoading ? "ładowanie..." : "zbiór niedostępny"}
              </span>
            )}
          </h1>

          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => void evaluateMetrics.run()}
              disabled={!selectedSet || evaluateMetrics.isPending}
            >
              {evaluateMetrics.isPending ? "Liczenie..." : "Policz metryki"}
            </Button>
            <Button
              size="sm"
              onClick={() => selectedSet && void exportSet.run(selectedSet.name)}
              disabled={!selectedSet || exportSet.isPending}
            >
              {exportSet.isPending ? "Eksportowanie..." : "Eksport JSON"}
            </Button>
            <Button variant="dangerOutline" size="sm" onClick={() => deleteSet.request(setId)}>
              Usuń zbiór
            </Button>
          </div>
        </div>

        {setDetail.errorMessage ? <Alert tone="danger">{setDetail.errorMessage}</Alert> : null}
        {runs.errorMessage ? <Alert tone="danger">{runs.errorMessage}</Alert> : null}
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
                  disabled={submitNewRun.isPending || isLoadingNewRunOptions}
                >
                  <ModelOptions models={newRunAvailableModels} />
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

              <Button
                variant="primary"
                size="lg"
                onClick={() => void submitNewRun.run()}
                disabled={submitNewRun.isPending || isLoadingNewRunOptions || !newRunSelectedModel}
              >
                {submitNewRun.isPending ? "Tworzenie..." : "Utwórz przebieg"}
              </Button>
            </div>

            <SummarySpecFields
              form={newRunSpecForm}
              presets={newRunPresets}
              processingStrategies={newRunAvailableStrategies}
              selectedProcessingStrategy={newRunProcessingStrategy}
              onProcessingStrategyChange={setNewRunProcessingStrategy}
              disabled={submitNewRun.isPending || isLoadingNewRunOptions}
            />
          </Panel>
        ) : null}

        <h2>Przebiegi</h2>
        {runsSection}

        <h2>Wpisy</h2>
        {entriesSection}
      </section>

      {deleteSet.dialogProps ? <ConfirmDialog {...deleteSet.dialogProps} /> : null}
      {deleteRun.dialogProps ? <ConfirmDialog {...deleteRun.dialogProps} /> : null}
    </PageShell>
  );
}
