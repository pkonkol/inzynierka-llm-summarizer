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
  # Lokalnie: ADC z `gcloud auth application-default login`
  # GitHub Actions: automatycznie z WIF tokena

  default_labels = {
    managed_by = "terraform"
    project    = var.project_name
    env        = "prod"
  }
}

