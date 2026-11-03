import { getEvaluationRun, getEvaluationRunEntries } from "../api/research";
import { Alert } from "../components/ui/Alert";
import { PageSection, PageShell } from "../components/ui/PageShell";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useReloadableResource } from "../hooks/useReloadableResource";
import type { ContextExpansionResult } from "../types/api.generated";
import { evaluationRunPath } from "../utils/routing";

type ContextExpansionDevPageProps = {
  runId: string;
};

function ExpansionDetails({ expansion }: { expansion: ContextExpansionResult }) {
  return (
    <div className="grid gap-3 text-caption">
      <p className="text-mute">
        {expansion.candidate_count} kandydatów po deduplikacji · {expansion.duration_ms} ms ·{" "}
        {expansion.usage.total_tokens} tokenów (zapytania i wybór)
      </p>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th>kanał</th>
            <th>zapytania</th>
            <th>wyniki</th>
            <th>ms</th>
            <th>USD</th>
            <th>błąd</th>
          </tr>
        </thead>
        <tbody>
          {expansion.channels.map((channel) => (
            <tr key={channel.channel} className="align-top">
              <td>{channel.channel}</td>
              <td>{channel.queries.join(" | ")}</td>
              <td>{channel.result_count}</td>
              <td>{channel.duration_ms}</td>
              <td>{channel.cost_usd ?? "—"}</td>
              <td>{channel.error ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ol className="grid gap-2">
        {expansion.selected.map((source, index) => (
          <li key={source.url}>
            [{index + 1}] {source.channel} ·{" "}
            <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline">
              {source.title ?? source.url}
            </a>
            <span className="block text-mute">{source.selection_reason}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Hidden developer tab: entries of one run with the selected related sources and the outcome of each search channel. */
export function ContextExpansionDevPage({ runId }: ContextExpansionDevPageProps) {
  useDocumentTitle("Kontekst z sieci (dev)");
  const run = useReloadableResource(
    () => getEvaluationRun(runId),
    runId,
    "Nie udało się pobrać runa",
  );
  const entries = useReloadableResource(
    () => getEvaluationRunEntries(runId),
    runId,
    "Nie udało się pobrać entries",
  );
  const errorMessage = run.errorMessage ?? entries.errorMessage;

  return (
    <PageShell>
      <p className="text-caption text-mute">
        Przebieg <a href={evaluationRunPath(runId)}>{runId}</a> · tryb{" "}
        {run.data?.context_expansion_mode ?? "…"} · {run.data?.status ?? "…"}
      </p>
      {errorMessage ? <Alert tone="danger">{errorMessage}</Alert> : null}
      {(entries.data?.entries ?? []).map((entry) => (
        <PageSection key={entry.entry_id} title={entry.title}>
          <p className="text-caption">
            <a href={entry.url} target="_blank" rel="noopener noreferrer" className="underline">
              {entry.url}
            </a>{" "}
            · {entry.status}
            {entry.error ? ` · ${entry.error}` : ""}
          </p>
          {entry.context_expansion ? (
            <ExpansionDetails expansion={entry.context_expansion} />
          ) : (
            <p className="text-caption text-mute">Brak kontekstu na wpisie.</p>
          )}
        </PageSection>
      ))}
    </PageShell>
  );
}
