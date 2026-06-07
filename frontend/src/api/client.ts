import type { CreateJobResponse, JobListItem, JobStatus } from "../types/api";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        headers: {
            "Content-Type": "application/json",
            ...(options?.headers ?? {}),
        },
        ...options,
    });

    if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Request failed with status ${response.status}`);
    }

    return (await response.json()) as T;
}

export function createSummaryJob(url: string, model_provider: string, model_name: string): Promise<CreateJobResponse> {
    return request<CreateJobResponse>("/api/v1/jobs/summarize", {
        method: "POST",
        body: JSON.stringify({ url, model_provider, model_name }),
    });
}

export function listCompletedJobs(limit = 50): Promise<JobListItem[]> {
    return request<JobListItem[]>(`/api/v1/jobs?limit=${limit}`);
}

export function getJobStatus(jobId: string): Promise<JobStatus> {
    return request<JobStatus>(`/api/v1/jobs/${jobId}`);
}

export function getSupportedModels(): Promise<Record<string, string[]>> {
    return request<Record<string, string[]>>("/api/v1/meta/models");
}
