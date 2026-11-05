import { type Choice, LabelChoice } from "./LabelChoice";

export type SentenceDraft = { faithful: Choice; carriesKeyfact: Choice };

type SentenceLabelRowProps = {
  summaryId: string;
  index: number;
  sentence: string;
  draft: SentenceDraft;
  onChange: (draft: SentenceDraft) => void;
};

/** One summary sentence with its "faithful?" and "carries a key fact?" questions, each answerable as unclear. */
export function SentenceLabelRow({
  summaryId,
  index,
  sentence,
  draft,
  onChange,
}: SentenceLabelRowProps) {
  return (
    <li className="grid gap-2 border-b border-hairline pb-3">
      <p>
        <span className="text-mute">[{index}]</span> {sentence}
      </p>
      <div className="flex flex-wrap gap-6">
        <LabelChoice
          name={`${summaryId}-faithful-${index}`}
          legend="wierne źródłu?"
          value={draft.faithful}
          allowUnclear
          onChange={(faithful) => onChange({ ...draft, faithful })}
        />
        <LabelChoice
          name={`${summaryId}-keyfact-${index}`}
          legend="niesie keyfact?"
          value={draft.carriesKeyfact}
          allowUnclear
          onChange={(carriesKeyfact) => onChange({ ...draft, carriesKeyfact })}
        />
      </div>
    </li>
  );
}
