output "instance_external_ip" {
  description = "Public IP address of the compute instance, for SSH/HTTPS testing and future CI/CD targeting."
  value       = google_compute_instance.vm.network_interface[0].access_config[0].nat_ip
}
