import { headers } from "next/headers";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

/**
 * Forgot-password screen (APP-05, AUTH-20). Reading a request header forces
 * dynamic rendering so the per-request CSP nonce applies. `ForgotPasswordForm`
 * owns the markup and the CSRF-token contract.
 */
export default async function ForgotPasswordPage({
  searchParams,
}: PageProps<"/forgot-password">) {
  const csrfToken = (await headers()).get("x-csrf-token") ?? "";
  const { sent, error } = await searchParams;

  return (
    <ForgotPasswordForm
      csrfToken={csrfToken}
      sent={Boolean(sent)}
      error={typeof error === "string" ? error : undefined}
    />
  );
}
