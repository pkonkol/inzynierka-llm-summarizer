import type { CreateJobResponse, JobListItem, JobStatus, JobStatusValue, SummaryUrlListItem } from "../types/api";

const API_BASE_URL = import.meta.env.VITE_API_URL;
if (!API_BASE_URL) {
    throw new Error("VITE_API_URL is not set — copy example.env to .env for local development");
}
const TOKEN_KEY = "auth_token";

export function getToken(): string | null { return localStorage.getItem(TOKEN_KEY); }
export function setToken(token: string): void { localStorage.setItem(TOKEN_KEY, token); }
export function clearToken(): void { localStorage.removeItem(TOKEN_KEY); }

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const token = getToken();
    const response = await fetch(`${API_BASE_URL}${path}`, {
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(options?.headers ?? {}),
        },
        ...options,
    });

    if (!response.ok) {
        if (response.status === 401 && !path.startsWith("/auth/")) clearToken();
        const message = await response.text().catch(() => "");
        throw new Error(message || `Request failed with status ${response.status}`);
    }
    return (await response.json()) as T;
}

export const getAuthStatus = (): Promise<{ enabled: boolean }> =>
    request<{ enabled: boolean }>("/auth/status");

export const login = (password: string): Promise<{ token: string }> =>
    request<{ token: string }>("/auth/token", { method: "POST", body: JSON.stringify({ password }) });

export const createSummaryJob = (
    url: string,
    model_provider: string,
    model_name: string,
    language: string,
    summary_mode: string,
    run_deepeval: boolean,
): Promise<CreateJobResponse> =>
    request<CreateJobResponse>("/api/v1/jobs/summarize", {
        method: "POST",
        body: JSON.stringify({
            url,
            model_provider,
            model_name,
            language,
            summary_mode,
            run_deepeval,
        }),
    });

export const listSummarizedUrls = (limit = 50): Promise<SummaryUrlListItem[]> =>
    request<SummaryUrlListItem[]>(`/api/v1/jobs?limit=${limit}`);

export const listAllJobsFlat = (limit = 100): Promise<JobListItem[]> =>
    request<JobListItem[]>(`/api/v1/jobs/list?limit=${limit}`);

export const getJobsForUrl = (sourceUrl: string, status: JobStatusValue): Promise<JobStatus[]> =>
    request<JobStatus[]>(`/api/v1/jobs/by-url?source_url=${encodeURIComponent(sourceUrl)}&status=${status}`);

export const getJobStatus = (jobId: string): Promise<JobStatus> =>
    request<JobStatus>(`/api/v1/jobs/${jobId}`);

export const deleteJob = (jobId: string): Promise<{ status: string; job_id: string }> =>
    request<{ status: string; job_id: string }>(`/api/v1/jobs/${jobId}`, { method: "DELETE" });

export const getSupportedModels = (): Promise<Record<string, string[]>> =>
    request<Record<string, string[]>>("/api/v1/meta/models");

export const getSupportedLanguages = (): Promise<string[]> =>
    request<string[]>("/api/v1/meta/languages");

export const getSupportedModes = (): Promise<Record<string, string>> =>
    request<Record<string, string>>("/api/v1/meta/modes");
