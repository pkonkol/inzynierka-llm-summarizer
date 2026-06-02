# Odpowiednik AWS OIDC provider — SA dla GitHub Actions bez kluczy JSON
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-pool"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  oidc { issuer_uri = "https://token.actions.githubusercontent.com" }
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }
  attribute_condition = "assertion.repository == 'pkonkol/inzynierka-llm-summarizer'"
}

resource "google_service_account" "github_actions" {
  account_id   = "github-actions-sa"
  display_name = "GitHub Actions deployer"
}

resource "google_project_iam_member" "github_actions_roles" {
  for_each = toset([
    "roles/run.admin",
    "roles/artifactregistry.writer",
    "roles/iam.serviceAccountUser",
    "roles/secretmanager.secretAccessor",
    #"roles/storage.admin", # prostsza wersja zeby dzialal backend gcs
  ])
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.github_actions.email}"
}

resource "google_storage_bucket_iam_member" "state_bucket_access" {
  bucket = "${var.project_name}-tf-state" # Nazwa Twojego bucketu
  role   = "roles/storage.objectAdmin"    # Pełna kontrola nad plikami, ale brak uprawnień do usuwania samego bucketu
  member = "serviceAccount:${google_service_account.github_actions.email}"
}

resource "google_service_account_iam_member" "github_wi_binding" {
  service_account_id = google_service_account.github_actions.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/pkonkol/inzynierka-llm-summarizer"
}
