variable "billing_account_name" {
  type        = string
  description = "Display name of the existing billing account (from `gcloud billing accounts list`)."
}

variable "billing_alert_currency_code" {
  type        = string
  description = "Currency code for the billing budget amount."
  default     = "USD"
}

variable "billing_alert_amount" {
  type        = string
  description = "Billing budget tripwire amount, in whole currency units."
  default     = "5"
}
