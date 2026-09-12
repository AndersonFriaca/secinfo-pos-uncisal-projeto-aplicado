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

### L-009 - When a config file must be duplicated into an embedded heredoc, enforce parity with a diff-based gate command, not a "keep these identical" comment — drift passes every syntax gate silently.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `infra/scripts` · harmful: 0
- features: nextjs-secure-app
- evidence: infra/scripts/startup.sh.tpl:244-257 (mutation 5, amendment sensor) (infra/scripts)
- last seen: 2026-09-06T16:24:44Z

### L-010 - A "least privilege" acceptance criterion that only forbids owner/editor still admits a project-scoped predefined admin role; state the required resource scope in the AC, not just the role names.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `infra` · harmful: 0
- features: nextjs-secure-app
- evidence: infra/wif.tf:74-78 (infra)
- last seen: 2026-09-06T16:24:45Z

### L-011 - Before scoping a cloud IAM role from project level down to a single resource, enumerate the CLI's actual API calls against the provider's documented permission list: collection-level and operations reads (compute.projects.get, instances.list, zoneOperations.get) can never be granted by a resource-level binding, so 'zero project-level role' may be unachievable.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `infra` · harmful: 0
- features: nextjs-secure-app
- evidence: infra/wif.tf:88-108 (infra)
- last seen: 2026-09-06T17:13:05Z

### L-012 - terraform validate is a syntax/type gate only - it accepts an empty source_ranges, a deleted IAM binding, a removed variable validation block, and a project-wide IAM member; add credential-free grep assertions to CI for each security invariant instead of trusting fmt/validate.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `infra` · harmful: 0
- features: nextjs-secure-app
- evidence: infra/firewall.tf:10 (S2) (infra)
- last seen: 2026-09-06T17:13:05Z

### L-013 - A Terraform variable validation block is evaluated only at plan time with a concrete value, so terraform validate proves nothing about it - assert the rule's logic separately or accept it is review-only.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `infra` · harmful: 0
- features: nextjs-secure-app
- evidence: infra/variables.tf:43-46 (S5) (infra)
- last seen: 2026-09-06T17:13:05Z

### L-014 - When an amendment narrows a resource an earlier feature's spec declared (firewall breadth, IAM scope), update that earlier spec/tasks in the same commit - the stale spec otherwise reads as the intended state and no validator compares a spec to the code.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `specs` · harmful: 0
- features: nextjs-secure-app
- evidence: .specs/features/gcp-infra-terraform/spec.md:45 (specs)
- last seen: 2026-09-06T17:13:05Z

### L-015 - When a change makes an access path opt-in via a variable defaulting to off, document that applying it to an existing deployment revokes the current access - the destroy is silent in plan output to anyone not reading resource-by-resource.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `docs` · harmful: 0
- features: nextjs-secure-app
- evidence: docs/operations.md:32-38 (docs)
- last seen: 2026-09-06T17:13:05Z

### L-016 - Before granting a CLI the permissions a cloud doc lists, check which branch of the doc's conditional applies to this resource: gcloud compute ssh writes the ephemeral key to project metadata unless the VM sets block-project-ssh-keys=TRUE, so the instance-scoped setMetadata grant covers a path gcloud never takes.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `infra` · harmful: 0
- features: nextjs-secure-app
- evidence: infra/wif.tf:140-145 + infra/compute.tf:46-49 (infra)
- last seen: 2026-09-06T17:26:40Z

### L-017 - A CI guard that allowlists an exception by resource or symbol name lets an offender inherit the exemption by reusing that name; allowlist the permitted value the guard actually cares about, not the identifier.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `ci` · harmful: 0
- features: nextjs-secure-app
- evidence: S6 - .github/workflows/ci.yml:53 (ci)
- last seen: 2026-09-06T17:26:40Z

### L-018 - Scope a static security guard to every file that can express the invariant, not the one file that currently does: a rule moved to a sibling file, a variable default, or a widened permission list evades a single-file grep with all gates green.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `ci` · harmful: 0
- features: nextjs-secure-app
- evidence: S7/S8/S10 - .github/workflows/ci.yml:64-74 (ci)
- last seen: 2026-09-06T17:26:40Z

### L-019 - Enforce a least-privilege permission list with an allowlist of permitted suffixes (e.g. every entry matches \.(get|list)$), never a denylist of mutating verbs - an enumerated denylist admits every write verb it forgot and every API prefix it does not match.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `ci,iac,iam` · harmful: 0
- features: nextjs-secure-app
- evidence: .github/workflows/ci.yml:75-76 (mutants E6/E6b/E6c) (ci,iac,iam)
- last seen: 2026-09-06T17:38:08Z

### L-020 - When a security fix's correctness rests on one config value elsewhere (an instance metadata flag that redirects which permission a CLI needs), guard that value itself - guarding only its downstream consequence lets deleting the fix pass every gate silently.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `ci,iac` · harmful: 0
- features: nextjs-secure-app
- evidence: infra/compute.tf:54 (mutant E5) (ci,iac)
- last seen: 2026-09-06T17:38:08Z

### L-021 - For a 'no client JS' edge case, add a test that asserts the absence of onSubmit/client-side handlers on the rendered form, not just that the form exists — plausibility by construction is not the same as an assertion.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `web/components,testing` · harmful: 0
- features: frontend-shadcn-layouts
- evidence: spec.md Edge Cases: 'WHEN JavaScript is disabled THEN every form...SHALL still submit' (web/components,testing)
- last seen: 2026-09-12T21:55:04Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
