resource "google_project_service" "billingbudgets" {
  project = var.project_id
  service = "billingbudgets.googleapis.com"
}

# No custom notification channel: GCP's default behavior emails the
# billing account's Administrators/Users at each threshold crossing,
# which is sufficient for a single-operator project (see spec's BILL
# story AC5).
resource "google_billing_budget" "budget" {
  billing_account = data.google_billing_account.billing_account.id
  display_name    = "Monthly Budget Alert"

  budget_filter {
    projects = ["projects/${data.google_project.project.number}"]
  }

  amount {
    specified_amount {
      currency_code = var.billing_alert_currency_code
      units         = var.billing_alert_amount
    }
  }

  threshold_rules {
    threshold_percent = 0.5
  }

  threshold_rules {
    threshold_percent = 0.9
  }

  threshold_rules {
    threshold_percent = 1.0
  }

  threshold_rules {
    threshold_percent = 1.5
  }

  depends_on = [google_project_service.billingbudgets]
}
