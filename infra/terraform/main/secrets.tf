locals {
  secrets = {
    mongodb_uri        = { env = "MONGODB_URI", version = "latest" }
    gemini_key         = { env = "GEMINI_API_KEY", version = "1" }
    openrouter_api_key = { env = "OPENROUTER_API_KEY", version = "latest" }
    auth_secret        = { env = "AUTH_SECRET", version = "latest" }
    jwt_secret         = { env = "JWT_SECRET", version = "latest" }
    supported_models   = { env = "SUPPORTED_MODELS", version = "latest" }
  }
}

data "google_secret_manager_secret" "all" {
  for_each  = local.secrets
  secret_id = each.key
}

resource "google_secret_manager_secret_iam_member" "cloudrun_sa" {
  for_each  = local.secrets
  secret_id = each.key
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloudrun_sa.email}"
}
