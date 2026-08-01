import { request } from "./client";
import type {
    EvaluationSetCreateResponse,
    EvaluationSetDetail,
    EvaluationSetImportPayload,
    EvaluationSetListItem,
    EvaluationRunCreatePayload,
    EvaluationRunCreateResponse,
    EvaluationRunDetail,
    EvaluationRunListItem,
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

export const getEvaluationRun = (runId: string): Promise<EvaluationRunDetail> =>
    request<EvaluationRunDetail>(`/api/v1/research/runs/${runId}`);

export const evaluateRunDeepeval = (
    runId: string,
): Promise<{ status: string; run_id: string }> =>
    request<{ status: string; run_id: string }>(`/api/v1/research/runs/${runId}/deepeval`, {
        method: "POST",
    });
