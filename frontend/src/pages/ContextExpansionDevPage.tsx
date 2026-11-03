import { getEvaluationRun, getEvaluationRunEntries } from "../api/research";
import { ContextExpansionDetails } from "../components/ContextExpansionDetails";
import { Alert } from "../components/ui/Alert";
import { PageSection, PageShell } from "../components/ui/PageShell";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useReloadableResource } from "../hooks/useReloadableResource";
import { evaluationRunPath } from "../utils/routing";

type ContextExpansionDevPageProps = {
  runId: string;
};

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
            <ContextExpansionDetails expansion={entry.context_expansion} />
          ) : (
            <p className="text-caption text-mute">Brak kontekstu na wpisie.</p>
          )}
        </PageSection>
      ))}
    </PageShell>
  );
}
