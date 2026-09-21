import { useEffect, useRef, useState } from "react";
import { errorText, getToken } from "../api/client";
import {
  createEvaluationRun,
  deleteEvaluationRun,
  deleteEvaluationSet,
  exportEvaluationSet,
  getEvaluationSet,
  getGoldenMetricsPass,
  listEvaluationRuns,
  queueGoldenMetricsPass,
} from "../api/research";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DeepevalItems } from "../components/DeepevalItems";
import { useFlash } from "../components/FlashProvider";
import { InputTextSection } from "../components/InputTextSection";
import { MetricsSection } from "../components/MetricsSection";
import { EVALUATION_TRAIL } from "../components/NavDock";
import { StatusLabel } from "../components/StatusLabel";
import {
  MatchReferenceCheckbox,
  PresetSelect,
  ProcessingStrategySelect,
  SummarySpecFields,
} from "../components/SummarySpecFields";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
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
  EvaluationSetListItemResponse,
} from "../types/api.generated";
import { downloadJson } from "../utils/download";
import { formatDateMinute } from "../utils/format";
import { logger } from "../utils/logger";
import { EVALUATION_SETS_PATH, evaluationRunPath, navigateTo } from "../utils/routing";
import { useAsyncAction } from "../utils/useAsyncAction";
import { useConfirmDelete } from "../utils/useConfirmDelete";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { useListPolling } from "../utils/useListPolling";
import { useReloadableResource } from "../utils/useReloadableResource";
import { useSummarizationOptions } from "../utils/useSummarizationOptions";
import { useSummarySpecForm } from "../utils/useSummarySpecForm";
import { splitProviderModel } from "../utils/utils";

type GoldenMetricsPassStatus = NonNullable<EvaluationSetListItemResponse["golden_metrics_status"]>;

// The set's own status table (backend routers/evaluation_sets.py): only these statuses ever need
// a fresh queue attempt on page load — "completed"/"skipped" are left alone. "pending" and
// "running" are both included because a process can die between writing "pending" and the
// background task actually starting; the backend's own staleness check (409 otherwise) is what
// actually decides whether a queue attempt is accepted.
const RESUMABLE_GOLDEN_METRICS_STATUSES: (GoldenMetricsPassStatus | null)[] = [
  null,
  "failed",
  "pending",
  "running",
];

const GOLDEN_METRICS_STATUS_LABEL: Record<GoldenMetricsPassStatus, string> = {
  pending: "w kolejce",
  running: "liczenie w toku",
  completed: "gotowe",
  failed: "błąd",
  skipped: "pominięte przy imporcie",
};

