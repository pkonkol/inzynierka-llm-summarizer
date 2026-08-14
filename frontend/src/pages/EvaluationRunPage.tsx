import { useEffect, useState } from "react";

import { evaluateRunDeepeval, getEvaluationRun, getEvaluationRunEntries } from "../api/research";
import { type DeepevalDisplayItem, DeepevalItems } from "../components/DeepevalItems";
import { InfoRow } from "../components/InfoRow";
import { InputTextSection } from "../components/InputTextSection";
import { PreBlock } from "../components/PreBlock";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { PageShell, SectionHeading } from "../components/ui/PageShell";
import { Panel } from "../components/ui/Panel";
import type {
  EvaluationRunEntry,
  EvaluationRunMeta,
  SummaryStatisticalMetrics,
} from "../types/research";
import { navigateTo } from "../utils/researchRouting";

type EntryCollapsibleKey = "input" | "metrics";

const PAIRWISE_TIE_MARGIN = 0.05;

function pairwiseWinnerLabel(score: number): "golden" | "ai" | "tie" {
  if (score > 0.5 + PAIRWISE_TIE_MARGIN) return "ai";
  if (score < 0.5 - PAIRWISE_TIE_MARGIN) return "golden";
  return "tie";
}

function formatLabel(key: string): string {
  return key.replace(/_/g, " ");
}

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
    <div className="grid grid-cols-2 gap-3">
      <InfoRow label={label} value={golden} />
      <InfoRow label={label} value={ai} />
    </div>
  );
}

function ColumnsHeader() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <SectionHeading>Golden</SectionHeading>
      <SectionHeading>AI</SectionHeading>
    </div>
  );
}

