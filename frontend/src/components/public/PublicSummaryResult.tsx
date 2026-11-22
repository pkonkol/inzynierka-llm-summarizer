import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { FactCheckView, PublicSummaryState } from "../../hooks/usePublicSummary";
import type {
  AssessedSource,
  ClaimReview,
  ContextExpansionResult,
  RelatedSource,
  SummaryResponse,
} from "../../types/api.generated";
import type { JobStatus } from "../../types/local";
import { downloadText } from "../../utils/download";
import { formatDuration } from "../../utils/format";
import { useFlash } from "../FlashProvider";
import { StatusLabel } from "../StatusLabel";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";

function summaryPlainText(summary: SummaryResponse): string {
  return `${summary.title}\n\n${summary.summary}\n`;
}

const PHASE_STATUS: Record<PublicSummaryState["phase"], JobStatus | null> = {
  idle: null,
  working: "running",
  done: "completed",
  error: "failed",
};

const CHANNEL_LABEL: Record<RelatedSource["channel"], string> = {
  web: "sieć",
  discussions: "Hacker News",
  science: "publikacje",
  factcheck_google: "Google Fact Check",
  factcheck_web: "serwis fact-checkingowy",
};

const STANCE_GROUPS: { stance: AssessedSource["stance"]; heading: string }[] = [
  { stance: "supports", heading: "Potwierdzają" },
  { stance: "contradicts", heading: "Podważają" },
  { stance: "context", heading: "Kontekst" },
];

function ReviewNote({ review }: { review: ClaimReview }) {
  const reviewedOn =
    review.reviewed_at === null
      ? ""
      : ` (${new Date(review.reviewed_at).toLocaleDateString("pl-PL")})`;
  return (
    <>
      {" "}
      <span className="text-mute">
        · {review.publisher}: {review.verdict}
        {reviewedOn}
      </span>
      <span className="block text-mute">Sprawdzane twierdzenie: {review.claim}</span>
    </>
  );
}

function SourceLink({ source, number }: { source: RelatedSource; number: number }) {
  return (
    <>
      [{number}]{" "}
      <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline">
        {source.title ?? source.url}
      </a>{" "}
      <span className="text-mute">· {CHANNEL_LABEL[source.channel]}</span>
      {source.review === null ? null : <ReviewNote review={source.review} />}
    </>
  );
}

function SourceList({ sources }: { sources: RelatedSource[] }) {
  return (
    <ol className="grid gap-1">
      {sources.map((source, index) => (
        <li key={source.url}>
          <SourceLink source={source} number={index + 1} />
        </li>
      ))}
    </ol>
  );
}

