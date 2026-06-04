variable "project_id" {
  type        = string
  description = "GCP Project ID"
}

variable "region" {
  type        = string
  description = "Primary GCP region"
}

variable "project_name" {
  type        = string
  description = "Name of the project"
}

variable "image_tag" {
  type        = string
  description = "Docker image tag assigned to build backend image and deployed to Cloud Run"
  default     = "manual"
}
