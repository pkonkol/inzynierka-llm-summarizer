import { useEffect, useMemo, useRef, useState } from "react";
import { errorText } from "../api/client";
import { evaluateRunDeepeval, getEvaluationRun, getEvaluationRunEntries } from "../api/research";
import { type DeepevalDisplayItem, DeepevalItems } from "../components/DeepevalItems";
import { useFlash } from "../components/FlashProvider";
import { InfoRow } from "../components/InfoRow";
import { InputTextSection } from "../components/InputTextSection";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { cn } from "../components/ui/cn";
import { DisclosureSections } from "../components/ui/DisclosureSections";
import { LinkButton } from "../components/ui/LinkButton";
import { PageShell, SectionHeading } from "../components/ui/PageShell";
import { Panel } from "../components/ui/Panel";
import type {
  EvaluationRunEntryResponse,
  EvaluationRunResponse,
  SummaryStatisticalMetrics,
} from "../types/api.generated";
import { formatDateMinute, formatMetricLabel } from "../utils/format";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { useListPolling } from "../utils/useListPolling";

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
      <span className="mono-value">{golden ?? "—"}</span>
      <span className="mono-value">{ai ?? "—"}</span>
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

      {entry.ai_metrics && entry.ai_key_takeaways.length > 0 ? (
        <div className="grid gap-2 border-t border-panel-border pt-4">
          <SectionHeading>Punkty kluczowe AI</SectionHeading>
          <div className="metric-row">
            <InfoRow label="liczba punktów" value={entry.ai_metrics.key_takeaways.bullet_count} />
            <InfoRow label="liczba znaków" value={entry.ai_metrics.key_takeaways.char_count} />
          </div>
        </div>
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
      <SectionHeading>Deepeval</SectionHeading>
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

  return (
    <div className="grid gap-3">
      <div className="metric-row">
        <InfoRow label="rouge1" value={rouge1} />
        <InfoRow label="rouge2" value={rouge2} />
        <InfoRow label="rougeL" value={rougeL} />
        <InfoRow label="meteor" value={meteor} />
      </div>
      {deepeval.length > 0 ? (
        <div className="grid gap-2 border-t border-panel-border pt-4">
          {deepeval.map((item) => (
            <div
              key={item.name}
              className="grid gap-2 border border-panel-border bg-panel-solid px-3 py-2"
            >
              <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
                <span className="label-caps font-semibold text-muted">{item.name}:</span>
                <span className="mono-value">{pairwiseWinnerLabel(item.score)}</span>
                <span className="mono-value text-muted">·</span>
                <span className="mono-value">{item.score}</span>
              </div>
              <p className="text-muted">{item.reason}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EntryMetrics({ entry }: { entry: EvaluationRunEntryResponse }) {
  return (
    <div className="grid gap-4 p-3 bg-subtle">
      <div className="grid gap-2">
        <SectionHeading>Metryki porównawcze</SectionHeading>
        <CrossMetricsSection entry={entry} />
      </div>
      <div className="grid gap-4 border-t border-panel-border pt-4">
        <StatisticalMetricsColumns entry={entry} />
        <DeepevalMetricsColumns entry={entry} />
      </div>
    </div>
  );
}

const RUN_STATUS_STYLE: Record<string, string> = {
  completed: "text-success",
  failed: "text-danger",
  running: "text-warning",
  pending: "text-warning",
};

function RunSummary({ run }: { run: EvaluationRunResponse }) {
  const { entry_count, completed_entries, failed_entries, error, deepeval } = run.aggregate_metrics;

  return (
    <Panel padding="sm" className="grid gap-3">
      <div className="metric-row">
        <InfoRow
          label="status"
          value={run.status}
          valueClassName={RUN_STATUS_STYLE[run.status] ?? ""}
        />
        <InfoRow label="wpisów" value={entry_count} />
        <InfoRow label="ukończonych" value={completed_entries} />
        <InfoRow
          label="błędnych"
          value={failed_entries}
          valueClassName={failed_entries ? "text-danger" : ""}
        />
        <InfoRow label="utworzono" value={formatDateMinute(run.created_at)} />
        <InfoRow
          label="zakończono"
          value={run.finished_at ? formatDateMinute(run.finished_at) : "—"}
        />
      </div>

      {deepeval ? (
        <div className="grid gap-2 border-t border-panel-border pt-4">
          <SectionHeading>GEval</SectionHeading>
          <div className="metric-row">
            <InfoRow
              label="status"
              value={deepeval.status}
              valueClassName={RUN_STATUS_STYLE[deepeval.status] ?? ""}
            />
            <InfoRow label="zaktualizowanych" value={deepeval.updated_entries} />
            <InfoRow label="pominiętych" value={deepeval.skipped_entries} />
            <InfoRow
              label="zakończono"
              value={deepeval.finished_at ? formatDateMinute(deepeval.finished_at) : null}
            />
          </div>
          {deepeval.error ? <p className="text-danger">{deepeval.error}</p> : null}
        </div>
      ) : null}

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
        <span className="font-normal">{entry.status}</span>
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
        ]}
      />
    </article>
  );
}

type Props = {
  runId: string;
};

export function EvaluationRunPage({ runId }: Props) {
  const [run, setRun] = useState<EvaluationRunResponse | null>(null);
  const [entries, setEntries] = useState<EvaluationRunEntryResponse[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingEntries, setIsLoadingEntries] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const showFlash = useFlash();
  const [isEvaluatingDeepeval, setIsEvaluatingDeepeval] = useState(false);
  const previousRunStatus = useRef<string | null>(null);

  const isRunInProgress = run?.status === "pending" || run?.status === "running";

  useDocumentTitle(
    run ? `${run.model_provider}:${run.model_name} · ${run.evaluation_set_name}` : null,
  );

  const loadRun = async () => {
    try {
      const data = await getEvaluationRun(runId);
      setRun(data);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(`Nie udało się pobrać runa: ${errorText(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const loadEntries = async () => {
    setIsLoadingEntries(true);
    try {
      const data = await getEvaluationRunEntries(runId);
      setEntries(data.entries);
    } catch (error) {
      setErrorMessage(`Nie udało się pobrać entries: ${errorText(error)}`);
    } finally {
      setIsLoadingEntries(false);
    }
  };

  useEffect(() => {
    setIsLoading(true);
    setIsLoadingEntries(true);
    void loadRun();
    void loadEntries();
  }, [runId]);

  // The backend owns the status, so a reload must be able to pick a run back up mid-flight.
  useListPolling(loadRun, true, isRunInProgress);

  useEffect(() => {
    if (!run) return;
    const previousStatus = previousRunStatus.current;
    previousRunStatus.current = run.status;
    if (previousStatus && previousStatus !== run.status && !isRunInProgress) {
      showFlash(`Run zakończony ze statusem: ${run.status}.`);
      void loadEntries();
    }
  }, [run, isRunInProgress]);

  const handleDeepeval = async () => {
    setErrorMessage(null);
    setIsEvaluatingDeepeval(true);
    try {
      await evaluateRunDeepeval(runId);
      showFlash("GEval zakolejkowany. Odśwież za chwilę, aby zobaczyć wyniki.");
    } catch (error) {
      showFlash(`Nie udało się uruchomić GEval: ${errorText(error)}`, "danger");
    } finally {
      setIsEvaluatingDeepeval(false);
    }
  };

  const handleRefresh = () => {
    void loadRun();
    void loadEntries();
  };

  let runSummary = null;
  if (run) {
    runSummary = <RunSummary run={run} />;
  } else if (isLoading) {
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

  const entriesSection = isLoadingEntries ? (
    <p className="text-muted">Ładowanie wpisów...</p>
  ) : (
    entryCards
  );

  return (
    <PageShell>
      <section className="panel-shell grid min-w-0 gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
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
                <span className="mono-value">{run.summary_mode}</span>
              </>
            ) : (
              <span className="text-muted">ładowanie...</span>
            )}
          </h1>

          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleDeepeval()}
              disabled={!run || isRunInProgress || isEvaluatingDeepeval}
            >
              {isEvaluatingDeepeval ? "Liczenie..." : "Policz GEval"}
            </Button>
            <Button size="sm" onClick={handleRefresh} disabled={isLoading || isLoadingEntries}>
              Odśwież
            </Button>
            <LinkButton size="sm" href={run ? `/research/${run.evaluation_set_id}` : "/research"}>
              Wróć do setu
            </LinkButton>
          </div>
        </div>

        {/* Always mounted: a live region only announces content inserted after it exists. */}
        <div aria-live="polite">
          {isRunInProgress ? (
            <Alert tone="warning">Przebieg w toku — status odświeża się sam.</Alert>
          ) : null}
        </div>

        {errorMessage ? <Alert tone="danger">{errorMessage}</Alert> : null}

        {runSummary}

        {entriesSection}
      </section>
    </PageShell>
  );
}
