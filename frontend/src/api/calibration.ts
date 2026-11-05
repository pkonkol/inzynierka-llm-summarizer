import type {
  CalibrationLabels,
  CalibrationSampleResponse,
  KeyfactsApproval,
  PairVerdict,
  SummaryLabels,
} from "../types/api.generated";
import { request } from "./client";

const CALIBRATION_API = "/api/v1/research/calibration";

export const getCalibrationSample = (): Promise<CalibrationSampleResponse> =>
  request<CalibrationSampleResponse>(`${CALIBRATION_API}/sample`);

export const getCalibrationLabels = (): Promise<CalibrationLabels> =>
  request<CalibrationLabels>(`${CALIBRATION_API}/labels`);

export const saveSummaryLabels = (
  summaryId: string,
  labels: SummaryLabels,
): Promise<CalibrationLabels> =>
  request<CalibrationLabels>(`${CALIBRATION_API}/labels/${summaryId}`, {
    method: "PUT",
    body: JSON.stringify(labels),
  });

export const saveKeyfactsApproval = (
  sourceId: string,
  approval: KeyfactsApproval,
): Promise<CalibrationLabels> =>
  request<CalibrationLabels>(`${CALIBRATION_API}/keyfacts/${sourceId}`, {
    method: "PUT",
    body: JSON.stringify(approval),
  });

export const savePairVerdict = (
  sourceId: string,
  verdict: PairVerdict,
): Promise<CalibrationLabels> =>
  request<CalibrationLabels>(`${CALIBRATION_API}/pairs/${sourceId}`, {
    method: "PUT",
    body: JSON.stringify(verdict),
  });
