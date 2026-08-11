export type DeepevalItem = {
  name: string;
  score: number;
  passed: boolean;
  reason: string;
};

export type PairwiseDeepevalItem = {
  name: string;
  score: number; // raw GEval score, higher favors AI over golden
  reason: string;
};

export type SourceMetrics = {
  char_count: number;
  flesch_kincaid_grade: number;
  text_standard: number;
};

export type SummaryStatisticalMetrics = {
  char_count: number;
  flesch_kincaid_grade: number;
  text_standard: number;
  length_ratio: number; // summary chars / source chars
};

export type KeyTakeawaysMetrics = {
  bullet_count: number;
  char_count: number;
};

export type GoldenMetrics = {
  source: SourceMetrics;
  summary: SummaryStatisticalMetrics;
  deepeval: DeepevalItem[];
};

export type AiMetrics = {
  summary: SummaryStatisticalMetrics;
  key_takeaways: KeyTakeawaysMetrics;
  deepeval: DeepevalItem[] | null;
};

export type CrossMetrics = {
  rouge1: number;
  rouge2: number;
  rougeL: number;
  meteor: number;
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
