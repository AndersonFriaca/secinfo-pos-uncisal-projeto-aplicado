/**
 * Route entry for `POST /api/auth/signup`. The implementation and its injectable
 * dependencies live in `./handler` — a route file may only export route
 * handlers and segment config, so the testable `handleSignup(request, deps)` seam
 * cannot live here.
 */

import { handleSignup } from "./handler";

export const runtime = "nodejs";

export function POST(request: Request): Promise<Response> {
  return handleSignup(request);
}
