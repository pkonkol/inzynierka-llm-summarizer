import { useEffect, useMemo, useState } from "react";
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
import { useDocumentTitle } from "../utils/useDocumentTitle";

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
  const [sets, setSets] = useState<EvaluationSetListItemResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const showFlash = useFlash();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  const loadSets = async () => {
    const data = await listEvaluationSets();
    setSets(data);
  };

  const handleImport = async () => {
    setErrorMessage(null);

    let payload: EvaluationSetImportRequest;
    try {
      payload = JSON.parse(rawJson) as EvaluationSetImportRequest;
    } catch {
      showFlash("Niepoprawny JSON.", "danger");
      return;
    }

    setIsImporting(true);
    try {
      const created = await createEvaluationSet(payload);
      showFlash(`Zaimportowano EvaluationSet: ${created.name} (${created.entry_count} entries).`);
      await loadSets();
    } catch (error) {
      showFlash(`Nie udało się zaimportować EvaluationSetu: ${errorText(error)}`, "danger");
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setRawJson(text);
      setErrorMessage(null);
    } catch (error) {
      showFlash(`Nie udało się odczytać pliku: ${errorText(error)}`, "danger");
    }

    event.target.value = "";
  };

  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      try {
        const data = await listEvaluationSets();
        if (!isMounted) return;
        setSets(data);
      } catch (error) {
        if (!isMounted) return;
        setErrorMessage(`Nie udało się pobrać EvaluationSetów: ${errorText(error)}`);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void initialize();
    return () => {
      isMounted = false;
    };
  }, []);

  let setsSection = <p className="text-muted">Ładowanie listy zbiorów...</p>;
  if (!isLoading && sets.length === 0) {
    setsSection = <p className="text-muted">Brak zbiorów. Zaimportuj pierwszy dataset.</p>;
  } else if (!isLoading) {
    setsSection = <SetsTable sets={sets} />;
  }

  return (
    <PageShell>
      <section className="panel-shell grid min-w-0 gap-4">
        <div className="grid gap-2">
          <h1>Import zbioru ewaluacyjnego</h1>
        </div>

        <div className="flex flex-wrap gap-2"></div>

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
            <Button variant="primary" onClick={() => void handleImport()} disabled={isImporting}>
              {isImporting ? "Importowanie..." : "Importuj zbiór"}
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

          {errorMessage ? <Alert tone="danger">{errorMessage}</Alert> : null}
        </div>
      </section>

      <section className="panel-shell grid min-w-0 gap-4">
        <div className="flex items-end justify-between gap-3">
          <div className="grid gap-2">
            <h2>Zbiory ewaluacyjne</h2>
          </div>
          <Button size="sm" onClick={() => void loadSets()}>
            Odśwież
          </Button>
        </div>

        {setsSection}
      </section>
    </PageShell>
  );
}
