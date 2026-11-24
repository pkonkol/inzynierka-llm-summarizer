import { useState } from "react";
import type {
  EvaluationRunEntryResponse,
  SummaryStatisticalMetrics,
} from "../../types/api.generated";
import { formatMetricLabel, formatScore } from "../../utils/format";
import { formatLengthTarget } from "../../utils/summarySpecLabels";
import { DeepevalItems } from "../DeepevalItems";
import { InfoList, InfoRow } from "../InfoRow";
import { InputTextSection } from "../InputTextSection";
import { SummaryVerdicts } from "../judges/SummaryVerdicts";
import { StatusLabel } from "../StatusLabel";
import { cn } from "../ui/cn";
import { DisclosureSections } from "../ui/DisclosureSections";
import { SectionHeading } from "../ui/PageShell";

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

function JudgeVerdictColumns({
  entry,
  judgeModel,
}: {
  entry: EvaluationRunEntryResponse;
  judgeModel: string;
}) {
  const byJudge = (judgement: { judge_model: string }) => judgement.judge_model === judgeModel;

  return (
    <div className="grid gap-2">
      <SectionHeading>Sędzia {judgeModel}</SectionHeading>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="grid min-w-0 content-start gap-2">
          <h4>Wzorzec</h4>
          <SummaryVerdicts
            judgement={entry.golden_judges.find(byJudge)}
            keyfacts={entry.keyfacts}
          />
        </div>
        <div className="grid min-w-0 content-start gap-2">
          <h4>AI</h4>
          <SummaryVerdicts
            judgement={entry.ai_metrics?.judges.find(byJudge)}
            keyfacts={entry.keyfacts}
          />
        </div>
      </div>
    </div>
  );
}

function CrossMetricsSection({
  entry,
  judgeModel,
}: {
  entry: EvaluationRunEntryResponse;
  judgeModel: string;
}) {
  if (!entry.cross_metrics) {
    return <p className="text-mute">Jeszcze nie policzone.</p>;
  }

  const { rouge1, rouge2, rougeL, meteor, pairwise } = entry.cross_metrics;
  const pairwiseItems = pairwise
    .filter((item) => item.judge_model === judgeModel)
    .map((item) => ({ ...item, statusLabel: pairwiseWinnerLabel(item.score) }));

  return (
    <div className="grid gap-3">
      <SectionHeading>Metryki statystyczne porównawcze</SectionHeading>
      <InfoList>
        <InfoRow label="rouge1" value={rouge1} />
        <InfoRow label="rouge2" value={rouge2} />
        <InfoRow label="rougeL" value={rougeL} />
        <InfoRow label="meteor" value={meteor === null ? "— (tylko EN)" : meteor} />
      </InfoList>
      {pairwiseItems.length > 0 ? (
        <div className="grid gap-2">
          <SectionHeading>Para AI vs wzorzec</SectionHeading>
          <DeepevalItems items={pairwiseItems} />
        </div>
      ) : null}
    </div>
  );
}

function EntryMetrics({
  entry,
  judgeModel,
}: {
  entry: EvaluationRunEntryResponse;
  judgeModel: string;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <CrossMetricsSection entry={entry} judgeModel={judgeModel} />
      </div>
      <div className="grid gap-4">
        <StatisticalMetricsColumns entry={entry} />
        <JudgeVerdictColumns entry={entry} judgeModel={judgeModel} />
      </div>
    </div>
  );
}

export function RunEntryCard({
  index,
  entry,
  evaluationSetId,
  judgeModel,
}: {
  index: number;
  entry: EvaluationRunEntryResponse;
  evaluationSetId: string;
  judgeModel: string;
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
                {entry.golden_summary ?? "—"}
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
              {
                key: "metrics",
                label: "Metryki",
                content: <EntryMetrics entry={entry} judgeModel={judgeModel} />,
              },
            ]}
          />
        </div>
      ) : null}
    </article>
  );
}
