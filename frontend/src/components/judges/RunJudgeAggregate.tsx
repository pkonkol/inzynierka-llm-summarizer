import type {
  JudgeCalibration,
  JudgeScoreSummary,
  RunJudgeAggregate as RunJudgeAggregateData,
  TprTnr,
} from "../../types/api.generated";
import { TprTnrLegend } from "../calibration/TprTnrLegend";
import { Table, Td, Tr } from "../ui/Table";

type ScoreKey = Exclude<keyof JudgeScoreSummary, "judged" | "unusable" | "compared">;

const SCORE_ROWS: { key: ScoreKey; label: string; calibration?: keyof JudgeCalibration }[] = [
  { key: "faithfulness_mean", label: "wierność (zdania)", calibration: "faithfulness" },
  { key: "completeness_mean", label: "pokrycie (keyfacty)", calibration: "keyfact_present" },
  { key: "conciseness_mean", label: "zwięzłość", calibration: "sentence_carries_keyfact" },
  { key: "repetition_share", label: "z powtórzeniem" },
  { key: "coherent_share", label: "spójne", calibration: "coherence" },
  { key: "summarization_metric_mean", label: "SummarizationMetric" },
];

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)} %`;
}

function rates(rate: TprTnr | undefined): string {
  return rate ? `${percent(rate.tpr)} / ${percent(rate.tnr)}` : "—";
}

/** AI vs golden for one judge, with the judge's TPR/TNR from calibration next to each criterion. */
export function RunJudgeAggregate({
  aggregate,
  calibration,
}: {
  aggregate: RunJudgeAggregateData;
  calibration: JudgeCalibration | undefined;
}) {
  const { ai, golden } = aggregate;

  return (
    <div className="grid gap-4">
      <Table
        headers={["kryterium", "wzorzec", "AI", "TPR / TNR sędziego"]}
        alignRight={["wzorzec", "AI"]}
      >
        {SCORE_ROWS.map((row) => (
          <Tr key={row.key}>
            <Td>{row.label}</Td>
            <Td className="text-right">{percent(golden[row.key])}</Td>
            <Td className="text-right">{percent(ai[row.key])}</Td>
            <Td className="text-right">
              {row.calibration ? rates(calibration?.[row.calibration]) : "—"}
            </Td>
          </Tr>
        ))}
        <Tr>
          <Td>ocenionych (nieużywalnych)</Td>
          <Td className="text-right">{`${golden.judged} (${golden.unusable})`}</Td>
          <Td className="text-right">{`${ai.judged} (${ai.unusable})`}</Td>
          <Td className="text-right">—</Td>
        </Tr>
        <Tr>
          <Td>porównanych (podstawa średnich)</Td>
          <Td className="text-right">{golden.compared}</Td>
          <Td className="text-right">{ai.compared}</Td>
          <Td className="text-right">—</Td>
        </Tr>
      </Table>
      <p className="text-caption">
        Para AI vs wzorzec ({aggregate.pairwise_judged} ocenionych): AI lepsze{" "}
        {aggregate.pairwise_ai_wins}, wzorzec lepszy {aggregate.pairwise_golden_wins}, remis{" "}
        {aggregate.pairwise_ties}.
      </p>
      <TprTnrLegend />
    </div>
  );
}
