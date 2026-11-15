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
import { Panel } from "../components/ui/Panel";
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
  sourceText: string;
  keyfacts: string[];
  saved: SummaryLabels | undefined;
  onSave: (labels: SummaryLabels) => void;
};

function SummaryText({ sentences }: { sentences: string[] }) {
  return (
    <p className="max-w-prose leading-relaxed">
      {sentences.map((sentence, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: sentences of a summary never reorder, and the labels address them by this index.
        <span key={index}>
          <span className="text-mute">[{index}]</span> {sentence}{" "}
        </span>
      ))}
    </p>
  );
}

function SourceText({ text }: { text: string }) {
  return <p className="max-w-prose whitespace-pre-wrap leading-relaxed">{text}</p>;
}

// Reference text on the left stays in view while the choices on the right scroll past it.
function LabelingBlock({
  title,
  reference,
  children,
}: {
  title: string;
  reference: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <PageSection title={title}>
      <div className={cn("grid gap-6", SPLIT_COLUMNS)}>
        <Panel className={cn("bg-surface-soft", STICKY_COLUMN)}>{reference}</Panel>
        <div className="min-w-0">{children}</div>
      </div>
    </PageSection>
  );
}

function SummaryLabeler({
  name,
  summary,
  sourceText,
  keyfacts,
  saved,
  onSave,
}: SummaryLabelerProps) {
  const [draft, setDraft] = useState(() => draftFrom(summary, keyfacts.length, saved));
  const labels = completeLabels(draft);
  const presentKeyfacts = keyfacts
    .map((keyfact, index) => ({ keyfact, index }))
    .filter(({ index }) => draft.keyfactsPresent[index] === true);
  const setSentence = (index: number, sentence: SentenceDraft) =>
    setDraft({
      ...draft,
      sentences: draft.sentences.map((old, at) => (at === index ? sentence : old)),
    });

  return (
    <div className="grid gap-10">
      <p className="text-caption text-mute">
        Streszczenie {name} · {saved ? "[✓] zapisane" : "[ ] niezapisane"}
      </p>
      <LabelingBlock
        title={`1. Które keyfacty są w streszczeniu ${name}?`}
        reference={<SummaryText sentences={summary.sentences} />}
      >
        <KeyfactChecklist
          summaryId={summary.summary_id}
          keyfacts={keyfacts}
          presence={draft.keyfactsPresent}
          onPresenceChange={(keyfactsPresent) => setDraft({ ...draft, keyfactsPresent })}
        />
      </LabelingBlock>
      <LabelingBlock
        title="2. Zdania: wierne źródłu i czy niosą keyfact"
        reference={
          <div className="grid gap-4">
            <div className="grid gap-1">
              <p className="text-caption text-mute">Keyfacty obecne (z kroku 1)</p>
              {presentKeyfacts.length === 0 ? (
                <p className="text-caption text-mute">żadnego</p>
              ) : (
                <ul className="grid gap-1">
                  {presentKeyfacts.map(({ keyfact, index }) => (
                    <li key={keyfact}>
                      <span className="text-mute">K{index}</span> {keyfact}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="grid gap-1 border-t border-hairline pt-4">
              <p className="text-caption text-mute">Tekst źródła</p>
              <SourceText text={sourceText} />
            </div>
          </div>
        }
      >
        <ol className="grid">
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
      </LabelingBlock>
      <PageSection title="3. Całość">
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
    </div>
  );
}

type Step = "source" | "A" | "B" | "pair";

function firstOpenStep(
  keyfactsApproved: boolean,
  summaries: BlindSummary[],
  labels: CalibrationLabels,
): Step {
  if (!keyfactsApproved) return "source";
  const unlabelled = summaries.findIndex((summary) => !(summary.summary_id in labels.summaries));
  return unlabelled === -1 ? "pair" : (SUMMARY_NAMES[unlabelled] as Step);
}

type StepTabsProps = {
  sourceId: string;
  step: Step;
  steps: { key: Step; label: string; isEnabled: boolean }[];
  onSelect: (step: Step) => void;
};

function StepTabs({ sourceId, step, steps, onSelect }: StepTabsProps) {
  return (
    <fieldset className="flex flex-wrap gap-x-4 border-b border-hairline-strong">
      <legend className="sr-only">Krok etykietowania</legend>
      {steps.map((option) => {
        const isActive = option.key === step;
        return (
          <label
            key={option.key}
            className="flex cursor-pointer has-disabled:cursor-not-allowed has-disabled:opacity-50"
          >
            <input
              type="radio"
              name={`${sourceId}-step`}
              checked={isActive}
              disabled={!option.isEnabled}
              onChange={() => onSelect(option.key)}
              className="peer sr-only"
            />
            <span
              className={cn(
                "flex min-h-11 items-center gap-2 border-b-2 px-2 py-2 text-button font-medium peer-focus-visible:outline-2 peer-focus-visible:outline-ink",
                isActive ? "border-ash text-ink" : "border-transparent text-mute",
              )}
            >
              <span aria-hidden="true" className="whitespace-pre">
                {isActive ? "[x]" : "[ ]"}
              </span>
              {option.label}
            </span>
          </label>
        );
      })}
    </fieldset>
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
  const [step, setStep] = useState<Step>(() => firstOpenStep(keyfactsApproved, summaries, labels));

  const save = async (what: string, request: () => Promise<CalibrationLabels>) => {
    try {
      const saved = await request();
      onLabelsChange(saved);
      showFlash(`Zapisano: ${what}.`);
      setStep(firstOpenStep(source.source_id in saved.keyfacts, summaries, saved));
    } catch (error) {
      showFlash(`Nie udało się zapisać (${what}): ${errorText(error)}`, "danger");
    }
  };

  const steps = [
    { key: "source" as const, label: "Źródło i keyfacty", isEnabled: true },
    ...summaries.map((summary, index) => ({
      key: SUMMARY_NAMES[index] as Step,
      label: `Streszczenie ${SUMMARY_NAMES[index]}${summary.summary_id in labels.summaries ? " ✓" : ""}`,
      isEnabled: keyfactsApproved,
    })),
    {
      key: "pair" as const,
      label: `Która lepsza${source.source_id in labels.pairs ? " ✓" : ""}`,
      isEnabled: bothLabelled,
    },
  ];
  const summaryIndex = SUMMARY_NAMES.indexOf(step);

  return (
    <div className="grid gap-8">
      <StepTabs sourceId={source.source_id} step={step} steps={steps} onSelect={setStep} />
      {step === "source" ? (
        <LabelingBlock
          title={keyfactsApproved ? "Keyfacty (zatwierdzone)" : "Przejrzyj keyfacty i zatwierdź"}
          reference={
            <div className="grid gap-2">
              <p className="text-caption text-mute">
                {source.source_id} · {source.language} · zbiór {source.split}
              </p>
              <SourceText text={source.input_text} />
            </div>
          }
        >
          {keyfactsApproved ? (
            <ol className="grid">
              {keyfacts.map((keyfact, index) => (
                <li key={keyfact} className="px-3 py-3 leading-relaxed odd:bg-surface-soft">
                  <span className="text-mute">K{index}</span> {keyfact}
                </li>
              ))}
            </ol>
          ) : (
            <KeyfactEditor
              key={source.source_id}
              sourceId={source.source_id}
              keyfacts={keyfacts}
              onApprove={(approved) =>
                save("keyfacty", () =>
                  saveKeyfactsApproval(source.source_id, { keyfacts: approved }),
                )
              }
            />
          )}
        </LabelingBlock>
      ) : null}
      {summaryIndex !== -1 ? (
        <SummaryLabeler
          key={summaries[summaryIndex].summary_id}
          name={SUMMARY_NAMES[summaryIndex]}
          summary={summaries[summaryIndex]}
          sourceText={source.input_text}
          keyfacts={keyfacts}
          saved={labels.summaries[summaries[summaryIndex].summary_id]}
          onSave={(summaryLabels) =>
            save(`streszczenie ${SUMMARY_NAMES[summaryIndex]}`, () =>
              saveSummaryLabels(summaries[summaryIndex].summary_id, summaryLabels),
            )
          }
        />
      ) : null}
      {step === "pair" ? (
        <PageSection title="Które streszczenie jest lepsze?">
          <div className="grid gap-6 lg:grid-cols-2">
            {summaries.map((summary, index) => (
              <Panel key={summary.summary_id} className="grid gap-2 bg-surface-soft">
                <p className="text-caption text-mute">Streszczenie {SUMMARY_NAMES[index]}</p>
                <SummaryText sentences={summary.sentences} />
              </Panel>
            ))}
          </div>
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
