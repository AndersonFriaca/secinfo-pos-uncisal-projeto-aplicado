import { connection } from "next/server";
import { cookies } from "next/headers";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { headerNavLink } from "@/lib/nav";
import { LandingContent } from "@/components/landing-content";

const SESSION_COOKIE = "__session";

/**
 * Public landing page (APP-01, APP-02, APP-04).
 *
 * `connection()` forces dynamic rendering so the per-request CSP nonce from
 * `proxy.ts` applies. The only auth touch is `getAuthenticatedUser`, which
 * decides whether the header links to `/dashboard` or `/login` — the page ships
 * no Firebase config and no `NEXT_PUBLIC_*` value.
 */
export default async function Home() {
  await connection();

  const sessionCookie = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  const user = await getAuthenticatedUser(sessionCookie);
  const navLink = headerNavLink(user);

  return <LandingContent navLink={navLink} />;
}
