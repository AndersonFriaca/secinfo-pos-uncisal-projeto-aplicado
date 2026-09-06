output "instance_external_ip" {
  description = "Public IP address of the compute instance, for SSH/HTTPS testing and future CI/CD targeting."
  value       = google_compute_instance.vm.network_interface[0].access_config[0].nat_ip
}

output "wif_provider_name" {
  description = "Full resource name of the GitHub Workload Identity provider — the `workload_identity_provider` input for google-github-actions/auth (GitHub secret GCP_WIF_PROVIDER)."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "deploy_service_account_email" {
  description = "Email of the deploy service account GitHub Actions impersonates (GitHub secret GCP_DEPLOY_SA_EMAIL)."
  value       = google_service_account.deploy.email
}
