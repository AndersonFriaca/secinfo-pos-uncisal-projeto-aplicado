/**
 * Route entry for `POST /api/auth/logout`. The implementation and its injectable
 * dependencies live in `./handler` — a route file may only export route
 * handlers and segment config, so the testable `handleLogout(request, deps)` seam
 * cannot live here.
 */

import { handleLogout } from "./handler";

export const runtime = "nodejs";

export function POST(request: Request): Promise<Response> {
  return handleLogout(request);
}
