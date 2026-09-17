import { useMemo, useState } from "react";

import { errorText } from "../api/client";
import { createEvaluationSet } from "../api/research";
import { useFlash } from "../components/FlashProvider";
import { Button, buttonClasses } from "../components/ui/Button";
import { Textarea } from "../components/ui/Field";
import { PageShell } from "../components/ui/PageShell";
import type { EvaluationSetImportRequest } from "../types/api.generated";
import { evaluationSetPath, navigateTo } from "../utils/routing";
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

const NOTHING_PARSED = { name: "—", language: "—", entryCount: "—" };
const JSON_PREVIEW = {
  empty: { status: "brak danych", className: "text-muted", isValid: false, ...NOTHING_PARSED },
  invalid: { status: "niepoprawny", className: "text-danger", isValid: false, ...NOTHING_PARSED },
  valid: { status: "poprawny", className: "text-success", isValid: true },
};

// Three GEval specs run per entry (see services/evaluation_set_metrics.py) — shown before the
// import starts, since that's the cost the checkbox below is trading off.
const JUDGE_SPECS_PER_ENTRY = 3;

export function EvaluationImportPage() {
  useDocumentTitle("Import zbioru");
  const [rawJson, setRawJson] = useState("");
  const [computeGoldenMetrics, setComputeGoldenMetrics] = useState(true);
  const showFlash = useFlash();

  // Only the four values the strip shows: holding the parsed graph here would pin a
  // multi-megabyte dataset for as long as the page is open.
  const preview = useMemo(() => {
    if (!rawJson.trim()) return JSON_PREVIEW.empty;
    try {
      const parsed = JSON.parse(rawJson) as EvaluationSetImportRequest;
      return {
        ...JSON_PREVIEW.valid,
        name: parsed.name,
        language: parsed.language,
        entryCount: parsed.entries.length,
      };
    } catch {
      return JSON_PREVIEW.invalid;
    }
  }, [rawJson]);

  // Parsing inside the action keeps the dataset out of the memo cell and lets a malformed
  // payload surface as a failure flash like any other.
  const importSet = useAsyncAction(
    async (json: string) => {
      const parsed = JSON.parse(json) as EvaluationSetImportRequest;
      return createEvaluationSet({ ...parsed, compute_golden_metrics: computeGoldenMetrics });
    },
    {
      errorPrefix: "Nie udało się zaimportować zbioru",
      successMessage: (created) =>
        `Zaimportowano zbiór: ${created.name} (${created.entry_count} wpisów).` +
        (computeGoldenMetrics ? " Metryki wzorcowe liczą się w tle." : ""),
      onSuccess: (created) => navigateTo(evaluationSetPath(created.evaluation_set_id)),
      keepPendingOnSuccess: true,
    },
  );

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
          <Button size="sm" onClick={() => setRawJson(PRETTY_EXAMPLE)}>
            Wstaw przykład
          </Button>
        </div>

        <label className="flex items-center gap-2 text-muted">
          <input
            type="checkbox"
            checked={computeGoldenMetrics}
            onChange={(event) => setComputeGoldenMetrics(event.target.checked)}
            className="h-4 w-4 border border-input-border"
          />
          Policz metryki wzorcowe
        </label>

        <div className="flex flex-wrap gap-x-4 gap-y-1 border border-panel-border bg-panel-solid px-3 py-2">
          <span className={preview.className}>JSON: {preview.status}</span>
          <span>Nazwa: {preview.name}</span>
          <span>Język: {preview.language}</span>
          <span>Wpisów: {preview.entryCount}</span>
          {computeGoldenMetrics && typeof preview.entryCount === "number" ? (
            <span>Wywołania sędziego: {JUDGE_SPECS_PER_ENTRY * preview.entryCount}</span>
          ) : null}
        </div>

        {/* <Collapsible label="Wklej JSON ręcznie"> */}
        <div className="grid gap-2">
          <Textarea
            id="import-json"
            value={rawJson}
            onChange={(event) => setRawJson(event.target.value)}
            spellCheck={false}
            className="min-h-80"
          />
          <div>
            <Button
              onClick={() => void importSet.run(rawJson)}
              disabled={!preview.isValid || importSet.isPending}
            >
              {importSet.isPending ? "Importowanie..." : "Importuj zbiór"}
            </Button>
          </div>
        </div>
        {/* </Collapsible> */}
      </section>
    </PageShell>
  );
}
