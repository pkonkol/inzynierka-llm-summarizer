import { useMemo, useState } from "react";

import { errorText } from "../api/client";
import { createEvaluationSet } from "../api/research";
import { Collapsible } from "../components/Collapsible";
import { useFlash } from "../components/FlashProvider";
import { Button, buttonClasses } from "../components/ui/Button";
import { Textarea } from "../components/ui/Field";
import { PageShell } from "../components/ui/PageShell";
import type { EvaluationSetImportRequest } from "../types/api.generated";
import { navigateTo, RESEARCH_SETS_PATH } from "../utils/routing";
import { useAsyncAction } from "../utils/useAsyncAction";
import { useDocumentTitle } from "../utils/useDocumentTitle";

const PRETTY_EXAMPLE = `{
  "name": "dataset-sample1",
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

export function EvaluationImportPage() {
  useDocumentTitle("Import zbioru");
  const [rawJson, setRawJson] = useState("");
  const showFlash = useFlash();

  const hasJsonText = rawJson.trim().length > 0;
  // One parse for the preview and for the request, so the button can never be enabled for
  // input the import would reject.
  const parsedSet = useMemo(() => {
    if (!rawJson.trim()) return null;
    try {
      return JSON.parse(rawJson) as EvaluationSetImportRequest;
    } catch {
      return null;
    }
  }, [rawJson]);

  const importSet = useAsyncAction(createEvaluationSet, {
    errorPrefix: "Nie udało się zaimportować zbioru",
    successMessage: (created) =>
      `Zaimportowano zbiór: ${created.name} (${created.entry_count} wpisów).`,
    onSuccess: () => navigateTo(RESEARCH_SETS_PATH),
    keepPendingOnSuccess: true,
  });

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setRawJson(await file.text());
    } catch (error) {
      showFlash(`Nie udało się odczytać pliku: ${errorText(error)}`, "danger");
    }

    event.target.value = "";
  };

  let jsonStatus = <span className="text-muted">JSON: brak danych</span>;
  if (hasJsonText) {
    jsonStatus = parsedSet ? (
      <span className="text-success">JSON: poprawny</span>
    ) : (
      <span className="text-danger">JSON: niepoprawny</span>
    );
  }

  return (
    <PageShell>
      <section className="panel-shell grid min-w-0 gap-4">
        <div className="grid gap-2">
          <h1>Import zbioru ewaluacyjnego</h1>
          <p className="max-w-measure text-muted">
            Zbiór ewaluacyjny to artykuły z gotowymi podsumowaniami wzorcowymi. Przebieg uruchamia
            wybrany model na każdym wpisie i zestawia jego wynik z wzorcem — stąd biorą się metryki
            ROUGE, METEOR i oceny G-Eval.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className={buttonClasses("primary", "md", "cursor-pointer")}>
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleFileChange}
            />
            Wczytaj plik JSON
          </label>
          <Button
            onClick={() => parsedSet && void importSet.run(parsedSet)}
            disabled={!parsedSet || importSet.isPending}
          >
            {importSet.isPending ? "Importowanie..." : "Importuj zbiór"}
          </Button>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 border border-panel-border bg-panel-solid px-3 py-2">
          {jsonStatus}
          <span>Nazwa: {parsedSet?.name ?? "—"}</span>
          <span>Język: {parsedSet?.language ?? "—"}</span>
          <span>Wpisów: {parsedSet?.entries?.length ?? 0}</span>
        </div>

        <Collapsible label="Wklej JSON ręcznie">
          <div className="grid gap-2 p-3">
            <Textarea
              id="import-json"
              value={rawJson}
              onChange={(event) => setRawJson(event.target.value)}
              spellCheck={false}
              className="min-h-80"
            />
            <div>
              <Button size="sm" onClick={() => setRawJson(PRETTY_EXAMPLE)}>
                Wstaw przykład
              </Button>
            </div>
          </div>
        </Collapsible>
      </section>
    </PageShell>
  );
}
