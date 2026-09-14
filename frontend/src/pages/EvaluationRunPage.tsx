import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { evaluateRunDeepeval, getEvaluationRun, getEvaluationRunEntries } from "../api/research";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { type DeepevalDisplayItem, DeepevalItems } from "../components/DeepevalItems";
import { useFlash } from "../components/FlashProvider";
import { InfoRow, InfoRowContent } from "../components/InfoRow";
import { InputTextSection } from "../components/InputTextSection";
import { EVALUATION_TRAIL } from "../components/NavDock";
import { StatusLabel } from "../components/StatusLabel";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { cn } from "../components/ui/cn";
import { DisclosureSections } from "../components/ui/DisclosureSections";
import { PageShell, SectionHeading } from "../components/ui/PageShell";
import { Panel } from "../components/ui/Panel";
import type {
  EvaluationRunEntryResponse,
  EvaluationRunResponse,
  SummaryStatisticalMetrics,
} from "../types/api.generated";
import { formatDateMinute, formatMetricLabel, formatScore } from "../utils/format";
import { evaluationSetPath } from "../utils/routing";
import { useAsyncAction } from "../utils/useAsyncAction";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { useListPolling } from "../utils/useListPolling";
import { useReloadableResource } from "../utils/useReloadableResource";

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
      <span className="label-caps font-semibold text-muted">{label}:</span>
      <span className="mono-value">{golden != null ? formatScore(golden) : "—"}</span>
      <span className="mono-value">{ai != null ? formatScore(ai) : "—"}</span>
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
          <div className={cn(COMPARISON_COLUMNS, "gap-y-1 text-xs")}>
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
            <p className="text-muted">Metryki wzorca nie zostały policzone dla tego wpisu.</p>
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
    <div className="grid gap-2 border-t border-panel-border pt-4">
      <SectionHeading>Metryki deepeval</SectionHeading>
      <div className="grid grid-cols-2 gap-3">
        <div>
          {goldenItems.length > 0 ? (
            <DeepevalItems items={goldenItems} />
          ) : (
            <p className="text-muted">—</p>
          )}
        </div>
        <div>
          {aiItems.length > 0 ? <DeepevalItems items={aiItems} /> : <p className="text-muted">—</p>}
        </div>
      </div>
    </div>
  );
}

function CrossMetricsSection({ entry }: { entry: EvaluationRunEntryResponse }) {
  if (!entry.cross_metrics) {
    return <p className="text-muted">Jeszcze nie policzone.</p>;
  }

  const { rouge1, rouge2, rougeL, meteor, deepeval } = entry.cross_metrics;
  const pairwiseItems: DeepevalDisplayItem[] = deepeval.map((item) => ({
    ...item,
    statusLabel: pairwiseWinnerLabel(item.score),
  }));

  return (
    <div className="grid gap-3">
      <SectionHeading>Metryki statystyczne porównawcze</SectionHeading>
      <div className="metric-row">
        <InfoRow label="rouge1" value={rouge1} />
        <InfoRow label="rouge2" value={rouge2} />
        <InfoRow label="rougeL" value={rougeL} />
        <InfoRow label="meteor" value={meteor} />
      </div>
      {pairwiseItems.length > 0 ? (
        <div className="border-t border-panel-border pt-4">
          <SectionHeading>Metryki deepeval porównawcze</SectionHeading>
          <DeepevalItems items={pairwiseItems} />
        </div>
      ) : null}
    </div>
  );
}

