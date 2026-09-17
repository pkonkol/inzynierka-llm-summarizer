import type { SummarySpec } from "../types/api.generated";

// Polish labels for SummarySpec values, shared by the form and the job/run detail views.
export const STANCE_LABELS: Record<SummarySpec["narrative_stance"], string> = {
  voice_of_document: "Głosem dokumentu",
  about_document: "O dokumencie („artykuł omawia…”)",
};

export const FUNCTION_LABELS: Record<SummarySpec["summary_function"], string> = {
  informative: "Informacyjne — zastępuje tekst",
  indicative: "Wskazujące — o czym jest tekst",
  mixed: "Mieszane",
};

export const OUTPUT_FORMAT_LABELS: Record<SummarySpec["output_format"], string> = {
  prose: "Proza",
  bullets: "Punkty",
};

export const LENGTH_POLICY_LABELS: Record<NonNullable<SummarySpec["length"]>["policy"], string> = {
  scaled_to_input: "Suwak",
  explicit: "Ręcznie: słowa i zdania",
  match_reference: "Dopasowana do wzorca",
};

// Polish plural: 1 zdanie, 2–4 zdania (except 12–14), otherwise zdań.
export function pluralPl(count: number, one: string, few: string, many: string): string {
  if (count === 1) return one;
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) return few;
  return many;
}

export function formatLengthTarget(words: number, sentences: number | null | undefined): string {
  const wordsText = `${words} ${pluralPl(words, "słowo", "słowa", "słów")}`;
  if (!sentences) return wordsText;
  return `${wordsText}, ${sentences} ${pluralPl(sentences, "zdanie", "zdania", "zdań")}`;
}
