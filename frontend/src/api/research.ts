import type {
  DeepevalQueuedResponse,
  EvaluationRunCreateRequest,
  EvaluationRunCreateResponse,
  EvaluationRunDeletedResponse,
  EvaluationRunEntriesResponse,
  EvaluationRunListItemResponse,
  EvaluationRunResponse,
  EvaluationSetCreateResponse,
  EvaluationSetDeletedResponse,
  EvaluationSetDetailResponse,
  EvaluationSetEntryInputTextResponse,
  EvaluationSetExportResponse,
  EvaluationSetImportRequest,
  EvaluationSetListItemResponse,
  GoldenMetricsBackfillResponse,
} from "../types/api.generated";
import { request } from "./client";

export const listEvaluationSets = (): Promise<EvaluationSetListItemResponse[]> =>
  request<EvaluationSetListItemResponse[]>("/api/v1/research/evaluation-sets");

export const createEvaluationSet = (
  payload: EvaluationSetImportRequest,
): Promise<EvaluationSetCreateResponse> =>
  request<EvaluationSetCreateResponse>("/api/v1/research/evaluation-sets", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const getEvaluationSet = (setId: string): Promise<EvaluationSetDetailResponse> =>
  request<EvaluationSetDetailResponse>(`/api/v1/research/evaluation-sets/${setId}`);

export const exportEvaluationSet = (setId: string): Promise<EvaluationSetExportResponse> =>
  request<EvaluationSetExportResponse>(`/api/v1/research/evaluation-sets/${setId}/export`);

export const deleteEvaluationSet = (setId: string): Promise<EvaluationSetDeletedResponse> =>
  request<EvaluationSetDeletedResponse>(`/api/v1/research/evaluation-sets/${setId}`, {
    method: "DELETE",
  });

const inputTextCache = new Map<string, Promise<EvaluationSetEntryInputTextResponse>>();

export const getEvaluationSetEntryInputText = (
  setId: string,
  entryId: string,
): Promise<EvaluationSetEntryInputTextResponse> => {
  const cacheKey = `${setId}:${entryId}`;
  const cached = inputTextCache.get(cacheKey);
  if (cached) return cached;

  const result = request<EvaluationSetEntryInputTextResponse>(
    `/api/v1/research/evaluation-sets/${setId}/entries/${entryId}/input-text`,
  );
  inputTextCache.set(cacheKey, result);
  result.catch(() => inputTextCache.delete(cacheKey));
  return result;
};

export const evaluateMissingGoldenMetrics = (
  setId: string,
): Promise<GoldenMetricsBackfillResponse> =>
  request<GoldenMetricsBackfillResponse>(
    `/api/v1/research/evaluation-sets/${setId}/golden-metrics`,
    { method: "POST" },
  );

export const listEvaluationRuns = (setId: string): Promise<EvaluationRunListItemResponse[]> =>
  request<EvaluationRunListItemResponse[]>(`/api/v1/research/evaluation-sets/${setId}/runs`);

export const createEvaluationRun = (
  setId: string,
  payload: EvaluationRunCreateRequest,
): Promise<EvaluationRunCreateResponse> =>
  request<EvaluationRunCreateResponse>(`/api/v1/research/evaluation-sets/${setId}/runs`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const getEvaluationRun = (runId: string): Promise<EvaluationRunResponse> =>
  request<EvaluationRunResponse>(`/api/v1/research/runs/${runId}`);

export const getEvaluationRunEntries = (runId: string): Promise<EvaluationRunEntriesResponse> =>
  request<EvaluationRunEntriesResponse>(`/api/v1/research/runs/${runId}/entries`);

export const evaluateRunDeepeval = (runId: string): Promise<DeepevalQueuedResponse> =>
  request<DeepevalQueuedResponse>(`/api/v1/research/runs/${runId}/deepeval`, {
    method: "POST",
  });

export const deleteEvaluationRun = (runId: string): Promise<EvaluationRunDeletedResponse> =>
  request<EvaluationRunDeletedResponse>(`/api/v1/research/runs/${runId}`, {
    method: "DELETE",
  });
