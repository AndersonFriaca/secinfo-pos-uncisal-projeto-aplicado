import { headers } from "next/headers";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";

/**
 * Verify-email screen (APP-03, AUTH-06). Reading a request header forces
 * dynamic rendering so the per-request CSP nonce applies. `VerifyEmailForm`
 * owns the markup and the resend contract.
 */
export default async function VerifyEmailPage({
  searchParams,
}: PageProps<"/verify-email">) {
  const csrfToken = (await headers()).get("x-csrf-token") ?? "";
  const { resent } = await searchParams;

  return <VerifyEmailForm csrfToken={csrfToken} resent={Boolean(resent)} />;
}
