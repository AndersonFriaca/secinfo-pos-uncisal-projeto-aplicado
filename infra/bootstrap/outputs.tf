output "state_bucket_name" {
  description = "Name of the GCS bucket to use in infra/'s backend \"gcs\" block."
  value       = google_storage_bucket.state.name
}