function EntryMetrics({ entry }: { entry: EvaluationRunEntryResponse }) {
  return (
    <div className="grid gap-4 p-3 bg-subtle">
      <div className="grid gap-2">
        <CrossMetricsSection entry={entry} />
      </div>
      <div className="grid gap-4 border-t border-panel-border pt-4">
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
    <Panel padding="sm" className="grid gap-3">
      <div className="metric-row">
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
          valueClassName={progress.failedEntryCount ? "text-danger" : ""}
        />
        <InfoRow label="utworzono" value={formatDateMinute(run.created_at)} />
        <InfoRow label="zakończono" value={formatDateMinute(run.finished_at)} />
      </div>

      <div className="grid gap-2 border-t border-panel-border pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="metric-row items-baseline">
            <SectionHeading>G-Eval</SectionHeading>
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
                <span className="text-muted">nierozpoczęte</span>
              </InfoRowContent>
            )}
          </div>
          {deepevalButton}
        </div>
        {deepeval?.error ? <p className="text-danger">{deepeval.error}</p> : null}
      </div>

      {error ? <p className="text-danger">{error}</p> : null}
    </Panel>
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
  return (
    <article className="grid gap-3 border-t border-panel-border p-4">
      <h4>
        {index + 1}
        {" · "}
        <span className="font-normal">
          <StatusLabel status={entry.status} />
        </span>
        {" · "}
        <span className="mono-value font-normal lowercase text-muted">
          {entry.title} · {entry.url}
        </span>
      </h4>

      {entry.error ? <p className="text-danger">{entry.error}</p> : null}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="grid content-start gap-1">
          <h4>Podsumowanie wzorcowe</h4>
          <p className="whitespace-pre-wrap text-ink">{entry.golden_summary}</p>
        </div>

        <div className="grid content-start gap-2">
          <h4>Podsumowanie AI</h4>
          <p className="whitespace-pre-wrap text-ink">{entry.ai_summary ?? "—"}</p>
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
          ...(entry.ai_key_takeaways === null
            ? []
            : [
                {
                  key: "takeaways",
                  label: "Punkty kluczowe AI",
                  content: (
                    <ul className="list-disc py-3 pl-8 pr-3 text-ink">
                      {entry.ai_key_takeaways.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ),
                },
              ]),
        ]}
      />
    </article>
  );
}

type Props = {
  runId: string;
};

export function EvaluationRunPage({ runId }: Props) {
  const showFlash = useFlash();
  const previousRunStatus = useRef<string | null>(null);
  const previousDeepevalStatus = useRef<string | null>(null);

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
  const isDeepevalRunning = deepevalStatus === "running";

  useDocumentTitle(
    run ? `${run.model_provider}:${run.model_name} · ${run.evaluation_set_name}` : null,
  );

  useListPolling(runResource.reload, isRunInProgress || isDeepevalRunning);
  useListPolling(entriesResource.reload, true, isRunInProgress || isDeepevalRunning);

  useEffect(() => {
    if (!run) return;
    const previousStatus = previousRunStatus.current;
    previousRunStatus.current = run.status;
    if (previousStatus && previousStatus !== run.status && !isRunInProgress) {
      showFlash(`Run zakończony ze statusem: ${run.status}.`);
      void entriesResource.reload();
    }
  }, [run, isRunInProgress, entriesResource.reload, showFlash]);

  // GEval writes its scores into the entries, which the run document does not carry.
  useEffect(() => {
    const previousStatus = previousDeepevalStatus.current;
    previousDeepevalStatus.current = deepevalStatus;
    if (previousStatus === "running" && deepevalStatus && deepevalStatus !== "running") {
      showFlash(`G-Eval zakończony ze statusem: ${deepevalStatus}.`);
      void entriesResource.reload();
    }
  }, [deepevalStatus, entriesResource.reload, showFlash]);

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
            size="sm"
            onClick={() => void startDeepeval.run()}
            disabled={isRunInProgress || isDeepevalRunning || startDeepeval.isPending}
          >
            {startDeepeval.isPending ? "Liczenie..." : "Policz G-Eval"}
          </Button>
        }
      />
    );
  } else if (runResource.isInitialLoading) {
    runSummary = <p className="text-muted">Ładowanie szczegółów runa...</p>;
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
    <p className="text-muted">Ładowanie wpisów...</p>
  ) : (
    entryCards
  );

  return (
    <PageShell>
      <section className="panel-shell grid min-w-0 gap-4">
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

        <h1 className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-muted">Przebieg</span>
          {run ? (
            <>
              <span className="mono-value">{run.evaluation_set_name}</span>
              <span className="text-muted">·</span>
              <span className="mono-value">
                {run.model_provider} – {run.model_name}
              </span>
              <span className="text-muted">·</span>
              <span className="mono-value">{run.processing_strategy}</span>
            </>
          ) : (
            <span className="text-muted">ładowanie...</span>
          )}
        </h1>

        {runResource.errorMessage ? <Alert tone="danger">{runResource.errorMessage}</Alert> : null}
        {entriesResource.errorMessage ? (
          <Alert tone="danger">{entriesResource.errorMessage}</Alert>
        ) : null}

        {/* Always mounted: a live region only announces content inserted after it exists. */}
        <div aria-live="polite">{runSummary}</div>

        {entriesSection}
      </section>
    </PageShell>
  );
}
