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

export interface JobStatus {
    job_id: string;
    source_url: string;
    status: JobStatusValue;
    summary_data: SummaryData | null;
    error: string | null;
}

export interface CreateJobResponse {
    job_id: string;
}
