import type {
  AuthStatusResponse,
  JobCreatedResponse,
  JobCreateRequest,
  JobDeletedResponse,
  JobListItemResponse,
  JobStatusResponse,
  KeepaliveResponse,
  PublicSummarizeRequest,
  SummaryPresetOut,
  TokenResponse,
  UrlSummaryListItem,
  VersionResponse,
} from "../types/api.generated";
import type { JobStatusValue } from "../types/local";
import { logger } from "../utils/logger";

const API_BASE_URL = import.meta.env.VITE_API_URL;
if (!API_BASE_URL) {
  throw new Error("VITE_API_URL is not set — copy example.env to .env for local development");
}
const TOKEN_KEY = "auth_token";

// FastAPI reports failures as {"detail": "..."}. Unwrapping it here is what keeps the raw
// response body out of the interface.
function readDetail(body: string): string {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object" && "detail" in parsed) {
      const { detail } = parsed as { detail: unknown };
      return typeof detail === "string" ? detail : JSON.stringify(detail);
    }
  } catch {
    // Not JSON — a proxy or gateway error page. The raw text is the best available message.
  }
  return body;
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const tokenListeners = new Set<() => void>();

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  for (const listener of tokenListeners) listener();
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  for (const listener of tokenListeners) listener();
}

/** The `storage` event only fires in other tabs, so same-tab changes notify through the set. */
export function subscribeToToken(listener: () => void): () => void {
  tokenListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    tokenListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

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
    logger.error("api request failed", { path, status: response.status });
    if (response.status === 401 && !path.startsWith("/auth/")) {
      clearToken();
      throw new Error("Zaloguj się, aby wykonać tę akcję.");
    }
    const detail = readDetail(await response.text());
    throw new Error(detail || `Żądanie nie powiodło się (HTTP ${response.status})`);
  }
  return (await response.json()) as T;
}

export const getAuthStatus = (): Promise<AuthStatusResponse> =>
  request<AuthStatusResponse>("/auth/status");

export const login = (password: string): Promise<TokenResponse> =>
  request<TokenResponse>("/auth/token", {
    method: "POST",
    body: JSON.stringify({ password }),
  });

export const createSummaryJob = (payload: JobCreateRequest): Promise<JobCreatedResponse> =>
  request<JobCreatedResponse>("/api/v1/jobs/summarize", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const createPublicSummaryJob = (
  payload: PublicSummarizeRequest,
): Promise<JobCreatedResponse> =>
  request<JobCreatedResponse>("/api/v1/public/summarize", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const listSummarizedUrls = (limit = 50): Promise<UrlSummaryListItem[]> =>
  request<UrlSummaryListItem[]>(`/api/v1/jobs?limit=${limit}`);

export const listAllJobsFlat = (
  limit = 100,
  status: JobStatusValue[] = [],
): Promise<JobListItemResponse[]> => {
  const query = new URLSearchParams([
    ["limit", String(limit)],
    ...status.map((value): [string, string] => ["status", value]),
  ]);
  return request<JobListItemResponse[]>(`/api/v1/jobs/list?${query}`);
};

export const getJobsForUrl = (
  sourceUrl: string,
  status: JobStatusValue,
): Promise<JobStatusResponse[]> =>
  request<JobStatusResponse[]>(
    `/api/v1/jobs/by-url?source_url=${encodeURIComponent(sourceUrl)}&status=${status}`,
  );

export const getJobStatus = (jobId: string): Promise<JobStatusResponse> =>
  request<JobStatusResponse>(`/api/v1/jobs/${jobId}`);

export const deleteJob = (jobId: string): Promise<JobDeletedResponse> =>
  request<JobDeletedResponse>(`/api/v1/jobs/${jobId}`, { method: "DELETE" });

export const getSupportedModels = (): Promise<Record<string, string[]>> =>
  request<Record<string, string[]>>("/api/v1/meta/models");

export const getSupportedLanguages = (): Promise<string[]> =>
  request<string[]>("/api/v1/meta/languages");

export const getSupportedProcessingStrategies = (): Promise<Record<string, string>> =>
  request<Record<string, string>>("/api/v1/meta/processing-strategies");

export const getSummaryPresets = (): Promise<Record<string, SummaryPresetOut>> =>
  request<Record<string, SummaryPresetOut>>("/api/v1/meta/summary-presets");

export const getBackendVersion = (): Promise<VersionResponse> =>
  request<VersionResponse>("/api/v1/meta/version");

export const getKeepalive = (signal?: AbortSignal): Promise<KeepaliveResponse> =>
  request<KeepaliveResponse>("/api/v1/meta/keepalive", { signal });
