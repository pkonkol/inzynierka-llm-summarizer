import { listEvaluationSets } from "../api/research";
import { StatusLabel } from "../components/StatusLabel";
import { Alert } from "../components/ui/Alert";
import { LinkButton } from "../components/ui/LinkButton";
import { PageShell } from "../components/ui/PageShell";
import { Table, Td, Tr } from "../components/ui/Table";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useListPolling } from "../hooks/useListPolling";
import { useReloadableResource } from "../hooks/useReloadableResource";
import type { EvaluationSetListItemResponse } from "../types/api.generated";
import { formatDateMinute } from "../utils/format";
import { EVALUATION_IMPORT_PATH, evaluationSetPath } from "../utils/routing";

const SET_COLUMNS = ["Nazwa", "Język", "Wpisów", "Metryki", "Przebiegów", "Utworzono", "Akcja"];

// "skipped" isn't one of StatusLabel's four job-shaped statuses, and "completed" there reads
// as a plain count ("N gotowe") which is wrong for a set — reuse the label, skip the count.
function GoldenMetricsStatusCell({ set }: { set: EvaluationSetListItemResponse }) {
  if (set.golden_metrics_status === null || set.golden_metrics_status === undefined) {
    return <span className="text-mute">—</span>;
  }
  if (set.golden_metrics_status === "skipped") {
    return <span className="text-mute">pominięte</span>;
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
    <Table headers={SET_COLUMNS} alignRight={["Wpisów", "Przebiegów"]}>
      {sets.map((set) => (
        <Tr key={set.evaluation_set_id}>
          <Td>{set.name}</Td>
          <Td>{set.language}</Td>
          <Td className="text-right">{set.entry_count}</Td>
          <Td>
            <GoldenMetricsStatusCell set={set} />
          </Td>
          <Td className="text-right">{set.run_count}</Td>
          <Td className="text-caption text-mute">{formatDateMinute(set.created_at)}</Td>
          <Td className="text-right">
            <LinkButton href={evaluationSetPath(set.evaluation_set_id)}>Otwórz</LinkButton>
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

  let setsSection = <p className="text-mute">Ładowanie listy zbiorów...</p>;
  if (!setsResource.isInitialLoading) {
    setsSection =
      sets.length === 0 ? (
        <div className="grid justify-items-start gap-3">
          <p className="text-mute">Brak zbiorów. Zaimportuj pierwszy, żeby uruchomić przebieg.</p>
          <LinkButton href={EVALUATION_IMPORT_PATH}>Przejdź do importu</LinkButton>
        </div>
      ) : (
        <SetsTable sets={sets} />
      );
  }

  return (
    <PageShell>
      <section className="grid min-w-0 gap-6">
        <h1 className="text-title">Zbiory ewaluacyjne</h1>

        {setsResource.errorMessage ? (
          <Alert tone="danger">{setsResource.errorMessage}</Alert>
        ) : null}
        {setsSection}
      </section>
    </PageShell>
  );
}
