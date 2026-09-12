# Changelog

## [1.1.0](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/compare/v1.0.0...v1.1.0) (2026-09-12)


### Features

* **infra:** store Identity Platform API key in Secret Manager ([e4a98dc](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/e4a98dcf4f420135eb38870d34a680d26c02543f))
* **web:** add card-less AuthShell layout ([ff78618](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/ff786187d6ea5a3c9d0b3e6285e6eed26c41262c))
* **web:** add POST /api/auth/forgot-password ([e39ee27](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/e39ee271867a8b06e97a57150281f7727ab02cb5))
* **web:** add sendPasswordResetEmail to the identity-platform wrapper ([99c5579](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/99c5579e47d52f37de4e88f965c024c5e18fb4b2))
* **web:** add shadcn sidebar and breadcrumb primitives ([73e63cf](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/73e63cfe99317bc95e705f09a9544e67f6e4c604))
* **web:** add the dashboard AppSidebar ([f38359c](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/f38359cd1394d5b9226333404339f38f5a88ce5d))
* **web:** add the forgot-password screen ([1af29a4](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/1af29a4775869a0c8f0a0f93a49854fc036793c1))
* **web:** card-less login screen ([26374ec](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/26374ecd05d687a6bdc0db2bc85ca45e5690166e))
* **web:** card-less signup screen without password-rule copy ([4577311](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/45773117c3cd7a7d96f51618b333b61a7c4d6949))
* **web:** card-less verify-email screen ([f505456](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/f505456e7d91bd4c4bd074b795224aa796094bd8))
* **web:** landing page without the security feature list ([d5f1112](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/d5f111224da29dcbb67d796f102cdb3d036ae5db))
* **web:** link to forgot-password from the login screen ([84e3587](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/84e358747ab6ca6d2bcee4eeb554cd0b8853c24d))
* **web:** move sidebar width variables to globals.css ([9ea136e](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/9ea136e64123b01023c5c3283334bc9824db04d7))
* **web:** show distinct signup error message per code ([bf1ea1e](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/bf1ea1ef78d107298ab37668140e9d73c0334b89))
* **web:** sidebar dashboard shell ([336715d](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/336715d26827de34997c041f5a148efabb22a06d))


### Bug Fixes

* **web:** build the standalone bundle with webpack, not Turbopack ([14baba8](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/14baba8644d70538e64cad089d98712d8aee8fbe))
* **web:** derive the same-origin check from X-Forwarded-Proto/Host ([0445f02](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/0445f02c79bc517e3dcfce8ade102e64a2551af4))
* **web:** drop inline styles from the sidebar block to satisfy style-src ([1a45da1](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/1a45da19a54d5fe67166c14e97abdaf07cf8dbee))
* **web:** emit relative redirect Location from the auth routes ([86bc64e](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/86bc64e68d9e5795d438192845f808da5c2d22b1))
* **web:** redirect signup rejections instead of returning raw JSON ([b2a3035](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/b2a3035a45af9570424f0c9eddfc14d9ab2edc57))


### Refactors

* **web:** neutral site metadata description ([cd1e195](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/cd1e19542c99bb71b808dd17e91d1464ad38d335))

## [1.0.0](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/compare/v0.1.0...v1.0.0) (2026-09-07)


### ⚠ BREAKING CHANGES

* **infra:** the rate-limit store is no longer pluggable and Firestore is gone from the project. Operators must terraform apply commit 884e92c first (deletion_policy), then this commit, and run terraform init -upgrade for the google-beta provider.

### Features

* **infra:** remove firestore entirely, provision firebase auth via terraform ([17e48a3](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/17e48a3ade270ab2fa9027c3dfd1d050c59484a4))
* **web:** in-memory rate-limit store default, pt-BR UI copy ([66f8b22](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/66f8b22696563f26db7af9413e4428c4ae3efeac))


### Bug Fixes

* **web:** run next typegen before tsc in the typecheck script ([8b34f93](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/8b34f935575baf3351720b557226573d1d5c7f52))
