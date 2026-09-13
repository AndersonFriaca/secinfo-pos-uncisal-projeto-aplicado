# Changelog

## [1.0.0](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/compare/v0.1.0...v1.0.0) (2026-09-07)


### ⚠ BREAKING CHANGES

* **infra:** the rate-limit store is no longer pluggable and Firestore is gone from the project. Operators must terraform apply commit 884e92c first (deletion_policy), then this commit, and run terraform init -upgrade for the google-beta provider.

### Features

* **infra:** remove firestore entirely, provision firebase auth via terraform ([17e48a3](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/17e48a3ade270ab2fa9027c3dfd1d050c59484a4))
* **web:** in-memory rate-limit store default, pt-BR UI copy ([66f8b22](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/66f8b22696563f26db7af9413e4428c4ae3efeac))


### Bug Fixes

* **web:** run next typegen before tsc in the typecheck script ([8b34f93](https://github.com/AndersonFriaca/secinfo-pos-uncisal-projeto-aplicado/commit/8b34f935575baf3351720b557226573d1d5c7f52))
