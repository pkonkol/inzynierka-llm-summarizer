export type DeepevalItem = {
  name: string;
  score: number | null;
  passed: boolean | null;
  reason: string | null;
};

export type PairwiseDeepevalItem = {
  name: string;
  winner: "A" | "B" | "tie";
  score_A: number;
  score_B: number;
  reason: string;
};

export type SummaryDeterministicMetrics = {
  word_count: number;
  sentence_count: number;
  avg_sentence_length: number;
  type_token_ratio: number;
  lexical_density: number | null;
  flesch_reading_ease: number;
  flesch_kincaid_grade: number;
  gunning_fog: number;
  smog_index: number;
  coleman_liau_index: number;
  automated_readability_index: number;
  text_standard: number;
  source_word_count: number;
  word_ratio: number;
  char_ratio: number;
};

export type KeyTakeawaysMetrics = {
  bullet_count: number;
  total_lines: number;
  word_count: number;
  unique_word_count: number;
  type_token_ratio: number | null;
  avg_bullet_word_count: number | null;
};

export type GoldenMetrics = {
  summary: SummaryDeterministicMetrics;
  deepeval: DeepevalItem[];
};

export type AiMetrics = {
  summary: SummaryDeterministicMetrics;
  key_takeaways: KeyTakeawaysMetrics;
  deepeval: DeepevalItem[] | null;
};

export type CrossMetrics = {
  rouge1: number | null;
  rouge2: number | null;
  rougeL: number | null;
  meteor: number | null;
  deepeval: PairwiseDeepevalItem[];
};

export type EvaluationSetEntryInputText = {
  entry_id: string;
  input_text: string;
};

export type EvaluationSetEntry = {
  entry_id: string;
  golden_summary: string;
  title: string;
  url: string;
  golden_metrics: GoldenMetrics | null;
};

export type EvaluationSetListItem = {
  evaluation_set_id: string;
  name: string;
  language: string;
  entry_count: number;
  created_at: string;
};

export type EvaluationSetDetail = {
  evaluation_set_id: string;
  name: string;
  language: string;
  created_at: string;
  entries: EvaluationSetEntry[];
};

export type EvaluationSetCreateResponse = {
  evaluation_set_id: string;
  name: string;
  language: string;
  entry_count: number;
  created_at: string;
};

export type EvaluationSetImportPayload = {
  name: string;
  language: string;
  entries: {
    input_text: string;
    golden_summary: string;
    title: string;
    url: string;
    golden_metrics?: GoldenMetrics | null;
  }[];
};

export type EvaluationRunCreatePayload = {
    model_provider: string;
    model_name: string;
    summary_mode: string;
    language: string;
    rate_limit_delay_ms: number;
};

export type EvaluationRunCreateResponse = {
    evaluation_run_id: string;
    status: "pending" | "running" | "completed" | "failed";
    created_at: string;
};

export type EvaluationRunListItem = {
    evaluation_run_id: string;
    evaluation_set_id: string;
    evaluation_set_name: string;
    model_provider: string;
    model_name: string;
    summary_mode: string;
    language: string;
    status: "pending" | "running" | "completed" | "failed";
    created_at: string;
    finished_at: string | null;
    entry_count: number;
};

export type EvaluationRunEntry = {
    entry_id: string;
    title: string;
    url: string;
    golden_summary: string;
    golden_metrics: GoldenMetrics | null;
    ai_summary: string | null;
    ai_key_takeaways: string[];
    ai_metrics: AiMetrics | null;
    cross_metrics: CrossMetrics | null;
    status: "pending" | "completed" | "failed";
    error: string | null;
};

export type EvaluationRunMeta = {
    id: string;
    evaluation_set_id: string;
    evaluation_set_name: string;
    model_provider: string;
    model_name: string;
    summary_mode: string;
    language: string;
    status: "pending" | "running" | "completed" | "failed";
    created_at: string;
    finished_at: string | null;
    entry_count: number;
    aggregate_metrics: Record<string, unknown>;
};
