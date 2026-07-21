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