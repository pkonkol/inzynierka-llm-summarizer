export type JobStatusValue = "pending" | "completed" | "failed";

export interface JobListItem {
    job_id: string;
    source_url: string;
    title: string;
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
