import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { SummaryResponse } from "../../types/api.generated";
import { downloadText } from "../../utils/download";
import { formatDuration } from "../../utils/format";
import type { PublicSummaryState } from "../../utils/usePublicSummary";
import { useFlash } from "../FlashProvider";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Panel";

function summaryBody(summary: SummaryResponse): string {
  if (summary.key_takeaways !== null)
    return summary.key_takeaways.map((item) => `- ${item}`).join("\n");
  return summary.summary ?? "";
}

function summaryPlainText(summary: SummaryResponse): string {
  return `${summary.title}\n\n${summaryBody(summary)}\n`;
}

function ResultBody({ state }: { state: PublicSummaryState }) {
  const showFlash = useFlash();

  switch (state.phase) {
    case "idle":
      return <p className="text-muted">Tu pojawi się podsumowanie.</p>;
    case "working":
      return <p className="text-muted">Przygotowuję podsumowanie...</p>;
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
        <article className="grid gap-4">
          <h2>{summary.title}</h2>
          <div className="grid gap-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{summaryBody(summary)}</ReactMarkdown>
          </div>
          <p className="text-sm text-muted">Wygenerowano w {formatDuration(durationMs)}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={copySummary}>
              Kopiuj
            </Button>
            <Button
              size="sm"
              onClick={() => downloadText("podsumowanie.txt", summaryPlainText(summary))}
            >
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
    <Panel padding="xl" className="min-h-64">
      <div aria-live="polite" className="grid content-start gap-4">
        <h3 className="label-caps text-sm text-muted">Podsumowanie</h3>
        <ResultBody state={state} />
      </div>
    </Panel>
  );
}
