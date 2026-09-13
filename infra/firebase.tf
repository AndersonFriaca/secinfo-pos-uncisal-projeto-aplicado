# Firebase project enablement (TF-02). `google_firebase_project` "adds Firebase"
# to the existing GCP project so Firebase Authentication is formally provisioned
# and visible in the Firebase console. It needs the google-beta provider (the
# resource is beta-only); that is the sole reason google-beta is in
# required_providers (main.tf).
#
# The email/password sign-in method itself is configured by
# google_identity_platform_config in app.tf. The app talks to Identity Platform
# server-side only — Admin SDK + REST, no client Firebase SDK (AD-004) — so no
# google_firebase_web_app is created.
resource "google_firebase_project" "default" {
  provider = google-beta
  project  = var.project_id

  depends_on = [google_project_service.app]
}
