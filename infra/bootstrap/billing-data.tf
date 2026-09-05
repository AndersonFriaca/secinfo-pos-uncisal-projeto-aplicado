data "google_billing_account" "billing_account" {
  display_name = var.billing_account_name
}

data "google_project" "project" {
  project_id = var.project_id
}