// Grouped by stance, each source keeps the [n] the assessment text cites it by.
function SourcesByStance({ sources }: { sources: AssessedSource[] }) {
  const numbered = sources.map((source, index) => ({ source, number: index + 1 }));
  return (
    <div className="grid gap-2 text-caption">
      {STANCE_GROUPS.map(({ stance, heading }) => {
        const inGroup = numbered.filter(({ source }) => source.stance === stance);
        if (inGroup.length === 0) return null;
        return (
          <div key={stance} className="grid gap-1">
            <h4 className="font-medium">{heading}</h4>
            <ul className="grid gap-1">
              {inGroup.map(({ source, number }) => (
                <li key={source.url}>
                  <SourceLink source={source} number={number} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function RelatedSources({ contextExpansion }: { contextExpansion: ContextExpansionResult }) {
  const failedChannels = contextExpansion.channels.filter((channel) => channel.error !== null);
  return (
    <div className="grid gap-2 border-t border-hairline pt-3 text-caption">
      <h3 className="font-medium">Źródła kontekstu</h3>
      {contextExpansion.selected.length === 0 ? (
        <p className="text-mute">Nie znaleziono pasujących źródeł.</p>
      ) : (
        <SourceList sources={contextExpansion.selected} />
      )}
      {failedChannels.length > 0 ? (
        <p className="text-mute">
          Bez wyników z:{" "}
          {failedChannels.map((channel) => CHANNEL_LABEL[channel.channel]).join(", ")} (błąd
          wyszukiwarki).
        </p>
      ) : null}
    </div>
  );
}

type FactCheckProps = { factCheck: FactCheckView; onCheckFacts: () => void };

function FactCheckBody({ factCheck, onCheckFacts }: FactCheckProps) {
  switch (factCheck.status) {
    case "idle":
      return (
        <div>
          <Button onClick={onCheckFacts}>Sprawdź fakty</Button>
        </div>
      );
    case "working":
      return (
        <div className="grid gap-2">
          <p className="text-caption text-mute">Sprawdzam fakty w innych źródłach...</p>
          <progress aria-label="Sprawdzanie faktów" className="w-full" />
        </div>
      );
    case "failed":
      return (
        <div className="grid gap-2">
          <Alert tone="danger">{factCheck.message}</Alert>
          <div>
            <Button onClick={onCheckFacts}>Spróbuj ponownie</Button>
          </div>
        </div>
      );
    case "completed":
      return (
        <>
          <div className="markdown max-w-measure font-reading text-reading">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{factCheck.text}</ReactMarkdown>
          </div>
          {factCheck.sources.length > 0 ? <SourcesByStance sources={factCheck.sources} /> : null}
        </>
      );
  }
}

function FactCheckSection({ factCheck, onCheckFacts }: FactCheckProps) {
  return (
    <section className="grid gap-2 border-t border-hairline pt-3">
      <h3 className="font-medium">Weryfikacja faktów</h3>
      <FactCheckBody factCheck={factCheck} onCheckFacts={onCheckFacts} />
    </section>
  );
}

function ResultState({ state }: { state: PublicSummaryState }) {
  const status = PHASE_STATUS[state.phase];
  if (status === null) return null;
  return (
    <span className="text-caption">
      <StatusLabel status={status} />
      {state.phase === "done" ? (
        <span className="text-mute"> · {formatDuration(state.durationMs)}</span>
      ) : null}
    </span>
  );
}

type ResultProps = { state: PublicSummaryState; onCheckFacts: () => void };

function ResultBody({ state, onCheckFacts }: ResultProps) {
  const showFlash = useFlash();

  switch (state.phase) {
    case "idle":
      return (
        <p className="flex flex-1 items-center justify-center text-caption text-mute">
          Tu pojawi się podsumowanie.
        </p>
      );
    case "working":
      return (
        <div aria-busy="true" className="grid gap-3">
          <p className="text-caption text-mute">Przygotowuję podsumowanie...</p>
          <progress aria-label="Przygotowywanie podsumowania" className="w-full" />
          <div aria-hidden="true" className="grid gap-2">
            <span className="block h-5 w-2/3 rounded-sm bg-surface-card" />
            <span className="block h-4 w-full rounded-sm bg-surface-soft" />
            <span className="block h-4 w-11/12 rounded-sm bg-surface-soft" />
            <span className="block h-4 w-4/5 rounded-sm bg-surface-soft" />
          </div>
        </div>
      );
    case "error":
      return <Alert tone="danger">{state.message}</Alert>;
    case "done": {
      const { summary, durationMs, contextExpansion, factCheck } = state;
      const copySummary = () => {
        navigator.clipboard
          .writeText(summaryPlainText(summary))
          .then(() => showFlash("Skopiowano podsumowanie do schowka"))
          .catch(() => showFlash("Nie udało się skopiować do schowka", "danger"));
      };
      return (
        <article className="flex flex-1 flex-col gap-3">
          <h2 className="text-subtitle">{summary.title}</h2>
          <div className="markdown max-w-measure flex-1 font-reading text-reading">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary.summary}</ReactMarkdown>
          </div>
          <FactCheckSection factCheck={factCheck} onCheckFacts={onCheckFacts} />
          {contextExpansion !== null && contextExpansion.mode !== "none" ? (
            <RelatedSources contextExpansion={contextExpansion} />
          ) : null}
          <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
            <p className="flex-1 text-caption text-mute">
              Wygenerowano w {formatDuration(durationMs)}
            </p>
            <Button onClick={copySummary}>Kopiuj</Button>
            <Button onClick={() => downloadText("podsumowanie.txt", summaryPlainText(summary))}>
              Pobierz .txt
            </Button>
          </div>
        </article>
      );
    }
  }
}

// The live region is mounted from the first render: it announces only what is inserted after
// it exists, so rendering it together with its first message would announce nothing.
export function PublicSummaryResult({ state, onCheckFacts }: ResultProps) {
  return (
    <section className="flex min-h-0 flex-col border border-hairline">
      <div className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-hairline px-4">
        <h3>Podsumowanie</h3>
        <ResultState state={state} />
      </div>
      <div aria-live="polite" className="flex flex-1 flex-col overflow-auto p-4">
        <ResultBody state={state} onCheckFacts={onCheckFacts} />
      </div>
    </section>
  );
}
