import { useState } from "react";

import { Button } from "../ui/Button";
import { Textarea } from "../ui/Field";
import { type Choice, LabelChoice } from "./LabelChoice";

type KeyfactEditorProps = {
  sourceId: string;
  keyfacts: string[];
  onApprove: (keyfacts: string[]) => void;
};

/** One key fact per line; approving fixes the list every summary of the source is labelled against. */
export function KeyfactEditor({ sourceId, keyfacts, onApprove }: KeyfactEditorProps) {
  const [text, setText] = useState(keyfacts.join("\n"));
  const edited = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const textareaId = `keyfacts-${sourceId}`;

  return (
    <div className="grid gap-3">
      <label htmlFor={textareaId} className="field-label">
        Keyfacty źródła, jeden w linii ({edited.length}). Popraw i zatwierdź przed etykietowaniem
        streszczeń.
      </label>
      <Textarea
        id={textareaId}
        rows={12}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div>
        <Button variant="primary" disabled={edited.length === 0} onClick={() => onApprove(edited)}>
          Zatwierdź keyfacty
        </Button>
      </div>
    </div>
  );
}

type KeyfactChecklistProps = {
  summaryId: string;
  keyfacts: string[];
  presence: Choice[];
  onPresenceChange: (presence: Choice[]) => void;
};

/** Approved key facts of the source, each ticked as present, missing or unclear in one summary. */
export function KeyfactChecklist({
  summaryId,
  keyfacts,
  presence,
  onPresenceChange,
}: KeyfactChecklistProps) {
  return (
    <ol className="grid">
      {keyfacts.map((keyfact, index) => (
        <li
          key={keyfact}
          className="grid gap-2 px-3 py-3 odd:bg-surface-soft md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-6"
        >
          <p className="leading-relaxed">
            <span className="text-mute">K{index}</span> {keyfact}
          </p>
          <LabelChoice
            name={`${summaryId}-present-${index}`}
            legend="jest w streszczeniu?"
            value={presence[index]}
            allowUnclear
            onChange={(value) =>
              onPresenceChange(presence.map((old, at) => (at === index ? value : old)))
            }
          />
        </li>
      ))}
    </ol>
  );
}
