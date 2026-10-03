import { useMemo, useState } from "react";

import { errorText } from "../api/client";
import { createEvaluationSet } from "../api/research";
import { useFlash } from "../components/FlashProvider";
import { InfoList, InfoRowContent } from "../components/InfoRow";
import { Button, buttonClasses } from "../components/ui/Button";
import { Checkbox } from "../components/ui/Checkbox";
import { Collapsible } from "../components/ui/Collapsible";
import { Textarea } from "../components/ui/Field";
import { PageShell } from "../components/ui/PageShell";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import type { EvaluationSetImportRequest } from "../types/api.generated";
import { evaluationSetPath, navigateTo } from "../utils/routing";

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
  empty: { status: "brak danych", className: "text-mute", isValid: false, ...NOTHING_PARSED },
  invalid: {
    status: "niepoprawny",
    className: "text-danger-hover",
    isValid: false,
    ...NOTHING_PARSED,
  },
  valid: { status: "poprawny", className: "text-ink", isValid: true },
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
      <section className="mx-auto grid w-full min-w-0 max-w-column gap-6">
        <div className="grid gap-2">
          <h1 className="text-title">Import zbioru ewaluacyjnego</h1>
          <p className="max-w-measure text-body">
            Zbiór ewaluacyjny to artykuły z gotowymi podsumowaniami wzorcowymi. Przebieg uruchamia
            wybrany model na każdym wpisie i zestawia jego wynik z wzorcem — stąd biorą się metryki
            ROUGE, METEOR i oceny G-Eval.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className={buttonClasses("secondary")}>
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleFileChange}
            />
            Wczytaj plik JSON
          </label>
          <Button onClick={() => setRawJson(PRETTY_EXAMPLE)}>Wstaw przykład</Button>
        </div>

        <Checkbox
          checked={computeGoldenMetrics}
          onChange={(event) => setComputeGoldenMetrics(event.target.checked)}
        >
          Policz metryki wzorcowe
        </Checkbox>

        <InfoList>
          <InfoRowContent label="JSON">
            <span className={preview.className}>{preview.status}</span>
          </InfoRowContent>
          <InfoRowContent label="Nazwa">{preview.name}</InfoRowContent>
          <InfoRowContent label="Język">{preview.language}</InfoRowContent>
          <InfoRowContent label="Wpisów">{preview.entryCount}</InfoRowContent>
          {computeGoldenMetrics && typeof preview.entryCount === "number" ? (
            <InfoRowContent label="Wywołania sędziego">
              {JUDGE_SPECS_PER_ENTRY * preview.entryCount}
            </InfoRowContent>
          ) : null}
        </InfoList>

        <Collapsible label="Wklej JSON ręcznie">
          <Textarea
            id="import-json"
            aria-label="JSON zbioru"
            value={rawJson}
            onChange={(event) => setRawJson(event.target.value)}
            spellCheck={false}
            className="min-h-80"
          />
        </Collapsible>

        <Button
          variant="primary"
          onClick={() => void importSet.run(rawJson)}
          disabled={!preview.isValid || importSet.isPending}
          className="justify-self-start"
        >
          {importSet.isPending ? "Importowanie..." : "Importuj zbiór"}
        </Button>
      </section>
    </PageShell>
  );
}
