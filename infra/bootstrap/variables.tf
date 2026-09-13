variable "project_id" {
  type        = string
  description = "Existing GCP project ID that owns the state bucket."

  validation {
    condition     = length(var.project_id) > 0
    error_message = "project_id must not be empty."
  }
}

variable "region" {
  type        = string
  description = "GCP region for the state bucket."
  default     = "us-east1"
}

variable "state_bucket_name" {
  type        = string
  description = "Globally unique name for the Terraform remote state bucket."
}
