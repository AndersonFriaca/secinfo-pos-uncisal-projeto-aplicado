import { headers } from "next/headers";
import { LoginForm } from "@/components/auth/login-form";

/**
 * Login screen (APP-03, SEC-21). Reading a request header forces dynamic
 * rendering so the per-request CSP nonce applies. `LoginForm` owns the
 * markup and the CSRF-token / generic-error contract.
 */
export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const csrfToken = (await headers()).get("x-csrf-token") ?? "";
  const { error } = await searchParams;

  return <LoginForm csrfToken={csrfToken} error={Boolean(error)} />;
}
