import { useState } from "react";
import {
  getCalibrationLabels,
  getCalibrationSample,
  saveKeyfactsApproval,
  savePairVerdict,
  saveSummaryLabels,
} from "../api/calibration";
import { errorText } from "../api/client";
import { KeyfactChecklist, KeyfactEditor } from "../components/calibration/KeyfactChecklist";
import type { Choice } from "../components/calibration/LabelChoice";
import { LabelChoice } from "../components/calibration/LabelChoice";
import { PairVerdict } from "../components/calibration/PairVerdict";
import { type SentenceDraft, SentenceLabelRow } from "../components/calibration/SentenceLabelRow";
import { TprTnrLegend } from "../components/calibration/TprTnrLegend";
import { useFlash } from "../components/FlashProvider";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { cn } from "../components/ui/cn";
import { Select } from "../components/ui/Field";
import { PageSection, PageShell, SPLIT_COLUMNS, STICKY_COLUMN } from "../components/ui/PageShell";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useReloadableResource } from "../hooks/useReloadableResource";
import type {
  BlindPair,
  BlindSummary,
  CalibrationLabels,
  CalibrationSampleResponse,
  CalibrationSource,
  SummaryLabels,
} from "../types/api.generated";

const SUMMARY_NAMES = ["A", "B"];

function currentKeyfacts(source: CalibrationSource, labels: CalibrationLabels): string[] {
  return labels.keyfacts[source.source_id]?.keyfacts ?? source.keyfacts;
}

function sourceProgress(pair: BlindPair, labels: CalibrationLabels): string {
  const labelled = [pair.first_summary_id, pair.second_summary_id].filter(
    (id) => id in labels.summaries,
  ).length;
  const keyfactsDone = pair.source_id in labels.keyfacts;
  const pairDone = pair.source_id in labels.pairs;
  const isDone = keyfactsDone && labelled === 2 && pairDone;
  return `${isDone ? "[x]" : "[ ]"} keyfacty ${keyfactsDone ? "✓" : "—"} · streszczenia ${labelled}/2 · para ${pairDone ? "✓" : "—"}`;
}

type SummaryDraft = { sentences: SentenceDraft[]; keyfactsPresent: Choice[]; coherent: Choice };

function draftFrom(
  summary: BlindSummary,
  keyfactCount: number,
  saved: SummaryLabels | undefined,
): SummaryDraft {
  if (saved) {
    return {
      sentences: saved.sentences.map((label) => ({
        faithful: label.faithful,
        carriesKeyfact: label.carries_keyfact,
      })),
      keyfactsPresent: saved.keyfacts_present,
      coherent: saved.coherent,
    };
  }
  return {
    sentences: summary.sentences.map(() => ({ faithful: undefined, carriesKeyfact: undefined })),
    keyfactsPresent: Array.from({ length: keyfactCount }, () => undefined),
    coherent: undefined,
  };
}

// Only a fully answered draft can be saved: the API stores true, false or null (unclear), never "not yet".
function completeLabels(draft: SummaryDraft): SummaryLabels | null {
  const answered = (choice: Choice): choice is boolean | null => choice !== undefined;
  const sentencesDone = draft.sentences.every(
    (sentence) => answered(sentence.faithful) && answered(sentence.carriesKeyfact),
  );
  if (
    !sentencesDone ||
    !draft.keyfactsPresent.every(answered) ||
    typeof draft.coherent !== "boolean"
  ) {
    return null;
  }
  return {
    sentences: draft.sentences.map((sentence) => ({
      faithful: sentence.faithful as boolean | null,
      carries_keyfact: sentence.carriesKeyfact as boolean | null,
    })),
    keyfacts_present: draft.keyfactsPresent as (boolean | null)[],
    coherent: draft.coherent,
  };
}

type SummaryLabelerProps = {
  name: string;
  summary: BlindSummary;
  keyfacts: string[];
  saved: SummaryLabels | undefined;
  onSave: (labels: SummaryLabels) => void;
};

function SummaryLabeler({ name, summary, keyfacts, saved, onSave }: SummaryLabelerProps) {
  const [draft, setDraft] = useState(() => draftFrom(summary, keyfacts.length, saved));
  const labels = completeLabels(draft);
  const setSentence = (index: number, sentence: SentenceDraft) =>
    setDraft({
      ...draft,
      sentences: draft.sentences.map((old, at) => (at === index ? sentence : old)),
    });

  return (
    <PageSection
      title={`Streszczenie ${name}`}
      trailing={
        <span className="text-caption text-mute">{saved ? "[✓] zapisane" : "[ ] niezapisane"}</span>
      }
    >
      <ol className="grid gap-3">
        {summary.sentences.map((sentence, index) => (
          <SentenceLabelRow
            // biome-ignore lint/suspicious/noArrayIndexKey: sentences of a summary never reorder, and the judges address them by this index.
            key={`${summary.summary_id}-${index}`}
            summaryId={summary.summary_id}
            index={index}
            sentence={sentence}
            draft={draft.sentences[index]}
            onChange={(sentenceDraft) => setSentence(index, sentenceDraft)}
          />
        ))}
      </ol>
      <KeyfactChecklist
        summaryId={summary.summary_id}
        keyfacts={keyfacts}
        presence={draft.keyfactsPresent}
        onPresenceChange={(keyfactsPresent) => setDraft({ ...draft, keyfactsPresent })}
      />
      <LabelChoice
        name={`${summary.summary_id}-coherent`}
        legend="spójne jako całość?"
        value={draft.coherent}
        allowUnclear={false}
        onChange={(coherent) => setDraft({ ...draft, coherent })}
      />
      <div>
        <Button
          variant="primary"
          disabled={labels === null}
          onClick={() => labels && onSave(labels)}
        >
          Zapisz streszczenie {name}
        </Button>
      </div>
    </PageSection>
  );
}

