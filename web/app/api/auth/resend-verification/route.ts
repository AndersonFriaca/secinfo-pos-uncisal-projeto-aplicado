/**
 * Route entry for `POST /api/auth/resend-verification`. The implementation and its injectable
 * dependencies live in `./handler` — a route file may only export route
 * handlers and segment config, so the testable `handleResendVerification(request, deps)` seam
 * cannot live here.
 */

import { handleResendVerification } from "./handler";

export const runtime = "nodejs";

export function POST(request: Request): Promise<Response> {
  return handleResendVerification(request);
}
