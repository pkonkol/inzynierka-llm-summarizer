const ENVIRONMENTS = {
  prod: {
    apiUrl: "https://llm-summarizer-backend-644995789676.europe-central2.run.app",
    appUrl: "https://gen-lang-client-0098900745.web.app",
  },
  local: {
    apiUrl: "http://127.0.0.1:8000",
    appUrl: "http://localhost:5173",
  },
};

export const ACTIVE_ENVIRONMENT = ENVIRONMENTS.local;
