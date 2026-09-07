/**
 * Minimal Secret Manager read path.
 *
 * Uses the ambient Google credentials — the VM's attached service account in
 * production (granted `roles/secretmanager.secretAccessor` on the one secret in
 * infra/secrets.tf), or `gcloud auth application-default login` locally. Calls
 * the REST endpoint directly through google-auth-library rather than pulling in
 * the full `@google-cloud/secret-manager` client, keeping the dependency list
 * small (google-auth-library is already in the tree via firebase-admin).
 */

import { GoogleAuth } from "google-auth-library";

const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

let auth: GoogleAuth | undefined;

/**
 * Return the payload of `projects/<project>/secrets/<secretId>/versions/latest`
 * as a UTF-8 string, or null if that version has no data. Throws on
 * auth/permission/transport failures — the caller decides how to degrade.
 */
export async function accessSecretVersion(
  project: string,
  secretId: string,
): Promise<string | null> {
  auth ??= new GoogleAuth({ scopes: CLOUD_PLATFORM_SCOPE });
  const client = await auth.getClient();

  const url =
    `https://secretmanager.googleapis.com/v1/projects/${project}` +
    `/secrets/${encodeURIComponent(secretId)}/versions/latest:access`;

  const { data } = await client.request<{ payload?: { data?: string } }>({ url });
  const encoded = data.payload?.data;
  return encoded ? Buffer.from(encoded, "base64").toString("utf8") : null;
}
