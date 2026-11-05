import { LabelChoice } from "./LabelChoice";

type PairVerdictProps = {
  sourceId: string;
  firstSummaryId: string;
  secondSummaryId: string;
  betterSummaryId: string | null;
  onChoose: (summaryId: string) => void;
};

/** Which of two blind summaries of the same source is better, asked once both are labelled. */
export function PairVerdict({
  sourceId,
  firstSummaryId,
  secondSummaryId,
  betterSummaryId,
  onChoose,
}: PairVerdictProps) {
  return (
    <LabelChoice
      name={`${sourceId}-pair`}
      legend="czy A jest lepsze od B?"
      value={betterSummaryId === null ? undefined : betterSummaryId === firstSummaryId}
      allowUnclear={false}
      onChange={(isFirstBetter) => onChoose(isFirstBetter ? firstSummaryId : secondSummaryId)}
    />
  );
}
