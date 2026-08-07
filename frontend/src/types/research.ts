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

export type GoldenMetrics = {
  text_stats: Record<string, number> | null;
  readability: Record<string, number> | null;
  deepeval: {
    summary: DeepevalItem[];
    summary_input: DeepevalItem[];
  } | null;
};

export type AiMetrics = {
  summary: Record<string, number>;
  key_takeaways: Record<string, number>;
  compression: Record<string, number>;
  deepeval?: {
    summary: DeepevalItem[];
    summary_input: DeepevalItem[];
    takeaways: DeepevalItem[];
    takeaways_input: DeepevalItem[];
    summary_takeaways: DeepevalItem[];
  };
};

export type CrossMetrics = {
  rouge1: number | null;
  rouge2: number | null;
  rougeL: number | null;
  meteor: number | null;
  deepeval: PairwiseDeepevalItem[];
};

export type EvaluationSetEntry = {
  entry_id: string;
  golden_summary: string;
  source_meta: Record<string, unknown>;
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
    source_meta?: Record<string, unknown>;
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
