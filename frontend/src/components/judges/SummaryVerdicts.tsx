import type { SourceKeyfacts, SummaryJudgement } from "../../types/api.generated";
import { DeepevalItems } from "../DeepevalItems";
import { SectionHeading } from "../ui/PageShell";

/** What one judge said about one summary: every sentence, every key fact, coherence and SummarizationMetric. */
export function SummaryVerdicts({
  judgement,
  keyfacts,
}: {
  judgement: SummaryJudgement | undefined;
  keyfacts: SourceKeyfacts | null;
}) {
  if (!judgement) return <p className="text-mute">Nieocenione tym sędzią.</p>;
  if (judgement.error !== null) {
    return (
      <p className="wrap-anywhere text-danger-hover">
        Odpowiedź sędziego nieużywalna: {judgement.error}
      </p>
    );
  }

  const sentenceVerdicts = new Map(
    (judgement.fact_level?.faithfulness.sentences ?? []).map((verdict) => [
      verdict.sentence_index,
      verdict,
    ]),
  );
  const keyfactMatches = judgement.fact_level?.alignment.keyfacts ?? [];

  return (
    <div className="grid gap-4 text-caption">
      <div className="grid gap-1">
        <SectionHeading>Zdania</SectionHeading>
        <ol className="grid gap-1">
          {judgement.sentences.map((sentence, index) => {
            const verdict = sentenceVerdicts.get(index);
            return (
              <li key={sentence + String(index)}>
                <span className={verdict?.faithful === false ? "text-danger-hover" : undefined}>
                  [{index}] {verdict?.faithful === false ? "niewierne" : "wierne"}:
                </span>{" "}
                {sentence}
                {verdict?.faithful === false ? (
                  <span className="text-mute"> ({verdict.reason})</span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="grid gap-1">
        <SectionHeading>Keyfacty</SectionHeading>
        <ol className="grid gap-1">
          {keyfactMatches.map((match) => (
            <li key={match.keyfact_index}>
              <span className={match.present ? undefined : "text-mute"}>
                {match.present ? "obecny" : "brak"}
                {match.present ? ` (zdania ${match.sentence_indices.join(", ")})` : ""}:
              </span>{" "}
              {keyfacts?.keyfacts[match.keyfact_index] ?? `keyfact ${match.keyfact_index}`}
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-1">
        <SectionHeading>Spójność i SummarizationMetric</SectionHeading>
        <DeepevalItems
          items={[
            ...(judgement.coherence
              ? [
                  {
                    name: "spójność",
                    passed: judgement.coherence.judgement.coherent,
                    reason: judgement.coherence.judgement.reason,
                  },
                ]
              : []),
            ...(judgement.summarization_metric ? [judgement.summarization_metric] : []),
          ]}
        />
      </div>
    </div>
  );
}
