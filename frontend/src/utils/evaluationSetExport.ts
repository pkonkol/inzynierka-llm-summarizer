import type {
  EvaluationSetEntryImportInput,
  EvaluationSetImportRequest,
  JobStatusResponse,
} from "../types/api.generated";

// Jobs must come from GET /jobs/{job_id}: the by-url listing projects input_text away, and an
// entry without the article text is worthless as evaluation data.
function toEntry(job: JobStatusResponse, sourceUrl: string): EvaluationSetEntryImportInput {
  if (!job.summary_data) {
    throw new Error(`Job ${job.job_id} has no summary to export`);
  }

  const { source, summary } = job.metrics;
  const modelLabel = `${job.model_provider}:${job.model_name}`;
  const timestamp = job.created_at.slice(0, 16);

  return {
    input_text: job.input_text,
    golden_summary: job.summary_data.summary,
    title: `${modelLabel}:${job.summary_mode}:${timestamp}:${job.summary_data.title}`,
    url: sourceUrl,
    golden_metrics: source && summary ? { source, summary, deepeval: job.deepeval_metrics } : null,
  };
}

export function buildExportPayload(
  jobs: JobStatusResponse[],
  sourceUrl: string,
): EvaluationSetImportRequest {
  return {
    name: `summarization_output:${sourceUrl}`,
    language: "en", // jobs do not persist the summary language, and the import default is "en"
    entries: jobs.map((job) => toEntry(job, sourceUrl)),
  };
}

export function exportFilename(sourceUrl: string, jobId?: string): string {
  const host = URL.canParse(sourceUrl) ? new URL(sourceUrl).hostname : "export";
  const suffix = jobId ? `_${jobId}` : "";
  return `summarization_output_${host}${suffix}.json`;
}
