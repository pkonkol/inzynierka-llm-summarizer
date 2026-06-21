data "google_secret_manager_secret" "mongodb_uri" {
  secret_id = "mongodb_uri"
}

data "google_secret_manager_secret" "gemini_key" {
  secret_id = "gemini_key"
}

data "google_secret_manager_secret" "openrouter_api_key" {
  secret_id = "openrouter_api_key"
}

resource "google_service_account" "cloudrun_sa" {
  account_id   = "cloudrun-sa"
  display_name = "Cloud Run service account"
}

resource "google_cloud_run_v2_service" "backend" {
  name                = "llm-summarizer-backend"
  location            = var.region
  deletion_protection = false


  template {
    service_account = google_service_account.cloudrun_sa.email
    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/app/backend:${var.image_tag}"
      ports { container_port = 8000 }

      env {
        name = "MONGODB_URI"
        value_source {
          secret_key_ref {
            secret  = data.google_secret_manager_secret.mongodb_uri.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "GEMINI_API_KEY"
        value_source {
          secret_key_ref {
            secret  = data.google_secret_manager_secret.gemini_key.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "OPENROUTER_API_KEY"
        value_source {
          secret_key_ref {
            secret  = data.google_secret_manager_secret.openrouter_api_key.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "AUTH_SECRET"
        value_source {
          secret_key_ref {
            secret  = data.google_secret_manager_secret.auth_secret.secret_id
            version = "latest"
          }
        }
      }
      env {
        name  = "JWT_SECRET"
        value = "a39266b6a02434340521aa66ba1df7d2ce5f92123893cbd3b7095d8ee60edc99"
      }
      env {
        name  = "MONGODB_DB_NAME"
        value = "test-inzynierka-db"
      }
      env {
        name  = "MONGODB_JOBS_COLLECTION"
        value = "jobs"
      }

      resources {
        limits   = { cpu = "1", memory = "512Mi" }
        cpu_idle = true
      }
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  location = google_cloud_run_v2_service.backend.location
  name     = google_cloud_run_v2_service.backend.name
  role     = "roles/run.invoker"
  member   = "allUsers" # publiczny endpoint; usuń jeśli chcesz auth
}

# SA dla Cloud Run musi mieć dostęp do sekretów
resource "google_secret_manager_secret_iam_member" "cloudrun_mongo" {
  secret_id = data.google_secret_manager_secret.mongodb_uri.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloudrun_sa.email}"
}

resource "google_secret_manager_secret_iam_member" "cloudrun_gemini" {
  secret_id = data.google_secret_manager_secret.gemini_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloudrun_sa.email}"
}
