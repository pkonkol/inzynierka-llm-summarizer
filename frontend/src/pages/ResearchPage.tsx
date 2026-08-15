import { useEffect, useMemo, useState } from "react";
import { errorText } from "../api/client";
import { createEvaluationSet, listEvaluationSets } from "../api/research";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { FieldLabel, Textarea } from "../components/ui/Field";
import { LinkButton } from "../components/ui/LinkButton";
import { PageShell } from "../components/ui/PageShell";
import { Table, Td, Tr } from "../components/ui/Table";
import { Toast } from "../components/ui/Toast";
import type { EvaluationSetImportPayload, EvaluationSetListItem } from "../types/research";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { useFlashMessage } from "../utils/useFlashMessage";

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

const SET_COLUMNS = ["Name", "Language", "Entries", "Created", "Action"];

function SetsTable({ sets }: { sets: EvaluationSetListItem[] }) {
  return (
    <Table headers={SET_COLUMNS}>
      {sets.map((set) => (
        <Tr key={set.evaluation_set_id}>
          <Td>{set.name}</Td>
          <Td>{set.language}</Td>
          <Td>{set.entry_count}</Td>
          <Td>{new Date(set.created_at).toLocaleString()}</Td>
          <Td className="text-right">
            <LinkButton size="sm" href={`/research/${set.evaluation_set_id}`}>
              Open
            </LinkButton>
          </Td>
        </Tr>
      ))}
    </Table>
  );
}

export function ResearchPage() {
  useDocumentTitle("Research");
  const [rawJson, setRawJson] = useState(PRETTY_EXAMPLE);
  const [sets, setSets] = useState<EvaluationSetListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const { flash, showFlash, dismissFlash } = useFlashMessage();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const parsedPreview = useMemo(() => {
    try {
      const parsed = JSON.parse(rawJson) as EvaluationSetImportPayload;
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
    dismissFlash();

    let payload: EvaluationSetImportPayload;
    try {
      payload = JSON.parse(rawJson) as EvaluationSetImportPayload;
    } catch {
      setErrorMessage("Niepoprawny JSON.");
      return;
    }

    setIsImporting(true);
    try {
      const created = await createEvaluationSet(payload);
      showFlash(`Zaimportowano EvaluationSet: ${created.name} (${created.entry_count} entries).`);
      await loadSets();
    } catch (error) {
      setErrorMessage(`Nie udało się zaimportować EvaluationSetu: ${errorText(error)}`);
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
      setErrorMessage(`Nie udało się odczytać pliku: ${errorText(error)}`);
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

  let setsSection = <p className="helper-copy">Ładowanie listy EvaluationSet...</p>;
  if (!isLoading && sets.length === 0) {
    setsSection = <p className="helper-copy">Brak EvaluationSetów. Zaimportuj pierwszy dataset.</p>;
  } else if (!isLoading) {
    setsSection = <SetsTable sets={sets} />;
  }

  return (
    <PageShell>
      <section className="panel-shell grid min-w-0 gap-4">
        <div className="grid gap-2">
          <p className="section-kicker">Research</p>
          <h1 className="font-mono text-xl uppercase tracking-wider">Evaluation set import</h1>
          <p className="helper-copy">
            Importuj małe curated datasety JSON. To jest osobny moduł badawczy, niezależny od
            zwykłych jobs.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center justify-center border border-panel-border bg-panel-solid px-3 py-2 text-md text-ink hover:bg-subtle-hover">
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleFileChange}
            />
            Wczytaj plik JSON
          </label>
          <Button size="sm" onClick={() => setRawJson(PRETTY_EXAMPLE)}>
            Wstaw przykład
          </Button>
        </div>

        <div className="grid gap-3">
          <div className="grid gap-2">
            <FieldLabel htmlFor="import-json" className="font-normal text-label">
              Import JSON
            </FieldLabel>
            <Textarea
              id="import-json"
              value={rawJson}
              onChange={(event) => setRawJson(event.target.value)}
              spellCheck={false}
              className="min-h-80"
            />
          </div>

          <div className="grid gap-1 border border-panel-border bg-panel-solid px-3 py-2 text-md">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span>Status: {parsedPreview.isValid ? "valid JSON" : "invalid JSON"}</span>
              <span>Name: {parsedPreview.name ?? "—"}</span>
              <span>Language: {parsedPreview.language ?? "—"}</span>
              <span>Entries: {parsedPreview.entryCount}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={() => void handleImport()} disabled={isImporting}>
              {isImporting ? "Importing..." : "Import evaluation set"}
            </Button>
          </div>

          {errorMessage ? <Alert tone="danger">{errorMessage}</Alert> : null}
        </div>
      </section>

      <section className="panel-shell grid min-w-0 gap-4">
        <div className="flex items-end justify-between gap-3">
          <div className="grid gap-2">
            <p className="section-kicker">Evaluation sets</p>
            <h2 className="font-mono text-lg uppercase tracking-wider">Existing sets</h2>
          </div>
          <Button size="sm" onClick={() => void loadSets()}>
            Refresh
          </Button>
        </div>

        {setsSection}
      </section>

      <Toast flash={flash} onDismiss={dismissFlash} />
    </PageShell>
  );
}
