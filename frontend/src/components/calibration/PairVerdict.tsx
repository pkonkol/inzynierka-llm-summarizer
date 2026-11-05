import type { ReactNode } from "react";

type PairVerdictProps = {
  firstSummaryId: string;
  secondSummaryId: string;
  betterSummaryId: string | null;
  onChoose: (summaryId: string) => void;
};

/** Which of two blind summaries of the same source is better. */
export function PairVerdict(_props: PairVerdictProps): ReactNode {
  throw new Error("not implemented");
}
