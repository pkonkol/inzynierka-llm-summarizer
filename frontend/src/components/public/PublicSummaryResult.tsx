import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PublicSummaryState } from "../../hooks/usePublicSummary";
import type { SummaryResponse } from "../../types/api.generated";
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

function ResultBody({ state }: { state: PublicSummaryState }) {
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
      const { summary, durationMs } = state;
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
export function PublicSummaryResult({ state }: { state: PublicSummaryState }) {
  return (
    <section className="flex min-h-80 flex-col border border-hairline lg:min-h-0">
      <div className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-hairline px-4">
        <h3>Podsumowanie</h3>
        <ResultState state={state} />
      </div>
      <div aria-live="polite" className="flex flex-1 flex-col overflow-auto p-4">
        <ResultBody state={state} />
      </div>
    </section>
  );
}
