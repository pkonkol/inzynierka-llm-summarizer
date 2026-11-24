import { type ReactNode, useMemo, useState } from "react";
import { getEvaluationRun, getEvaluationRunEntries, runJudges } from "../api/research";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { useFlash } from "../components/FlashProvider";
import { InfoList, InfoRow, InfoRowContent } from "../components/InfoRow";
import { RunJudgeAggregate } from "../components/judges/RunJudgeAggregate";
import { EVALUATION_TRAIL } from "../components/NavDock";
import { RunEntryCard } from "../components/runs/RunEntryCard";
import { StatusLabel } from "../components/StatusLabel";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { FieldLabel, Select } from "../components/ui/Field";
import { PageSection, PageShell, SectionHeading } from "../components/ui/PageShell";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useListPolling } from "../hooks/useListPolling";
import { useReloadableResource } from "../hooks/useReloadableResource";
import { useWorkFinished } from "../hooks/useWorkFinished";
import type { EvaluationRunResponse } from "../types/api.generated";
import { formatDateMinute } from "../utils/format";
import { evaluationSetPath } from "../utils/routing";
import {
  FUNCTION_LABELS,
  LENGTH_POLICY_LABELS,
  OUTPUT_FORMAT_LABELS,
  STANCE_LABELS,
} from "../utils/summarySpecLabels";

interface EntryProgress {
  completedEntryCount: number;
  failedEntryCount: number;
}

function RunSummary({
  run,
  progress,
  judgeControls,
}: {
  run: EvaluationRunResponse;
  progress: EntryProgress;
  judgeControls: ReactNode;
}) {
  const { error, judges: judgePass } = run.aggregate_metrics;

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

      <div className="grid gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <SectionHeading>Sędziowie</SectionHeading>
          {judgeControls}
        </div>
        <InfoList>
          {judgePass ? (
            <>
              <InfoRowContent label="status">
                <StatusLabel status={judgePass.status} />
              </InfoRowContent>
              <InfoRow label="sędzia" value={judgePass.judge_model} />
              <InfoRow label="zaktualizowanych" value={judgePass.updated_entries} />
              <InfoRow label="pominiętych" value={judgePass.skipped_entries} />
              <InfoRow label="rozpoczęto" value={formatDateMinute(judgePass.started_at)} />
              <InfoRow label="zakończono" value={formatDateMinute(judgePass.finished_at)} />
              <InfoRow label="już ocenionych" value={judgePass.already_scored_entries} />
            </>
          ) : (
            // StatusLabel carries the four job statuses shared with jobs, runs and entries;
            // "not started" is a fifth state that only this pass has.
            <InfoRowContent label="status">
              <span className="text-mute">nierozpoczęte</span>
            </InfoRowContent>
          )}
        </InfoList>
        {judgePass?.error ? (
          <p className="wrap-anywhere text-danger-hover">{judgePass.error}</p>
        ) : null}
      </div>

      {error ? <p className="wrap-anywhere text-danger-hover">{error}</p> : null}
    </div>
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
  // The judge pass is queued separately and keeps running after the run itself has finished.
  const judgePassStatus = run?.aggregate_metrics.judges?.status ?? null;
  const isJudgePassRunning = judgePassStatus === "pending" || judgePassStatus === "running";
  const knownJudges = Object.keys(run?.judge_calibration ?? {});
  const [chosenJudge, setChosenJudge] = useState<string | null>(null);
  const judgeModel = chosenJudge ?? knownJudges[0] ?? "";

  useDocumentTitle(
    run ? `${run.model_provider}:${run.model_name} · ${run.evaluation_set_name}` : null,
  );

  useListPolling(runResource.reload, isRunInProgress || isJudgePassRunning);
  useListPolling(entriesResource.reload, true, isRunInProgress || isJudgePassRunning);

  useWorkFinished(run?.status ?? null, isRunInProgress, (status) => {
    showFlash(`Run zakończony ze statusem: ${status}.`);
    void entriesResource.reload();
  });

  // The judges write their verdicts into the entries, which the run document does not carry.
  useWorkFinished(judgePassStatus, isJudgePassRunning, (status) => {
    showFlash(`Ocena sędzią zakończona ze statusem: ${status}.`);
    void entriesResource.reload();
  });

  const startJudges = useAsyncAction(() => runJudges(runId, judgeModel), {
    errorPrefix: "Nie udało się uruchomić sędziów",
    onSuccess: () => runResource.reload(),
  });
  const judgeAggregate = run?.judge_aggregates.find(
    (aggregate) => aggregate.judge_model === judgeModel,
  );

  let runSummary = null;
  if (run) {
    runSummary = (
      <RunSummary
        run={run}
        progress={entryProgress}
        judgeControls={
          <div className="flex flex-wrap items-end gap-3">
            <FieldLabel htmlFor="judge-model">
              sędzia
              <Select
                id="judge-model"
                value={judgeModel}
                onChange={(event) => setChosenJudge(event.target.value)}
              >
                {knownJudges.map((judge) => (
                  <option key={judge} value={judge}>
                    {judge}
                  </option>
                ))}
              </Select>
            </FieldLabel>
            <Button
              variant="primary"
              onClick={() => void startJudges.run()}
              disabled={isRunInProgress || isJudgePassRunning || startJudges.isPending}
            >
              {startJudges.isPending ? "Ocenianie..." : "Oceń sędzią"}
            </Button>
          </div>
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
            judgeModel={judgeModel}
          />
        ))}
      </div>
    );
  }, [entries, evaluationSetId, judgeModel]);

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

        {judgeAggregate ? (
          <PageSection title={`Wyniki sędziego ${judgeModel}`}>
            <RunJudgeAggregate
              aggregate={judgeAggregate}
              calibration={run?.judge_calibration[judgeModel]}
            />
          </PageSection>
        ) : null}

        <PageSection title="Wpisy">{entriesSection}</PageSection>
      </div>
    </PageShell>
  );
}