function EntryCard({
  index,
  entry,
  setId,
  goldenMetricsStatus,
}: {
  index: number;
  entry: EvaluationSetEntryResponse;
  setId: string;
  goldenMetricsStatus: GoldenMetricsPassStatus | null;
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
              <p className="p-3 text-muted">
                Metryki wzorcowe:{" "}
                {goldenMetricsStatus
                  ? GOLDEN_METRICS_STATUS_LABEL[goldenMetricsStatus]
                  : "jeszcze nie policzone"}
                .
              </p>
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
              <LinkButton size="sm" href={evaluationRunPath(run.evaluation_run_id)}>
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
  const showFlash = useFlash();
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
  const goldenMetricsPass = useReloadableResource(
    () => getGoldenMetricsPass(setId),
    setId,
    "Nie udało się pobrać statusu metryk wzorcowych",
  );
  const selectedSet = setDetail.data;
  // null means "no answer yet" — a real third state, not a missing value.
  const existingRuns = runs.data ?? [];
  const goldenMetricsStatus = goldenMetricsPass.data?.status ?? null;
  const isGoldenMetricsPassInProgress =
    goldenMetricsStatus === "pending" || goldenMetricsStatus === "running";

  useListPolling(goldenMetricsPass.reload, isGoldenMetricsPassInProgress);

  // Announce the pass leaving pending/running, the same shape as the run-status effect below.
  const previousGoldenMetricsStatus = useRef<GoldenMetricsPassStatus | null>(null);
  useEffect(() => {
    const previousStatus = previousGoldenMetricsStatus.current;
    previousGoldenMetricsStatus.current = goldenMetricsStatus;
    if (
      previousStatus &&
      previousStatus !== goldenMetricsStatus &&
      !isGoldenMetricsPassInProgress
    ) {
      showFlash(
        `Metryki wzorcowe: ${GOLDEN_METRICS_STATUS_LABEL[goldenMetricsStatus ?? "failed"]}.`,
      );
      void setDetail.reload();
    }
  }, [goldenMetricsStatus, isGoldenMetricsPassInProgress, setDetail.reload, showFlash]);

  // Once per mount: a set left "pending"/"running" by a process that died, or "failed", gets
  // queued again without the reader having to click anything. The backend's own staleness and
  // status checks (409) are what actually decide whether this attempt does anything.
  const hasAttemptedGoldenMetricsResume = useRef(false);
  useEffect(() => {
    if (hasAttemptedGoldenMetricsResume.current) return;
    if (goldenMetricsPass.data === null) return; // wait for the first answer
    hasAttemptedGoldenMetricsResume.current = true;
    if (getToken() === null) return;
    if (!RESUMABLE_GOLDEN_METRICS_STATUSES.includes(goldenMetricsStatus)) return;

    queueGoldenMetricsPass(setId)
      .then(() => goldenMetricsPass.reload())
      .catch((error: unknown) => {
        // A 409 (already running/completed/skipped) is the expected outcome most of the time —
        // this is a background nicety, not a user action, so it never surfaces as a flash.
        logger.debug("golden metrics pass resume attempt did not start a new pass", {
          error: errorText(error),
        });
      });
  }, [goldenMetricsPass.data, goldenMetricsPass.reload, goldenMetricsStatus, setId]);

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
    afterConfirm: () => navigateTo(EVALUATION_SETS_PATH),
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
          <EntryCard
            key={entry.entry_id}
            index={index}
            entry={entry}
            setId={setId}
            goldenMetricsStatus={goldenMetricsStatus}
          />
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
        {goldenMetricsPass.errorMessage ? (
          <Alert tone="danger">{goldenMetricsPass.errorMessage}</Alert>
        ) : null}
        {errorMessage ? <Alert tone="danger">{errorMessage}</Alert> : null}

        {selectedSet ? (
          <Alert
            tone={
              goldenMetricsStatus === "failed"
                ? "danger"
                : goldenMetricsStatus === "completed" || goldenMetricsStatus === "skipped"
                  ? "success"
                  : "warning"
            }
            aria-live="polite"
          >
            {goldenMetricsPass.data ? (
              <>
                Metryki wzorcowe:{" "}
                {goldenMetricsStatus
                  ? GOLDEN_METRICS_STATUS_LABEL[goldenMetricsStatus]
                  : "jeszcze nie policzone"}
                {" · "}
                {goldenMetricsPass.data.entries_with_metrics} / {goldenMetricsPass.data.entry_count}{" "}
                wpisów
                {goldenMetricsPass.data.error ? (
                  <span className="block">{goldenMetricsPass.data.error}</span>
                ) : null}
              </>
            ) : (
              "Sprawdzanie statusu metryk wzorcowych…"
            )}
          </Alert>
        ) : null}

        {selectedSet ? (
          <Panel as="section" padding="sm" className="grid gap-3">
            <h2>Nowy przebieg</h2>

            <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
              <div className="grid shrink-0 gap-2">
                <FieldLabel htmlFor="new-run-model">Model</FieldLabel>
                <Select
                  id="new-run-model"
                  value={newRunSelectedModel}
                  onChange={(event) => setNewRunSelectedModel(event.target.value)}
                  disabled={submitNewRun.isPending || isLoadingNewRunOptions}
                  className="max-w-56 truncate"
                >
                  <ModelOptions models={newRunAvailableModels} />
                </Select>
              </div>

              <ProcessingStrategySelect
                processingStrategies={newRunAvailableStrategies}
                selectedProcessingStrategy={newRunProcessingStrategy}
                onProcessingStrategyChange={setNewRunProcessingStrategy}
                disabled={submitNewRun.isPending || isLoadingNewRunOptions}
              />

              <div className="grid shrink-0 gap-2">
                <FieldLabel htmlFor="new-run-delay">Odstęp (ms)</FieldLabel>
                <Input
                  id="new-run-delay"
                  type="number"
                  min={0}
                  step={100}
                  className="max-w-24"
                  value={newRunDelayMs}
                  onChange={(event) => setNewRunDelayMs(Number(event.target.value))}
                />
              </div>

              <PresetSelect
                form={newRunSpecForm}
                presets={newRunPresets}
                disabled={submitNewRun.isPending || isLoadingNewRunOptions}
              />

              <MatchReferenceCheckbox
                form={newRunSpecForm}
                disabled={submitNewRun.isPending || isLoadingNewRunOptions}
              />
            </div>

            <SummarySpecFields
              form={newRunSpecForm}
              disabled={submitNewRun.isPending || isLoadingNewRunOptions}
            />

            <Button
              variant="primary"
              size="lg"
              onClick={() => void submitNewRun.run()}
              disabled={submitNewRun.isPending || isLoadingNewRunOptions || !newRunSelectedModel}
              className="justify-self-start"
            >
              {submitNewRun.isPending ? "Tworzenie..." : "Utwórz przebieg"}
            </Button>
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
