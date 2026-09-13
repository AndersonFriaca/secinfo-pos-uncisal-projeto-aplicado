import { headers } from "next/headers";
import { SignupForm } from "@/components/auth/signup-form";

/**
 * Signup screen (APP-03, AUTH-01). Reading a request header forces dynamic
 * rendering so the per-request CSP nonce applies. `SignupForm` owns the
 * markup, the CSRF-token contract, and the password `minLength`.
 */
export default async function SignupPage({
  searchParams,
}: PageProps<"/signup">) {
  const csrfToken = (await headers()).get("x-csrf-token") ?? "";
  const { error } = await searchParams;

  return (
    <SignupForm
      csrfToken={csrfToken}
      error={typeof error === "string" ? error : undefined}
    />
  );
}
