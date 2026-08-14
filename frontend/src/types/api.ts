import type {
  DeepevalItem,
  KeyTakeawaysMetrics,
  SourceMetrics,
  SummaryStatisticalMetrics,
} from "./research";

export type JobStatusValue = "pending" | "completed" | "failed";
export type SummaryMode = "simple" | "sequential" | "cascade";

export interface SummaryUrlListItem {
  source_url: string;
  completed_count: number;
  failed_count: number;
  latest_title: string;
  latest_updated_at: string | null;
}

export interface JobListItem {
  job_id: string;
  source_url: string;
  status: JobStatusValue;
  title: string;
  summary: string;
  model_provider: string;
  model_name: string;
  summary_mode: SummaryMode;
  updated_at: string | null;
}

export interface SummaryData {
  title: string;
  summary: string;
  key_takeaways: string[];
  source_url: string;
}

export interface UsageMetadata {
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  total_tokens: number;
}

/** Backend emits [role, template] pairs, not objects. */
export type PromptMessage = [string, string];

export interface JobMetrics {
  source: SourceMetrics | null;
  summary: SummaryStatisticalMetrics | null;
  key_takeaways: KeyTakeawaysMetrics | null;
}

export interface JobStatus {
  job_id: string;
  source_url: string;
  model_provider: string;
  model_name: string;
  summary_mode: SummaryMode;
  status: JobStatusValue;
  summary_data: SummaryData | null;
  metrics: JobMetrics;
  deepeval_metrics: DeepevalItem[];
  usage: UsageMetadata;
  raw_metadata: Record<string, unknown>;
  raw_output: string;
  input_text: string;
  prompt_template: PromptMessage[];
  prompt_params: Record<string, string>;
  created_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number;
  error: string | null;
}

export interface CreateJobResponse {
  job_id: string;
}
