import { type ReactNode, useMemo, useState } from "react";
import { evaluateRunDeepeval, getEvaluationRun, getEvaluationRunEntries } from "../api/research";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { type DeepevalDisplayItem, DeepevalItems } from "../components/DeepevalItems";
import { useFlash } from "../components/FlashProvider";
import { InfoList, InfoRow, InfoRowContent } from "../components/InfoRow";
import { InputTextSection } from "../components/InputTextSection";
import { EVALUATION_TRAIL } from "../components/NavDock";
import { StatusLabel } from "../components/StatusLabel";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { cn } from "../components/ui/cn";
import { DisclosureSections } from "../components/ui/DisclosureSections";
import { PageSection, PageShell, SectionHeading } from "../components/ui/PageShell";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useListPolling } from "../hooks/useListPolling";
import { useReloadableResource } from "../hooks/useReloadableResource";
import { useWorkFinished } from "../hooks/useWorkFinished";
import type {
  EvaluationRunEntryResponse,
  EvaluationRunResponse,
  SummaryStatisticalMetrics,
} from "../types/api.generated";
import { formatDateMinute, formatMetricLabel, formatScore } from "../utils/format";
import { evaluationSetPath } from "../utils/routing";
import {
  FUNCTION_LABELS,
  formatLengthTarget,
  LENGTH_POLICY_LABELS,
  OUTPUT_FORMAT_LABELS,
  STANCE_LABELS,
} from "../utils/summarySpecLabels";

const PAIRWISE_TIE_MARGIN = 0.05;

function pairwiseWinnerLabel(score: number): "golden" | "ai" | "tie" {
  if (score > 0.5 + PAIRWISE_TIE_MARGIN) return "ai";
  if (score < 0.5 - PAIRWISE_TIE_MARGIN) return "golden";
  return "tie";
}

// The label is named once and the two values line up under their column heading, so the pair
// cannot break apart the way a repeated label in two narrow columns does.
const COMPARISON_COLUMNS = "grid grid-cols-[minmax(8rem,auto)_1fr_1fr] items-baseline gap-x-4";

function MetricRow({
  label,
  golden,
  ai,
}: {
  label: string;
  golden: number | null | undefined;
  ai: number | null | undefined;
}) {
  return (
    <>
      <span className="text-mute">{label}:</span>
      <span className="tabular-nums">{golden != null ? formatScore(golden) : "—"}</span>
      <span className="tabular-nums">{ai != null ? formatScore(ai) : "—"}</span>
    </>
  );
}

function ColumnsHeader() {
  return (
    <>
      <span />
      <SectionHeading>Wzorzec</SectionHeading>
      <SectionHeading>AI</SectionHeading>
    </>
  );
}

