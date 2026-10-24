import { ACTIVE_ENVIRONMENT } from "./config.js";

// FastAPI reports failures as {"detail": "..."}, and validation failures as a list of {msg}.
// A body that is not JSON is a proxy or gateway error page, so its raw text is the best message.
async function readDetail(response) {
  const text = await response.text();
  try {
    const { detail } = JSON.parse(text);
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map((issue) => issue.msg).join("; ");
  } catch {
    return text || `Żądanie nie powiodło się (HTTP ${response.status})`;
  }
  return `Żądanie nie powiodło się (HTTP ${response.status})`;
}

async function request(path, options) {
  const response = await fetch(`${ACTIVE_ENVIRONMENT.apiUrl}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (response.ok) return response.json();

  const detail = await readDetail(response);
  const retryAfterSeconds = response.headers.get("Retry-After");
  if (response.status === 429 && retryAfterSeconds !== null) {
    const minutes = Math.ceil(Number(retryAfterSeconds) / 60);
    throw new Error(`${detail} Następne możliwe za ${minutes} min.`);
  }
  throw new Error(detail);
}

/** Summary kinds offered on the public page, keyed by preset id. */
export function fetchSummaryPresets() {
  return request("/api/v1/meta/summary-presets");
}

/** Language codes the public endpoint accepts, "auto" first. */
export function fetchSupportedLanguages() {
  return request("/api/v1/meta/languages");
}

/** Creates a public summary job; resolves to its job_id or throws with the API's detail message. */
export async function createPublicSummaryJob(payload) {
  const { job_id } = await request("/api/v1/public/summarize", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return job_id;
}
