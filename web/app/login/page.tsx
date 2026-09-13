import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getSessionState } from "@/lib/auth/session";
import { guestRedirect } from "@/lib/guest-guard";

const SESSION_COOKIE = "__session";

/**
 * Login screen (APP-03, SEC-21). Reading a request header forces dynamic
 * rendering so the per-request CSP nonce applies. An already-signed-in user
 * is sent straight to `/dashboard` (or `/verify-email` if unverified)
 * instead of seeing the form again. `LoginForm` owns the markup and the
 * CSRF-token / generic-error contract.
 */
export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const csrfToken = (await headers()).get("x-csrf-token") ?? "";
  const sessionCookie = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  const state = await getSessionState(sessionCookie);

  const target = guestRedirect(state);
  if (target) {
    redirect(target);
  }

  const { error } = await searchParams;

  return <LoginForm csrfToken={csrfToken} error={Boolean(error)} />;
}
