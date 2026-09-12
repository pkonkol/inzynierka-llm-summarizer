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
  if (job.summary_data.summary === null) {
    throw new Error(`Job ${job.job_id} was generated as bullets, not a prose summary`);
  }

  const { source, summary } = job.metrics;
  const modelLabel = `${job.model_provider}:${job.model_name}`;
  const timestamp = job.created_at.slice(0, 16);

  return {
    input_text: job.input_text,
    golden_summary: job.summary_data.summary,
    title: `${modelLabel}:${job.processing_strategy}:${timestamp}:${job.summary_data.title}`,
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
    // TODO: a job summarised in another language still exports as "en". The value is in
    // prompt_params.language; resolving this means promoting it to a field on JobDocument.
    language: "en",
    entries: jobs.map((job) => toEntry(job, sourceUrl)),
  };
}

export function exportFilename(sourceUrl: string, jobIds: string[]): string {
  const host = URL.canParse(sourceUrl) ? new URL(sourceUrl).hostname : "export";
  const suffix = jobIds.length === 1 ? `_${jobIds[0]}` : "";
  return `summarization_output_${host}${suffix}.json`;
}
