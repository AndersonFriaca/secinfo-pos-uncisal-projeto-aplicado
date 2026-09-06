variable "project_id" {
  type        = string
  description = "Existing GCP project ID that owns all billable resources in this root."

  validation {
    condition     = length(var.project_id) > 0
    error_message = "project_id must not be empty."
  }
}

variable "region" {
  type        = string
  description = "GCP region for the network and subnet."
  default     = "us-east1"
}

variable "zone" {
  type        = string
  description = "GCP zone for the compute instance."
  default     = "us-east1-b"
}

variable "ssh_username" {
  type        = string
  description = "Username to associate with the injected SSH public key."
}

variable "ssh_public_key_path" {
  type        = string
  description = "Local filesystem path to the operator's SSH public key file."

  validation {
    condition     = fileexists(var.ssh_public_key_path)
    error_message = "ssh_public_key_path must point to an existing file."
  }
}

variable "operator_ssh_cidrs" {
  type        = list(string)
  default     = []
  description = "CIDR ranges allowed to reach the VM on tcp:22 directly. Empty (default) = no public SSH; reach the VM only via 'gcloud compute ssh --tunnel-through-iap'. Operator-supplied in the gitignored terraform.tfvars."

  validation {
    condition     = alltrue([for c in var.operator_ssh_cidrs : can(cidrhost(c, 0))])
    error_message = "every operator_ssh_cidrs entry must be a valid CIDR (e.g. \"203.0.113.4/32\")."
  }
}

variable "github_repository" {
  type        = string
  description = "GitHub repository allowed to deploy via Workload Identity Federation, in \"owner/repo\" form. No default: operator-supplied in the gitignored terraform.tfvars (identifier, not published)."

  validation {
    condition     = can(regex("^[^/]+/[^/]+$", var.github_repository))
    error_message = "github_repository must be in \"owner/repo\" form."
  }
}
