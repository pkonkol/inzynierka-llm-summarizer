terraform {
  required_version = ">= 1.7"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region

  default_labels = {
    managed_by = "terraform"
    project    = var.project_name
    env        = "prod"
  }
}

variable "project_id" {
  type        = string
  description = "GCP Project ID"
}

variable "project_name" {
  type        = string
  description = "Name of the project"
}

variable "region" {
  type        = string
  description = "Primary GCP region"
}

resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    # Scans images automatically on push to Artifact Registry (billed per image scanned).
    "containerscanning.googleapis.com",
    # Lets CI read the resulting vulnerability occurrences.
    "containeranalysis.googleapis.com",
    # Required for the frontend deploy to authenticate via ADC rather than a CI token.
    "firebasehosting.googleapis.com",
  ])
  service            = each.value
  disable_on_destroy = false
}

resource "google_storage_bucket" "tf_state" {
  name                     = "${var.project_name}-tf-state"
  location                 = var.region
  force_destroy            = false
  public_access_prevention = "enforced"


  versioning { enabled = true }
  uniform_bucket_level_access = true
  lifecycle {
    prevent_destroy = true
  }
}

# Remote state for THIS (bootstrap) configuration. Deliberately not the bucket above:
# github-actions-sa holds roles/storage.objectAdmin on the whole `${project_name}-tf-state`
# bucket, so sharing it would let any CI run tamper with the state that defines CI's own
# WIF condition and IAM bindings. Nothing but a human on a laptop should write here.
resource "google_storage_bucket" "bootstrap_tf_state" {
  name                     = "${var.project_name}-tf-state-bootstrap"
  location                 = var.region
  force_destroy            = false
  public_access_prevention = "enforced"

  versioning { enabled = true }
  uniform_bucket_level_access = true

  # Versioned state objects accumulate forever otherwise.
  lifecycle_rule {
    condition {
      num_newer_versions = 20
    }
    action {
      type = "Delete"
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_artifact_registry_repository" "app" {
  repository_id = "app"
  format        = "DOCKER"
  location      = var.region

  vulnerability_scanning_config {
    enablement_config = "INHERITED"
  }
}

data "google_artifact_registry_repository" "app" {
  repository_id = google_artifact_registry_repository.app.repository_id
  location      = google_artifact_registry_repository.app.location
}

output "artifact_registry_repo" {
  value = google_artifact_registry_repository.app.id
}
output "artifact_registry_repo_test" {
  value = google_artifact_registry_repository.app.name
}

output "bucket_name" {
  value = google_storage_bucket.tf_state.name
}
