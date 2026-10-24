# Changelog

## [1.2.2](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/compare/v1.2.1...v1.2.2) (2026-10-24)


### Chores

* release 1.2.2 ([c2961e5](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/c2961e59ce403d940c2e1ba9612b2015ce2ae945))

## [1.2.1](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/compare/v1.2.0...v1.2.1) (2026-10-24)


### Bug Fixes

* **auth:** resend verification without re-entering credentials ([126d22d](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/126d22d898522f9f337fa99e2f7c71d33f098667))

## [1.2.0](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/compare/v1.1.0...v1.2.0) (2026-09-13)


### Features

* **web:** add 404 page and a home button on the generic error screen ([68e9f50](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/68e9f5093739e9e5314f8ad779208187fc2cf973))
* **web:** redirect an already-signed-in user away from /login ([73af3fd](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/73af3fd52ec48de7e9250eada958be1d6385c016))
* **web:** sync dark theme + cyan accent to design system ([839279f](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/839279ff1419726f6fbda4ee77ae2317a100f3aa))


### Bug Fixes

* **web:** show a pointer cursor on buttons ([5e93da8](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/5e93da8c651fdcf9434cfa02de8ebd81942fd901))
* **web:** show login errors on-screen instead of raw JSON, add generic error page ([116d220](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/116d2204a8181afa3d9573f6bd8dc5a0a3bbb2cc))

## [1.1.0](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/compare/v1.0.0...v1.1.0) (2026-09-13)


### Features

* **web:** Next.js app with hardened auth, dashboard, and OWASP-mitigated security ([43a2d96](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/43a2d96254af3fd9800916bc6fc9ef0dd61c7be4))

## [1.0.0](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/compare/v0.1.0...v1.0.0) (2026-09-07)


### ⚠ BREAKING CHANGES

* **infra:** the rate-limit store is no longer pluggable and Firestore is gone from the project. Operators must terraform apply commit 884e92c first (deletion_policy), then this commit, and run terraform init -upgrade for the google-beta provider.

### Features

* **infra:** remove firestore entirely, provision firebase auth via terraform ([17e48a3](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/17e48a3ade270ab2fa9027c3dfd1d050c59484a4))
* **web:** in-memory rate-limit store default, pt-BR UI copy ([66f8b22](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/66f8b22696563f26db7af9413e4428c4ae3efeac))


### Bug Fixes

* **web:** run next typegen before tsc in the typecheck script ([8b34f93](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/8b34f935575baf3351720b557226573d1d5c7f52))