type SourceLabelingProps = {
  source: CalibrationSource;
  pair: BlindPair;
  summaries: BlindSummary[];
  labels: CalibrationLabels;
  onLabelsChange: (labels: CalibrationLabels) => void;
};

function SourceLabeling({ source, pair, summaries, labels, onLabelsChange }: SourceLabelingProps) {
  const showFlash = useFlash();
  const keyfacts = currentKeyfacts(source, labels);
  const keyfactsApproved = source.source_id in labels.keyfacts;
  const bothLabelled = summaries.every((summary) => summary.summary_id in labels.summaries);

  const save = async (what: string, request: () => Promise<CalibrationLabels>) => {
    try {
      onLabelsChange(await request());
      showFlash(`Zapisano: ${what}.`);
    } catch (error) {
      showFlash(`Nie udało się zapisać (${what}): ${errorText(error)}`, "danger");
    }
  };

  return (
    <div className={cn("grid gap-8", SPLIT_COLUMNS)}>
      <div className={cn("grid gap-4", STICKY_COLUMN)}>
        <p className="text-caption text-mute">
          {source.source_id} · {source.language} · zbiór {source.split}
        </p>
        <p className="whitespace-pre-wrap">{source.input_text}</p>
      </div>
      <div className="grid min-w-0 content-start gap-8">
        {keyfactsApproved ? null : (
          <KeyfactEditor
            key={source.source_id}
            sourceId={source.source_id}
            keyfacts={keyfacts}
            onApprove={(approved) =>
              save("keyfacty", () => saveKeyfactsApproval(source.source_id, { keyfacts: approved }))
            }
          />
        )}
        {keyfactsApproved
          ? summaries.map((summary, index) => (
              <SummaryLabeler
                key={summary.summary_id}
                name={SUMMARY_NAMES[index]}
                summary={summary}
                keyfacts={keyfacts}
                saved={labels.summaries[summary.summary_id]}
                onSave={(summaryLabels) =>
                  save(`streszczenie ${SUMMARY_NAMES[index]}`, () =>
                    saveSummaryLabels(summary.summary_id, summaryLabels),
                  )
                }
              />
            ))
          : null}
        {bothLabelled ? (
          <PageSection title="Para">
            <PairVerdict
              sourceId={source.source_id}
              firstSummaryId={pair.first_summary_id}
              secondSummaryId={pair.second_summary_id}
              betterSummaryId={labels.pairs[source.source_id]?.better_summary_id ?? null}
              onChoose={(better) =>
                save("para", () => savePairVerdict(source.source_id, { better_summary_id: better }))
              }
            />
          </PageSection>
        ) : null}
      </div>
    </div>
  );
}

type LabelingWorkspaceProps = {
  sample: CalibrationSampleResponse;
  initialLabels: CalibrationLabels;
};

function LabelingWorkspace({ sample, initialLabels }: LabelingWorkspaceProps) {
  const [labels, setLabels] = useState(initialLabels);
  const [sourceId, setSourceId] = useState(sample.sources[0].source_id);
  const source = sample.sources.find((candidate) => candidate.source_id === sourceId);
  const pair = sample.pairs.find((candidate) => candidate.source_id === sourceId);
  if (!source || !pair) throw new Error(`calibration source ${sourceId} has no pair`);
  const summaries = [pair.first_summary_id, pair.second_summary_id].map((id) => {
    const summary = sample.summaries.find((candidate) => candidate.summary_id === id);
    if (!summary) throw new Error(`calibration summary ${id} is missing from the sample`);
    return summary;
  });

  return (
    <>
      <div className="grid gap-2">
        <label htmlFor="calibration-source" className="field-label">
          Źródło ({Object.keys(labels.summaries).length}/{sample.summaries.length} streszczeń
          oznaczonych)
        </label>
        <Select
          id="calibration-source"
          value={sourceId}
          onChange={(event) => setSourceId(event.target.value)}
        >
          {sample.pairs.map((candidate) => (
            <option key={candidate.source_id} value={candidate.source_id}>
              {candidate.source_id} · {sourceProgress(candidate, labels)}
            </option>
          ))}
        </Select>
      </div>
      <SourceLabeling
        key={source.source_id}
        source={source}
        pair={pair}
        summaries={summaries}
        labels={labels}
        onLabelsChange={setLabels}
      />
      <PageSection title="Legenda">
        <TprTnrLegend />
      </PageSection>
    </>
  );
}

/** Developer-only tab: the author labels the judge-calibration sample sentence by sentence, without knowing which summary is human. */
export function CalibrationLabelingPage() {
  useDocumentTitle("Kalibracja sędziów (dev)");
  const sample = useReloadableResource(
    getCalibrationSample,
    "sample",
    "Nie udało się pobrać próbki",
  );
  const labels = useReloadableResource(
    getCalibrationLabels,
    "labels",
    "Nie udało się pobrać etykiet",
  );
  const errorMessage = sample.errorMessage ?? labels.errorMessage;

  return (
    <PageShell>
      {errorMessage ? <Alert tone="danger">{errorMessage}</Alert> : null}
      {sample.data && labels.data ? (
        <LabelingWorkspace sample={sample.data} initialLabels={labels.data} />
      ) : (
        <p className="text-caption text-mute">Ładowanie…</p>
      )}
    </PageShell>
  );
}
