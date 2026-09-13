/**
 * Route entry for `POST /api/auth/login`. The implementation and its injectable
 * dependencies live in `./handler` — a route file may only export route
 * handlers and segment config, so the testable `handleLogin(request, deps)` seam
 * cannot live here.
 */

import { handleLogin } from "./handler";

export const runtime = "nodejs";

export function POST(request: Request): Promise<Response> {
  return handleLogin(request);
}
