import type { ReactNode } from "react";
import type { SentenceLabel } from "../../types/api.generated";

type SentenceLabelRowProps = {
  sentence: string;
  label: SentenceLabel;
  onChange: (label: SentenceLabel) => void;
};

/** One summary sentence with its "faithful?", "carries a key fact?" and "unclear" toggles. */
export function SentenceLabelRow(_props: SentenceLabelRowProps): ReactNode {
  throw new Error("not implemented");
}
