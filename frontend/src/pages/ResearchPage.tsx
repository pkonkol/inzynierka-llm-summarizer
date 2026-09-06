import { useMemo, useState } from "react";
import { errorText } from "../api/client";
import { createEvaluationSet, listEvaluationSets } from "../api/research";
import { useFlash } from "../components/FlashProvider";
import { Alert } from "../components/ui/Alert";
import { Button, buttonClasses } from "../components/ui/Button";
import { Textarea } from "../components/ui/Field";
import { LinkButton } from "../components/ui/LinkButton";
import { PageShell } from "../components/ui/PageShell";
import { Table, Td, Tr } from "../components/ui/Table";
import type {
  EvaluationSetImportRequest,
  EvaluationSetListItemResponse,
} from "../types/api.generated";
import { formatDateMinute } from "../utils/format";
import { useAsyncAction } from "../utils/useAsyncAction";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { useReloadableResource } from "../utils/useReloadableResource";

const PRETTY_EXAMPLE = `{
  "name": "cnn-sample1",
  "language": "en",
  "entries": [
    {
      "input_text": "Example input text",
      "golden_summary": "Example golden summary",
      "title": "Example title",
      "url": "https://example.com/article",
      "golden_metrics": null
    }
  ]
}`;

const SET_COLUMNS = ["Nazwa", "Język", "Wpisów", "Przebiegów", "Utworzono", "Akcja"];

function SetsTable({ sets }: { sets: EvaluationSetListItemResponse[] }) {
  return (
    <Table headers={SET_COLUMNS}>
      {sets.map((set) => (
        <Tr key={set.evaluation_set_id}>
          <Td>{set.name}</Td>
          <Td>{set.language}</Td>
          <Td>{set.entry_count}</Td>
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
  useDocumentTitle("Badania");
  const [rawJson, setRawJson] = useState(PRETTY_EXAMPLE);
  const showFlash = useFlash();
  const setsResource = useReloadableResource(
    listEvaluationSets,
    "",
    "Nie udało się pobrać EvaluationSetów",
  );
  // null means "no answer yet" — a real third state, not a missing value.
  const sets = setsResource.data ?? [];

  const parsedPreview = useMemo(() => {
    try {
      const parsed = JSON.parse(rawJson) as EvaluationSetImportRequest;
      return {
        name: parsed.name,
        language: parsed.language,
        entryCount: parsed.entries?.length ?? 0,
        isValid: true,
      };
    } catch {
      return {
        name: null,
        language: null,
        entryCount: 0,
        isValid: false,
      };
    }
  }, [rawJson]);

  const importSet = useAsyncAction(createEvaluationSet, {
    errorPrefix: "Nie udało się zaimportować EvaluationSetu",
    successMessage: (created) =>
      `Zaimportowano EvaluationSet: ${created.name} (${created.entry_count} entries).`,
    onSuccess: () => setsResource.reload(),
  });

  const handleImport = () => {
    let payload: EvaluationSetImportRequest;
    try {
      payload = JSON.parse(rawJson) as EvaluationSetImportRequest;
    } catch {
      // A malformed textarea is a validation failure, not a failed request.
      showFlash("Niepoprawny JSON.", "danger");
      return;
    }
    void importSet.run(payload);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setRawJson(text);
    } catch (error) {
      showFlash(`Nie udało się odczytać pliku: ${errorText(error)}`, "danger");
    }

    event.target.value = "";
  };

  let setsSection = <p className="text-muted">Ładowanie listy zbiorów...</p>;
  if (!setsResource.isInitialLoading) {
    setsSection =
      sets.length === 0 ? (
        <p className="text-muted">Brak zbiorów. Zaimportuj pierwszy dataset.</p>
      ) : (
        <SetsTable sets={sets} />
      );
  }

  return (
    <PageShell>
      <section className="panel-shell grid min-w-0 gap-4">
        <div className="grid gap-2">
          <h1>Import zbioru ewaluacyjnego</h1>
        </div>

        <div className="grid gap-3">
          <div className="grid gap-2">
            <Textarea
              id="import-json"
              value={rawJson}
              onChange={(event) => setRawJson(event.target.value)}
              spellCheck={false}
              className="min-h-80"
            />
          </div>

          <div className="grid gap-1 border border-panel-border bg-panel-solid px-3 py-2">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span>Status: {parsedPreview.isValid ? "valid JSON" : "invalid JSON"}</span>
              <span>Name: {parsedPreview.name ?? "—"}</span>
              <span>Language: {parsedPreview.language ?? "—"}</span>
              <span>Entries: {parsedPreview.entryCount}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={handleImport} disabled={importSet.isPending}>
              {importSet.isPending ? "Importowanie..." : "Importuj zbiór"}
            </Button>
            <label className={buttonClasses("secondary", "sm", "cursor-pointer")}>
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleFileChange}
              />
              Wczytaj plik JSON
            </label>
          </div>
        </div>
      </section>

      <section className="panel-shell grid min-w-0 gap-4">
        <div className="flex items-end justify-between gap-3">
          <div className="grid gap-2">
            <h2>Zbiory ewaluacyjne</h2>
          </div>
          <Button size="sm" onClick={() => void setsResource.reload()}>
            Odśwież
          </Button>
        </div>

        {setsResource.errorMessage ? (
          <Alert tone="danger">{setsResource.errorMessage}</Alert>
        ) : null}
        {setsSection}
      </section>
    </PageShell>
  );
}
