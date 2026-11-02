import { test as base, expect, type Page } from "@playwright/test";

export type E2EOptions = { apiUrl: string; adminPassword: string };

export const E2E_OLLAMA_MODEL = "qwen3.5:0.8b";
export const ARTICLE_TEXT =
  "The city council of Gdańsk approved a new network of protected bike lanes on Tuesday. The plan adds 40 kilometres of lanes over three years and will cost 120 million złoty. Construction starts next spring on the main north-south avenue. Supporters say the lanes will cut commuting times and air pollution, while shop owners worry about losing parking spaces in the city centre. The council promised to review the parking impact after the first year.";
export const STABLE_ARTICLE_URL = "https://www.rfc-editor.org/rfc/rfc2119.html";

/** Exchanges the admin password for a JWT via POST /auth/token. */
export async function fetchAdminToken(apiUrl: string, password: string): Promise<string> {
  const response = await fetch(`${apiUrl}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  expect(response.status, "admin login refused").toBe(200);
  const { token } = (await response.json()) as { token: string };
  return token;
}

async function createCompletedJob(apiUrl: string, token: string): Promise<string> {
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const created = await fetch(`${apiUrl}/api/v1/jobs/summarize`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      input_text: ARTICLE_TEXT,
      model_provider: "ollama",
      model_name: E2E_OLLAMA_MODEL,
    }),
  });
  expect(created.status, "seed job refused").toBe(200);
  const { job_id: jobId } = (await created.json()) as { job_id: string };

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${apiUrl}/api/v1/jobs/${jobId}`, { headers });
    expect(response.status, `seed job ${jobId} unreadable`).toBe(200);
    const job = (await response.json()) as { status: string; error: string | null };
    if (job.status === "completed") return jobId;
    if (job.status === "failed") throw new Error(`seed job ${jobId} failed: ${job.error}`);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`seed job ${jobId} did not complete within 90 s`);
}

export function requireOption(option: keyof E2EOptions, value: string): string {
  if (!value)
    throw new Error(`${option} is not set by the Playwright project in playwright.config.ts`);
  return value;
}

/**
 * `adminPage` opens with the token already in localStorage under `auth_token`.
 * `seededJobId` is a completed job created through the API; production is read-only, so there it is null and tests use existing jobs.
 */
export const test = base.extend<E2EOptions & { adminPage: Page; seededJobId: string | null }>({
  apiUrl: ["", { option: true }],
  adminPassword: ["", { option: true }],
  adminPage: async ({ page, apiUrl, adminPassword }, use) => {
    const token = await fetchAdminToken(
      requireOption("apiUrl", apiUrl),
      requireOption("adminPassword", adminPassword),
    );
    await page.addInitScript((value) => localStorage.setItem("auth_token", value), token);
    await use(page);
  },
  seededJobId: async ({ apiUrl, adminPassword }, use, testInfo) => {
    if (testInfo.project.name === "prod") {
      await use(null);
      return;
    }
    const configuredApiUrl = requireOption("apiUrl", apiUrl);
    const token = await fetchAdminToken(
      configuredApiUrl,
      requireOption("adminPassword", adminPassword),
    );
    await use(await createCompletedJob(configuredApiUrl, token));
  },
});

export { expect };
