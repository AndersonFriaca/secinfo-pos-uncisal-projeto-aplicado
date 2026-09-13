/**
 * Route entry for `POST /api/auth/forgot-password`. The implementation and its
 * injectable dependencies live in `./handler` — a route file may only export
 * route handlers and segment config, so the testable
 * `handleForgotPassword(request, deps)` seam cannot live here.
 */

import { handleForgotPassword } from "./handler";

export const runtime = "nodejs";

export function POST(request: Request): Promise<Response> {
  return handleForgotPassword(request);
}