function StatisticalMetricsColumns({ entry }: { entry: EvaluationRunEntry }) {
  const goldenSummary: Partial<SummaryStatisticalMetrics> = entry.golden_metrics?.summary ?? {};
  const aiSummary: Partial<SummaryStatisticalMetrics> = entry.ai_metrics?.summary ?? {};

  const allLabels = Array.from(
    new Set([...Object.keys(goldenSummary), ...Object.keys(aiSummary)]),
  ) as (keyof SummaryStatisticalMetrics)[];

  return (
    <div className="grid gap-2">
      {allLabels.length > 0 ? (
        <>
          <ColumnsHeader />
          {!entry.golden_metrics ? (
            <p className="m-0 text-xs italic text-muted">
              Golden metrics not computed for this entry.
            </p>
          ) : null}
          {allLabels.map((label) => (
            <MetricRow
              key={label}
              label={formatLabel(label)}
              golden={goldenSummary[label]}
              ai={aiSummary[label]}
            />
          ))}
        </>
      ) : null}

      {entry.ai_metrics ? (
        <div className="grid gap-2 border-t border-panel-border pt-3">
          <SectionHeading>AI key takeaways</SectionHeading>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <InfoRow label="Bullet count" value={entry.ai_metrics.key_takeaways.bullet_count} />
            <InfoRow label="Char count" value={entry.ai_metrics.key_takeaways.char_count} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DeepevalMetricsColumns({ entry }: { entry: EvaluationRunEntry }) {
  const goldenItems: DeepevalDisplayItem[] = entry.golden_metrics?.deepeval ?? [];
  const aiItems: DeepevalDisplayItem[] = entry.ai_metrics?.deepeval ?? [];

  if (goldenItems.length === 0 && aiItems.length === 0) return null;

  return (
    <div className="grid gap-2 border-t border-panel-border pt-3">
      <SectionHeading>Deepeval</SectionHeading>
      <div className="grid grid-cols-2 gap-3">
        <div>
          {goldenItems.length > 0 ? (
            <DeepevalItems items={goldenItems} />
          ) : (
            <p className="m-0 text-xs italic text-muted">—</p>
          )}
        </div>
        <div>
          {aiItems.length > 0 ? (
            <DeepevalItems items={aiItems} />
          ) : (
            <p className="m-0 text-xs italic text-muted">—</p>
          )}
        </div>
      </div>
    </div>
  );
}

function CrossMetricsSection({ entry }: { entry: EvaluationRunEntry }) {
  if (!entry.cross_metrics) {
    return <p className="m-0 p-3 text-sm text-muted">Not computed yet.</p>;
  }

  const { rouge1, rouge2, rougeL, meteor, deepeval } = entry.cross_metrics;

  return (
    <div className="grid gap-3 p-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <InfoRow label="rouge1" value={rouge1} />
        <InfoRow label="rouge2" value={rouge2} />
        <InfoRow label="rougeL" value={rougeL} />
        <InfoRow label="meteor" value={meteor} />
      </div>
      {deepeval.length > 0 ? (
        <div className="grid gap-2 border-t border-panel-border pt-3">
          {deepeval.map((item) => (
            <div
              key={item.name}
              className="grid gap-2 border border-panel-border bg-panel-solid px-3 py-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-sm font-semibold uppercase tracking-wider text-ink">
                  {item.name}
                </span>
                <span className="font-mono text-xs text-muted">
                  winner: {pairwiseWinnerLabel(item.score)} · score: {item.score}
                </span>
              </div>
              <p className="m-0 text-sm leading-normal text-muted">{item.reason}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EntryMetrics({ entry }: { entry: EvaluationRunEntry }) {
  return (
    <div className="grid gap-4 p-3">
      <div className="grid gap-2">
        <SectionHeading>Cross metrics</SectionHeading>
        <CrossMetricsSection entry={entry} />
      </div>
      <div className="border-t border-panel-border pt-3">
        <StatisticalMetricsColumns entry={entry} />
        <DeepevalMetricsColumns entry={entry} />
      </div>
    </div>
  );
}

function RunEntryCard({
  index,
  entry,
  evaluationSetId,
}: {
  index: number;
  entry: EvaluationRunEntry;
  evaluationSetId: string;
}) {
  const [openSection, setOpenSection] = useState<EntryCollapsibleKey | null>(null);

  const toggleSection = (key: EntryCollapsibleKey) => {
    setOpenSection((current) => (current === key ? null : key));
  };

  return (
    <Panel as="article" padding="sm" className="grid gap-3">
      <p className="m-0 text-sm text-ink">
        <span className="font-medium">{index + 1}</span>
        {" · "}
        <span>{entry.status}</span>
        {" · "}
        <span className="lowercase text-muted">
          {entry.title} · {entry.url}
        </span>
      </p>

      {entry.error ? <p className="m-0 text-md text-danger">{entry.error}</p> : null}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="grid content-start gap-1">
          <p className="m-0 text-sm uppercase tracking-wider text-label">Golden summary</p>
          <p className="m-0 whitespace-pre-wrap text-base text-ink">{entry.golden_summary}</p>
        </div>

        <div className="grid content-start gap-2">
          <p className="m-0 text-sm uppercase tracking-wider text-label">AI summary</p>
          <p className="m-0 whitespace-pre-wrap text-base text-ink">{entry.ai_summary ?? "—"}</p>

          {entry.ai_key_takeaways.length > 0 ? (
            <div className="grid gap-1">
              <p className="m-0 text-sm uppercase tracking-wider text-label">AI key takeaways</p>
              <ul className="m-0 list-disc pl-5 text-md text-ink">
                {entry.ai_key_takeaways.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
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
          <InputTextSection setId={evaluationSetId} entryId={entry.entry_id} />
        </div>
      ) : null}

      {openSection === "metrics" ? (
        <div className="border border-t-0 border-panel-border">
          <EntryMetrics entry={entry} />
        </div>
      ) : null}
    </Panel>
  );
}

type Props = {
  runId: string;
};

export function EvaluationRunPage({ runId }: Props) {
  const [run, setRun] = useState<EvaluationRunMeta | null>(null);
  const [entries, setEntries] = useState<EvaluationRunEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingEntries, setIsLoadingEntries] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [isEvaluatingDeepeval, setIsEvaluatingDeepeval] = useState(false);

  const loadRun = async () => {
    try {
      const data = await getEvaluationRun(runId);
      setRun(data);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(`Nie udało się pobrać runa: ${String(error)}`);
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
      setErrorMessage(`Nie udało się pobrać entries: ${String(error)}`);
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

  useEffect(() => {
    if (!flashMessage) return;
    const timeoutId = setTimeout(() => setFlashMessage(null), 4500);
    return () => clearTimeout(timeoutId);
  }, [flashMessage]);

  const handleBack = () => {
    navigateTo(run ? `/research/${run.evaluation_set_id}` : "/research");
  };

  const handleDeepeval = async () => {
    setErrorMessage(null);
    setFlashMessage(null);
    setIsEvaluatingDeepeval(true);
    try {
      await evaluateRunDeepeval(runId);
      setFlashMessage("GEval queued. Refresh za chwilę aby zobaczyć wyniki.");
    } catch (error) {
      setErrorMessage(`GEval failed: ${String(error)}`);
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
    runSummary = (
      <Panel padding="none" className="grid gap-2 px-3 py-2 text-md">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span>Status: {run.status}</span>
          <span>Created: {new Date(run.created_at).toLocaleString()}</span>
          <span>
            Finished: {run.finished_at ? new Date(run.finished_at).toLocaleString() : "—"}
          </span>
        </div>
        <div className="text-sm text-muted">
          <PreBlock>{JSON.stringify(run.aggregate_metrics, null, 2)}</PreBlock>
        </div>
      </Panel>
    );
  } else if (isLoading) {
    runSummary = <p className="helper-copy">Ładowanie szczegółów runa...</p>;
  }

  let entriesSection = null;
  if (isLoadingEntries) {
    entriesSection = <p className="helper-copy">Ładowanie entries...</p>;
  } else if (entries && run) {
    entriesSection = (
      <div className="grid gap-3">
        {entries.map((entry, index) => (
          <RunEntryCard
            key={entry.entry_id}
            index={index}
            entry={entry}
            evaluationSetId={run.evaluation_set_id}
          />
        ))}
      </div>
    );
  }

  return (
    <PageShell>
      <section className="panel-shell grid min-w-0 gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-2">
            <p className="section-kicker">Evaluation run</p>
            <h1 className="m-0 font-mono text-xl uppercase tracking-wider">
              {run ? `${run.model_provider} – ${run.model_name}` : "Loading..."}
            </h1>
            <p className="helper-copy">
              {run
                ? `${run.evaluation_set_name} · mode: ${run.summary_mode} · lang: ${run.language}`
                : "Ładowanie szczegółów runa..."}
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleDeepeval()}
              disabled={
                !run || run.status === "pending" || run.status === "running" || isEvaluatingDeepeval
              }
            >
              {isEvaluatingDeepeval ? "Running..." : "Run GEVal"}
            </Button>
            <Button size="sm" onClick={handleRefresh} disabled={isLoading || isLoadingEntries}>
              Refresh
            </Button>
            <Button size="sm" onClick={handleBack}>
              Back to set
            </Button>
          </div>
        </div>

        {flashMessage ? <Alert>{flashMessage}</Alert> : null}

        {errorMessage ? <Alert tone="danger">{errorMessage}</Alert> : null}

        {runSummary}

        {entriesSection}
      </section>
    </PageShell>
  );
}
