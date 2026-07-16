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
    short_summary: string;
    model_provider: string;
    model_name: string;
    summary_mode: SummaryMode;
    updated_at: string | null;
}

export interface SummaryData {
    title: string;
    short_summary: string;
    key_takeaways: string;
    source_url: string;
}

export interface UsageMetadata {
    input_tokens: number;
    output_tokens: number;
    thinking_tokens: number;
    total_tokens: number;
}

export interface PromptMessage {
    role: string;
    content: string;
}

export interface JobMetrics {
    source: Record<string, number | null>;
    summary: Record<string, number | null>;
    key_takeaways: Record<string, number | null>;
    compression: Record<string, number | null>;
}

export interface DeepevalMetricItem {
    name: string;
    passed?: boolean | null;
    score?: number | null;
    reason?: string | null;
}

export interface DeepevalMetrics {
    summary: DeepevalMetricItem[];
    summary_input: DeepevalMetricItem[];
    takeaways: DeepevalMetricItem[];
    takeaways_input: DeepevalMetricItem[];
    summary_takeaways: DeepevalMetricItem[];
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
    deepeval_metrics?: DeepevalMetrics;
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
