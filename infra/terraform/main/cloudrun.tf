resource "google_service_account" "cloudrun_sa" {
  account_id   = "cloudrun-sa"
  display_name = "Cloud Run service account"
}

locals {
  env_vars = {
    MONGODB_DB_NAME         = "test-inzynierka-db"
    MONGODB_JOBS_COLLECTION = "jobs"
    AUTH_ENABLED            = "true"
    LOG_FORMAT              = "json"
    DEEPEVAL_JUDGE_MODEL    = jsonencode({ model_provider = "gemini", model_name = "gemini-flash-latest" })
    CORS_ALLOWED_ORIGINS = jsonencode([
      "https://${var.project_id}.web.app",
      "https://${var.project_id}.firebaseapp.com",
    ])
  }
}

resource "google_cloud_run_v2_service" "backend" {
  name                = "llm-summarizer-backend"
  location            = var.region
  deletion_protection = false

  depends_on = [google_secret_manager_secret_iam_member.cloudrun_sa]

  template {
    service_account = google_service_account.cloudrun_sa.email
    scaling {
      min_instance_count = 0
      # Load-bearing at 1: /meta/keepalive answers from the answering instance's own memory,
      # so with two instances a keepalive can land on the idle one and let the instance doing
      # the work be reclaimed mid-job. Raising this needs a shared work counter first.
      max_instance_count = 1
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/app/backend:${var.image_tag}"
      ports { container_port = 8000 }

      dynamic "env" {
        for_each = local.secrets
        iterator = secret
        content {
          name = secret.value.env
          value_source {
            secret_key_ref {
              secret  = secret.key
              version = secret.value.version
            }
          }
        }
      }
      dynamic "env" {
        for_each = local.env_vars
        content {
          name  = env.key
          value = env.value
        }
      }

      resources {
        limits   = { cpu = "2", memory = "1024Mi" }
        cpu_idle = false
      }
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  location = google_cloud_run_v2_service.backend.location
  name     = google_cloud_run_v2_service.backend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
