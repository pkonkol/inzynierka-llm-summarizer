import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";
import { E2E_OLLAMA_MODEL, type E2EOptions } from "./tests/fixtures";

const E2E_API_PORT = 8100;
const E2E_WEB_PORT = 5180;

const e2eBackendEnvPath = fileURLToPath(new URL("./backend.env", import.meta.url));
const target = process.env.E2E_TARGET;
if (target !== "local" && target !== "prod") {
  throw new Error(
    "E2E_TARGET must be 'local' or 'prod' — run the tests through `just test-quick|test-long|test-prod`",
  );
}

function readEnvFile(relativePath: string): Record<string, string | undefined> {
  return parseEnv(readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8"));
}

// backend.env holds everything except the model choice and the API keys, which differ per run.
function llmEnv(): Record<string, string> {
  const llm = process.env.E2E_LLM;
  if (llm === "ollama") {
    const ollamaModel = JSON.stringify({ model_provider: "ollama", model_name: E2E_OLLAMA_MODEL });
    return { PUBLIC_SUMMARY_MODEL: ollamaModel, TITLE_MODEL: ollamaModel };
  }
  if (llm === "env") {
    const devEnv = readEnvFile("../backend/.env");
    const geminiApiKey = devEnv.GEMINI_API_KEY;
    if (!geminiApiKey) throw new Error("E2E_LLM=env needs GEMINI_API_KEY in backend/.env");
    return { GEMINI_API_KEY: geminiApiKey };
  }
  throw new Error("E2E_LLM must be 'ollama' or 'env' for a local run");
}

function localServers(): PlaywrightTestConfig["webServer"] {
  return [
    {
      command: `uv run uvicorn app.main:app --host 127.0.0.1 --port ${E2E_API_PORT}`,
      cwd: "../backend",
      url: `http://127.0.0.1:${E2E_API_PORT}/health`,
      env: { BACKEND_ENV_FILE: e2eBackendEnvPath, GIT_SHA: "e2e", ...llmEnv() },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${E2E_WEB_PORT} --strictPort`,
      cwd: "../frontend",
      url: `http://127.0.0.1:${E2E_WEB_PORT}`,
      env: { VITE_API_URL: `http://127.0.0.1:${E2E_API_PORT}` },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ];
}

function localAdminPassword(): string {
  const password = readEnvFile("./backend.env").AUTH_SECRET;
  if (!password) throw new Error("e2e/backend.env has no AUTH_SECRET");
  return password;
}

function prodAdminPassword(): string {
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!password) throw new Error("E2E_ADMIN_PASSWORD is not set — run through `just test-prod`");
  return password;
}

const localProject = () => ({
  name: "local",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${E2E_WEB_PORT}`,
    apiUrl: `http://127.0.0.1:${E2E_API_PORT}`,
    adminPassword: localAdminPassword(),
    trace: "retain-on-failure" as const,
  },
});

const prodProject = () => ({
  name: "prod",
  grep: /@smoke/,
  timeout: 120_000, // Cloud Run scales to zero, so the first request waits for a cold start.
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "https://gen-lang-client-0098900745.web.app",
    apiUrl: readEnvFile("../frontend/.env.production").VITE_API_URL,
    adminPassword: prodAdminPassword(),
    trace: "off" as const, // Traces record request bodies and localStorage, so the admin token would land in the report.
    video: "off" as const,
    screenshot: "off" as const,
  },
});

export default defineConfig<E2EOptions>({
  testDir: "./tests",
  projects: target === "local" ? [localProject()] : [prodProject()],
  webServer: target === "local" ? localServers() : [],
});
