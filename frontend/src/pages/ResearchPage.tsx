import { listEvaluationSets } from "../api/research";
import { StatusLabel } from "../components/StatusLabel";
import { Alert } from "../components/ui/Alert";
import { LinkButton } from "../components/ui/LinkButton";
import { PageShell } from "../components/ui/PageShell";
import { Table, Td, Tr } from "../components/ui/Table";
import type { EvaluationSetListItemResponse } from "../types/api.generated";
import { formatDateMinute } from "../utils/format";
import { EVALUATION_IMPORT_PATH } from "../utils/routing";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { useListPolling } from "../utils/useListPolling";
import { useReloadableResource } from "../utils/useReloadableResource";

const SET_COLUMNS = ["Nazwa", "Język", "Wpisów", "Metryki", "Przebiegów", "Utworzono", "Akcja"];

// "skipped" isn't one of StatusLabel's four job-shaped statuses, and "completed" there reads
// as a plain count ("N gotowe") which is wrong for a set — reuse the label, skip the count.
function GoldenMetricsStatusCell({ set }: { set: EvaluationSetListItemResponse }) {
  if (set.golden_metrics_status === null || set.golden_metrics_status === undefined) {
    return <span className="text-muted">—</span>;
  }
  if (set.golden_metrics_status === "skipped") {
    return <span className="text-muted">pominięte</span>;
  }
  return (
    <>
      <StatusLabel status={set.golden_metrics_status} /> {set.entries_with_metrics}/
      {set.entry_count}
    </>
  );
}

function SetsTable({ sets }: { sets: EvaluationSetListItemResponse[] }) {
  return (
    <Table headers={SET_COLUMNS}>
      {sets.map((set) => (
        <Tr key={set.evaluation_set_id}>
          <Td>{set.name}</Td>
          <Td>{set.language}</Td>
          <Td>{set.entry_count}</Td>
          <Td>
            <GoldenMetricsStatusCell set={set} />
          </Td>
          <Td>{set.run_count}</Td>
          <Td>{formatDateMinute(set.created_at)}</Td>
          <Td className="text-right">
            <LinkButton size="sm" href={`/research/${set.evaluation_set_id}`}>
              Otwórz
            </LinkButton>
          </Td>
        </Tr>
      ))}
    </Table>
  );
}

export function ResearchPage() {
  useDocumentTitle("Zbiory ewaluacyjne");
  const setsResource = useReloadableResource(
    listEvaluationSets,
    "",
    "Nie udało się pobrać listy zbiorów",
  );
  // null means "no answer yet" — a real third state, not a missing value.
  const sets = setsResource.data ?? [];

  useListPolling(
    setsResource.reload,
    sets.some(
      (set) => set.golden_metrics_status === "pending" || set.golden_metrics_status === "running",
    ),
  );

  let setsSection = <p className="text-muted">Ładowanie listy zbiorów...</p>;
  if (!setsResource.isInitialLoading) {
    setsSection =
      sets.length === 0 ? (
        <div className="grid justify-items-start gap-3">
          <p className="text-muted">Brak zbiorów. Zaimportuj pierwszy, żeby uruchomić przebieg.</p>
          <LinkButton href={EVALUATION_IMPORT_PATH}>Przejdź do importu</LinkButton>
        </div>
      ) : (
        <SetsTable sets={sets} />
      );
  }

  return (
    <PageShell>
      <section className="panel-shell grid min-w-0 gap-4">
        <div className="flex items-end justify-between gap-3">
          <h1>Zbiory ewaluacyjne</h1>
        </div>

        {setsResource.errorMessage ? (
          <Alert tone="danger">{setsResource.errorMessage}</Alert>
        ) : null}
        {setsSection}
      </section>
    </PageShell>
  );
}
