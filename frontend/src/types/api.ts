export type JobStatusValue = "pending" | "completed" | "failed";

/** One entry per unique source_url returned by GET /api/v1/jobs */
export interface SummaryUrlListItem {
    source_url: string;
    completed_count: number;
    failed_count: number;
    latest_title: string;
    latest_updated_at: string | null;
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

export interface JobStatus {
    job_id: string;
    source_url: string;
    model_provider: string;
    model_name: string;
    status: JobStatusValue;
    summary_data: SummaryData | null;
    usage: UsageMetadata;
    raw_metadata: Record<string, unknown>;
    created_at: string | null;
    started_at: string | null;
    finished_at: string | null;
    duration_ms: number;
    error: string | null;
}

export interface CreateJobResponse {
    job_id: string;
}
