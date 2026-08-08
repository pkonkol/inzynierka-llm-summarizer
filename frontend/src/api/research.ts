import { request } from "./client";
import type {
    EvaluationSetCreateResponse,
    EvaluationSetDetail,
    EvaluationSetEntryInputText,
    EvaluationSetImportPayload,
    EvaluationSetListItem,
    EvaluationRunCreatePayload,
    EvaluationRunCreateResponse,
    EvaluationRunEntry,
    EvaluationRunListItem,
    EvaluationRunMeta,
} from "../types/research";

export const listEvaluationSets = (): Promise<EvaluationSetListItem[]> =>
    request<EvaluationSetListItem[]>("/api/v1/research/evaluation-sets");

export const createEvaluationSet = (
    payload: EvaluationSetImportPayload,
): Promise<EvaluationSetCreateResponse> =>
    request<EvaluationSetCreateResponse>("/api/v1/research/evaluation-sets", {
        method: "POST",
        body: JSON.stringify(payload),
    });

export const getEvaluationSet = (setId: string): Promise<EvaluationSetDetail> =>
    request<EvaluationSetDetail>(`/api/v1/research/evaluation-sets/${setId}`);

export const exportEvaluationSet = (setId: string): Promise<unknown> =>
    request<unknown>(`/api/v1/research/evaluation-sets/${setId}/export`);

export const deleteEvaluationSet = (
    setId: string,
): Promise<{ status: string; evaluation_set_id: string; deleted_runs: number }> =>
    request<{ status: string; evaluation_set_id: string; deleted_runs: number }>(
        `/api/v1/research/evaluation-sets/${setId}`,
        { method: "DELETE" },
    );

const inputTextCache = new Map<string, Promise<EvaluationSetEntryInputText>>();

export const getEvaluationSetEntryInputText = (
    setId: string,
    entryId: string,
): Promise<EvaluationSetEntryInputText> => {
    const cacheKey = `${setId}:${entryId}`;
    const cached = inputTextCache.get(cacheKey);
    if (cached) return cached;

    const result = request<EvaluationSetEntryInputText>(
        `/api/v1/research/evaluation-sets/${setId}/entries/${entryId}/input-text`,
    );
    inputTextCache.set(cacheKey, result);
    result.catch(() => inputTextCache.delete(cacheKey));
    return result;
};

export const evaluateMissingGoldenMetrics = (
    setId: string,
): Promise<{ status: string; updated_entries: number; total_entries: number }> =>
    request<{ status: string; updated_entries: number; total_entries: number }>(
        `/api/v1/research/evaluation-sets/${setId}/golden-metrics`,
        { method: "POST" },
    );

export const listEvaluationRuns = (setId: string): Promise<EvaluationRunListItem[]> =>
    request<EvaluationRunListItem[]>(`/api/v1/research/evaluation-sets/${setId}/runs`);

export const createEvaluationRun = (
    setId: string,
    payload: EvaluationRunCreatePayload,
): Promise<EvaluationRunCreateResponse> =>
    request<EvaluationRunCreateResponse>(`/api/v1/research/evaluation-sets/${setId}/runs`, {
        method: "POST",
        body: JSON.stringify(payload),
    });

export const getEvaluationRun = (runId: string): Promise<EvaluationRunMeta> =>
    request<EvaluationRunMeta>(`/api/v1/research/runs/${runId}`);

export const getEvaluationRunEntries = (runId: string): Promise<{ entries: EvaluationRunEntry[] }> =>
    request<{ entries: EvaluationRunEntry[] }>(`/api/v1/research/runs/${runId}/entries`);

export const evaluateRunDeepeval = (
    runId: string,
): Promise<{ status: string; run_id: string }> =>
    request<{ status: string; run_id: string }>(`/api/v1/research/runs/${runId}/deepeval`, {
        method: "POST",
    });

export const deleteEvaluationRun = (runId: string): Promise<{ status: string; evaluation_run_id: string }> =>
    request<{ status: string; evaluation_run_id: string }>(`/api/v1/research/runs/${runId}`, {
        method: "DELETE",
    });