function StatisticalMetricsColumns({ entry }: { entry: EvaluationRunEntryResponse }) {
  const goldenSummary: Partial<SummaryStatisticalMetrics> = entry.golden_metrics?.summary ?? {};
  const aiSummary: Partial<SummaryStatisticalMetrics> = entry.ai_metrics?.summary ?? {};

  const allLabels = Array.from(
    new Set([...Object.keys(goldenSummary), ...Object.keys(aiSummary)]),
  ) as (keyof SummaryStatisticalMetrics)[];

  return (
    <div className="grid gap-2">
      <SectionHeading>Metryki statystyczne</SectionHeading>
      {allLabels.length > 0 ? (
        <>
          <div className={cn(COMPARISON_COLUMNS, "gap-y-1 text-caption")}>
            <ColumnsHeader />
            {allLabels.map((label) => (
              <MetricRow
                key={label}
                label={formatMetricLabel(label)}
                golden={goldenSummary[label]}
                ai={aiSummary[label]}
              />
            ))}
          </div>
          {!entry.golden_metrics ? (
            <p className="text-mute">Metryki wzorca nie zostały policzone dla tego wpisu.</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function DeepevalMetricsColumns({ entry }: { entry: EvaluationRunEntryResponse }) {
  const goldenItems: DeepevalDisplayItem[] = entry.golden_metrics?.deepeval ?? [];
  const aiItems: DeepevalDisplayItem[] = entry.ai_metrics?.deepeval ?? [];

  if (goldenItems.length === 0 && aiItems.length === 0) return null;

  return (
    <div className="grid gap-2 border-t border-hairline pt-4">
      <SectionHeading>Metryki deepeval</SectionHeading>
      <div className="grid grid-cols-2 gap-3">
        <div>
          {goldenItems.length > 0 ? (
            <DeepevalItems items={goldenItems} />
          ) : (
            <p className="text-mute">—</p>
          )}
        </div>
        <div>
          {aiItems.length > 0 ? <DeepevalItems items={aiItems} /> : <p className="text-mute">—</p>}
        </div>
      </div>
    </div>
  );
}

function CrossMetricsSection({ entry }: { entry: EvaluationRunEntryResponse }) {
  if (!entry.cross_metrics) {
    return <p className="text-mute">Jeszcze nie policzone.</p>;
  }

  const { rouge1, rouge2, rougeL, meteor, deepeval } = entry.cross_metrics;
  const pairwiseItems: DeepevalDisplayItem[] = deepeval.map((item) => ({
    ...item,
    statusLabel: pairwiseWinnerLabel(item.score),
  }));

  return (
    <div className="grid gap-3">
      <SectionHeading>Metryki statystyczne porównawcze</SectionHeading>
      <InfoList>
        <InfoRow label="rouge1" value={rouge1} />
        <InfoRow label="rouge2" value={rouge2} />
        <InfoRow label="rougeL" value={rougeL} />
        <InfoRow label="meteor" value={meteor} />
      </InfoList>
      {pairwiseItems.length > 0 ? (
        <div className="grid gap-2 border-t border-hairline pt-4">
          <SectionHeading>Metryki deepeval porównawcze</SectionHeading>
          <DeepevalItems items={pairwiseItems} />
        </div>
      ) : null}
    </div>
  );
}

function EntryMetrics({ entry }: { entry: EvaluationRunEntryResponse }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <CrossMetricsSection entry={entry} />
      </div>
      <div className="grid gap-4 border-t border-hairline pt-4">
        <StatisticalMetricsColumns entry={entry} />
        <DeepevalMetricsColumns entry={entry} />
      </div>
    </div>
  );
}

interface EntryProgress {
  completedEntryCount: number;
  failedEntryCount: number;
}

function RunSummary({
  run,
  progress,
  deepevalButton,
}: {
  run: EvaluationRunResponse;
  progress: EntryProgress;
  deepevalButton: ReactNode;
}) {
  const { error, deepeval } = run.aggregate_metrics;

  return (
    <div className="grid gap-4">
      <InfoList>
        <InfoRowContent label="status">
          <StatusLabel status={run.status} />
        </InfoRowContent>
        <InfoRow label="wpisów" value={run.entry_count} />
        <InfoRow
          label="ukończonych"
          value={`${progress.completedEntryCount} / ${run.entry_count}`}
        />
        <InfoRow
          label="błędnych"
          value={progress.failedEntryCount}
          valueClassName={progress.failedEntryCount ? "text-danger-hover" : undefined}
        />
        <InfoRow label="utworzono" value={formatDateMinute(run.created_at)} />
        <InfoRow label="zakończono" value={formatDateMinute(run.finished_at)} />
      </InfoList>

      <InfoList>
        <InfoRow label="format" value={OUTPUT_FORMAT_LABELS[run.summary_spec.output_format]} />
        <InfoRow label="narracja" value={STANCE_LABELS[run.summary_spec.narrative_stance]} />
        <InfoRow label="funkcja" value={FUNCTION_LABELS[run.summary_spec.summary_function]} />
        {run.summary_spec.length ? (
          <InfoRow label="długość" value={LENGTH_POLICY_LABELS[run.summary_spec.length.policy]} />
        ) : null}
      </InfoList>

      <div className="grid gap-2 border-t border-hairline pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <SectionHeading>G-Eval</SectionHeading>
          {deepevalButton}
        </div>
        <InfoList>
          {deepeval ? (
            <>
              <InfoRowContent label="status">
                <StatusLabel status={deepeval.status} />
              </InfoRowContent>
              <InfoRow label="zaktualizowanych" value={deepeval.updated_entries} />
              <InfoRow label="pominiętych" value={deepeval.skipped_entries} />
              <InfoRow label="rozpoczęto" value={formatDateMinute(deepeval.started_at)} />
              <InfoRow label="zakończono" value={formatDateMinute(deepeval.finished_at)} />
              <InfoRow label="już ocenionych" value={deepeval.already_scored_entries} />
            </>
          ) : (
            // StatusLabel carries the four job statuses shared with jobs, runs and entries;
            // "not started" is a fifth state that only this pass has.
            <InfoRowContent label="status">
              <span className="text-mute">nierozpoczęte</span>
            </InfoRowContent>
          )}
        </InfoList>
        {deepeval?.error ? (
          <p className="wrap-anywhere text-danger-hover">{deepeval.error}</p>
        ) : null}
      </div>

      {error ? <p className="wrap-anywhere text-danger-hover">{error}</p> : null}
    </div>
  );
}

function RunEntryCard({
  index,
  entry,
  evaluationSetId,
}: {
  index: number;
  entry: EvaluationRunEntryResponse;
  evaluationSetId: string;
}) {
  const [isOpen, setIsOpen] = useState(index === 0);

  return (
    <article className="min-w-0 border-b border-hairline">
      <h3 className="font-normal">
        <button
          type="button"
          onClick={() => setIsOpen((value) => !value)}
          aria-expanded={isOpen}
          className="flex min-h-11 w-full cursor-pointer items-baseline gap-3 py-3 text-left"
        >
          <span aria-hidden="true" className="shrink-0">
            {isOpen ? "[-]" : "[+]"}
          </span>
          <span className="grid min-w-0 flex-1">
            <span className="wrap-anywhere">
              {index + 1}
              {" · "}
              {entry.title}
            </span>
            <span className="truncate text-caption text-mute">{entry.url}</span>
          </span>
          <span className="shrink-0 text-caption">
            <StatusLabel status={entry.status} />
          </span>
        </button>
      </h3>

      {isOpen ? (
        <div className="grid min-w-0 gap-4 pb-4">
          {entry.error ? <p className="wrap-anywhere text-danger-hover">{entry.error}</p> : null}

          <div className="grid gap-6 md:grid-cols-2">
            <div className="grid min-w-0 content-start gap-2">
              <h4>Podsumowanie wzorcowe</h4>
              <p className="whitespace-pre-wrap font-reading text-reading">
                {entry.golden_summary}
              </p>
            </div>

            <div className="grid min-w-0 content-start gap-2">
              <h4>
                Podsumowanie AI
                {entry.resolved_length ? (
                  <span className="font-normal text-mute">
                    {" · cel: "}
                    {formatLengthTarget(
                      entry.resolved_length.target_words,
                      entry.resolved_length.target_sentences,
                    )}
                  </span>
                ) : null}
              </h4>
              <p className="whitespace-pre-wrap font-reading text-reading">
                {entry.ai_summary ?? "—"}
              </p>
            </div>
          </div>

          <DisclosureSections
            sections={[
              {
                key: "input",
                label: "Tekst źródłowy",
                content: <InputTextSection setId={evaluationSetId} entryId={entry.entry_id} />,
              },
              { key: "metrics", label: "Metryki", content: <EntryMetrics entry={entry} /> },
            ]}
          />
        </div>
      ) : null}
    </article>
  );
}

type EvaluationRunPageProps = {
  runId: string;
};

export function EvaluationRunPage({ runId }: EvaluationRunPageProps) {
  const showFlash = useFlash();

  const runResource = useReloadableResource(
    () => getEvaluationRun(runId),
    runId,
    "Nie udało się pobrać runa",
  );
  const entriesResource = useReloadableResource(
    () => getEvaluationRunEntries(runId),
    runId,
    "Nie udało się pobrać entries",
  );
  const run = runResource.data;
  const entries = entriesResource.data?.entries ?? null;

  const entryProgress = {
    completedEntryCount: (entries ?? []).filter((entry) => entry.status === "completed").length,
    failedEntryCount: (entries ?? []).filter((entry) => entry.status === "failed").length,
  };

  const isRunInProgress = run?.status === "pending" || run?.status === "running";
  // The GEval pass is queued separately and keeps running after the run itself has finished.
  const deepevalStatus = run?.aggregate_metrics.deepeval?.status ?? null;
  const isDeepevalRunning = deepevalStatus === "pending" || deepevalStatus === "running";

  useDocumentTitle(
    run ? `${run.model_provider}:${run.model_name} · ${run.evaluation_set_name}` : null,
  );

  useListPolling(runResource.reload, isRunInProgress || isDeepevalRunning);
  useListPolling(entriesResource.reload, true, isRunInProgress || isDeepevalRunning);

  useWorkFinished(run?.status ?? null, isRunInProgress, (status) => {
    showFlash(`Run zakończony ze statusem: ${status}.`);
    void entriesResource.reload();
  });

  // GEval writes its scores into the entries, which the run document does not carry.
  useWorkFinished(deepevalStatus, isDeepevalRunning, (status) => {
    showFlash(`G-Eval zakończony ze statusem: ${status}.`);
    void entriesResource.reload();
  });

  const startDeepeval = useAsyncAction(() => evaluateRunDeepeval(runId), {
    errorPrefix: "Nie udało się uruchomić G-Eval",
    onSuccess: () => runResource.reload(),
  });

  let runSummary = null;
  if (run) {
    runSummary = (
      <RunSummary
        run={run}
        progress={entryProgress}
        deepevalButton={
          <Button
            variant="primary"
            onClick={() => void startDeepeval.run()}
            disabled={isRunInProgress || isDeepevalRunning || startDeepeval.isPending}
          >
            {startDeepeval.isPending ? "Liczenie..." : "Policz G-Eval"}
          </Button>
        }
      />
    );
  } else if (runResource.isInitialLoading) {
    runSummary = <p className="text-mute">Ładowanie szczegółów runa...</p>;
  }

  // Polling replaces `run` every few seconds; the entry list does not depend on it.
  const evaluationSetId = run?.evaluation_set_id;
  const entryCards = useMemo(() => {
    if (!entries || !evaluationSetId) return null;
    return (
      <div className="grid">
        {entries.map((entry, index) => (
          <RunEntryCard
            key={entry.entry_id}
            index={index}
            entry={entry}
            evaluationSetId={evaluationSetId}
          />
        ))}
      </div>
    );
  }, [entries, evaluationSetId]);

  const entriesSection = entriesResource.isInitialLoading ? (
    <p className="text-mute">Ładowanie wpisów...</p>
  ) : (
    entryCards
  );

  return (
    <PageShell>
      <div className="grid min-w-0 gap-section">
        <div className="grid min-w-0 gap-6">
          <div className="grid gap-2">
            <Breadcrumbs
              trail={
                run
                  ? [
                      ...EVALUATION_TRAIL,
                      {
                        label: run.evaluation_set_name,
                        href: evaluationSetPath(run.evaluation_set_id),
                      },
                    ]
                  : EVALUATION_TRAIL
              }
            />

            <h1 className="flex flex-wrap items-baseline gap-x-2 text-title">
              <span className="text-mute">Przebieg</span>
              {run ? (
                <>
                  <span className="wrap-anywhere">{run.evaluation_set_name}</span>
                  <span className="text-mute">·</span>
                  <span className="wrap-anywhere">
                    {run.model_provider} – {run.model_name}
                  </span>
                  <span className="text-mute">·</span>
                  <span>{run.processing_strategy}</span>
                </>
              ) : (
                <span className="text-mute">ładowanie...</span>
              )}
            </h1>
          </div>

          {runResource.errorMessage ? (
            <Alert tone="danger">{runResource.errorMessage}</Alert>
          ) : null}
          {entriesResource.errorMessage ? (
            <Alert tone="danger">{entriesResource.errorMessage}</Alert>
          ) : null}

          {/* Always mounted: a live region only announces content inserted after it exists. */}
          <div aria-live="polite">{runSummary}</div>
        </div>

        <PageSection title="Wpisy">{entriesSection}</PageSection>
      </div>
    </PageShell>
  );
}
