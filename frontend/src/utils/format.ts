export function formatDateMinute(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pl-PL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const METRIC_LABEL_OVERRIDES: Record<string, string> = {
  char_count: "liczba znaków",
  flesch_kincaid_grade: "Flesch-Kincaid",
  text_standard: "poziom tekstu",
  length_ratio: "stosunek długości",
  bullet_count: "liczba punktów",
};

export function formatMetricLabel(key: string): string {
  return METRIC_LABEL_OVERRIDES[key] ?? key.replace(/_/g, " ");
}
