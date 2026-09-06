# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

_none_

## Candidates (under observation - do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 - When a spec requires a security property of an algorithm (constant-time compare, CSPRNG source), assert the property itself, not just the boolean result — a result-only test passes an early-exit rewrite unchanged.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `web/lib/security` · harmful: 0
- features: nextjs-secure-app
- evidence: M3 web/lib/security/csrf.ts:54 (web/lib/security)
- last seen: 2026-09-06T15:08:42Z

### L-002 - Testing a pure header/policy builder does not cover the wiring that decides when to apply it; assert the composed response from the middleware for each conditional branch (sensitive vs non-sensitive path).
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `web/proxy.ts` · harmful: 0
- features: nextjs-secure-app
- evidence: M11 web/proxy.ts:88 (web/proxy.ts)
- last seen: 2026-09-06T15:08:42Z

### L-003 - Every cookie the app sets needs its attributes (SameSite, Secure, Path, Max-Age) asserted on the emitted Set-Cookie header, not just its value — attribute downgrades are silent and security-relevant.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `web/proxy.ts` · harmful: 0
- features: nextjs-secure-app
- evidence: M12 web/proxy.ts:135 (web/proxy.ts)
- last seen: 2026-09-06T15:08:42Z

### L-004 - A guard that collapses distinct denial reasons into one null return cannot honour per-reason redirect targets; return a discriminated result when the spec names different destinations for different failures.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `web/lib/auth` · harmful: 0
- features: nextjs-secure-app
- evidence: AUTH-06 web/app/dashboard/page.tsx:32 (web/lib/auth)
- last seen: 2026-09-06T15:08:42Z

### L-005 - Never list a requirement ID in a describe/test label unless that block actually asserts it — a mislabelled block reads as coverage during review and hides a zero-evidence AC.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `web/lib/security` · harmful: 0
- features: nextjs-secure-app
- evidence: SEC-18 web/lib/security/headers.test.ts:57 (web/lib/security) (+1 more)
- last seen: 2026-09-06T15:27:05Z

### L-006 - A dev-mode relaxation of a security control (adding 'unsafe-eval' under isDev) contradicts an unconditional SHALL NOT; record it as an explicit spec exception rather than encoding it silently in a branch.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `web/lib/security` · harmful: 0
- features: nextjs-secure-app
- evidence: SEC-08 web/lib/security/headers.ts:25 (web/lib/security)
- last seen: 2026-09-06T15:08:42Z

### L-007 - Extracting a branch into a testable pure module only covers the decision, not the call site — assert the consuming wiring too, or the mapping from decision to effect (redirect target, header, status) can be flipped with every test still green.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `web/app` · harmful: 0
- features: nextjs-secure-app
- evidence: M15 web/app/dashboard/page.tsx:33 (web/app)
- last seen: 2026-09-06T15:27:05Z

### L-008 - A shared error-response helper needs every call site covered, not just the ones the spec names — an uncovered branch can be rewritten to leak a distinguishing message while the helper's own tests stay green.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `web/app/api` · harmful: 0
- features: nextjs-secure-app
- evidence: M16 web/app/api/auth/login/route.ts:164 (web/app/api)
- last seen: 2026-09-06T15:27:05Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
