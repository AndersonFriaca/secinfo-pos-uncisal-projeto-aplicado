# No lifecycle.prevent_destroy here: this bucket already lives outside
# infra/'s state, so `terraform destroy` run against infra/ can never
# reach it. The extra lifecycle guard would only matter against a
# deliberate `terraform destroy` run directly inside this root, which
# is a separate, rarer, intentional operation (see README's teardown
# section once written).
resource "google_storage_bucket" "state" {
  name     = var.state_bucket_name
  project  = var.project_id
  location = "us-east1"

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }
}
