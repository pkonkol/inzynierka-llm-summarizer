export type GoldenMetrics = {
  text_stats?: Record<string, unknown> | null;
  readability?: Record<string, unknown> | null;
  deepeval?: Record<string, unknown> | null;
} | null;

export type EvaluationSetEntry = {
  entry_id: string;
  golden_summary: string;
  source_meta: Record<string, unknown>;
  golden_metrics: GoldenMetrics;
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
    source_meta?: Record<string, unknown>;
    golden_metrics?: {
      text_stats?: Record<string, unknown> | null;
      readability?: Record<string, unknown> | null;
      deepeval?: Record<string, unknown> | null;
    } | null;
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
    golden_summary: string;
    golden_metrics: GoldenMetrics;
    ai_summary: string | null;
    ai_key_takeaways: string[];
    ai_metrics: Record<string, unknown> | null;
    cross_metrics: Record<string, unknown> | null;
    status: "pending" | "completed" | "failed";
    error: string | null;
};

export type EvaluationRunDetail = {
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
    entries: EvaluationRunEntry[];
    aggregate_metrics: Record<string, unknown>;
};