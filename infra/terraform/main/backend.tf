locals {
  terraform_bucket = "${var.project_name}-tf-state"
}

terraform {
  backend "gcs" {
    bucket = local.terraform_bucket # hardcode lub -backend-config w CI
    prefix = "terraform/state"
  }
}
