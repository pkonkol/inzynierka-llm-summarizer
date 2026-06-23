locals {
  # secret_id -> env var name
  secrets = {
    mongodb_uri        = "MONGODB_URI"
    gemini_key         = "GEMINI_API_KEY"
    openrouter_api_key = "OPENROUTER_API_KEY"
    auth_secret        = "AUTH_SECRET"
    jwt_secret         = "JWT_SECRET"
    supported_models   = "SUPPORTED_MODELS"
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
