# ULmovi Enterprise Engineering Roadmap

**Status:** Phase 1 — repository governance and baseline CI  
**Production deployment:** Not authorized; no production changes are part of this roadmap.

## Operating principles

1. `main` remains protected by review and passing CI; work is developed on short-lived feature branches.
2. Every production-impacting change is delivered through a pull request with test evidence, migration notes, rollback guidance, and explicit deployment approval.
3. Production database, uploaded media, secrets, and user records are never used as test fixtures.
4. Security controls are enforced server-side. Hiding a UI control is not authorization.
5. The current Alwaysdata resource envelope is small (approximately 256 MB RAM and 0.25 CPU). Avoid persistent workers, expensive media processing, unbounded queries, and memory-heavy test/deploy jobs unless the hosting plan is upgraded and the design is validated.
6. No payment provider or paid entitlement is considered active until a complete, verified payment flow exists.
7. A green static CI run is not a security certification or proof of production readiness.

## Repository audit — current baseline

The repository currently has several open pull requests built independently from `main`. Some modify the same backend files and propose different SQLite schema versions. They must not be merged independently or in an arbitrary order.

| Pull request | Scope | Integration concern |
|---|---|---|
| #1 | Security hardening, login/register throttling, video-processing queue, schema v7 | Changes `backend/bootstrap.php`, `backend/index.php`, `public/.htaccess`; requires schema and scheduled-worker review |
| #2 | Admin dashboard and table search | Mostly admin frontend; verify it against the final admin API contract |
| #3 | Profile dashboard and watch progress | Proposes schema v6 and changes shared backend files; explicitly coordinate with #1 schema v7 |
| #4 | Homepage redesign | Overlaps homepage assets and scripts with #7 |
| #7 | Homepage V3 polish | Prefer one reviewed homepage implementation; do not merge alongside #4 without diff reconciliation |
| #9 | Repository documentation and templates | Documentation-only; should be independently reviewable |

Branch names and PR contents can change. Re-check the live PR diff, checks, and merge base before every integration decision.

## Phase 1 — repository governance and CI

- [x] Create a dedicated enterprise branch.
- [x] Add a baseline CI workflow for supported PHP syntax, JavaScript syntax, and Composer manifest validation.
- [x] Add automated dependency update configuration for Composer and GitHub Actions.
- [x] Record the integration order and production safety requirements.
- [ ] Review CI results on the pull request.
- [ ] Enable branch protection/ruleset on GitHub (repository-owner action).
- [ ] Merge documentation/governance PRs only after review.

## Phase 2 — safe integration of existing product work

- [ ] Reconcile SQLite schema migrations into one monotonic migration history. Do not combine branches that independently set `PRAGMA user_version` without reviewing every DDL statement and upgrade path.
- [ ] Integrate security changes and tests first, after reviewing cookie handling behind Alwaysdata's HTTPS proxy, CSP compatibility, rate-limit false positives, and the scheduled worker's resource budget.
- [ ] Select one homepage implementation after comparing #4 and #7 at file and browser level; preserve existing API contracts and responsive behavior.
- [ ] Integrate profile/watch-progress features only after the schema has a single authoritative migration path.
- [ ] Integrate admin enhancements after role/permission and API regression tests.
- [ ] Resolve social-links changes against the latest backend and admin implementation.
- [ ] Keep each integration in a focused PR with passing CI.

## Phase 3 — backend and data integrity

- [ ] Inventory every API action, HTTP method, input, output, authentication requirement, role, CSRF requirement, and rate limit.
- [ ] Build automated authorization tests for guest, user, admin, and super_admin roles, including IDOR cases.
- [ ] Add transactional tests for movie, poster, advertisement, and chunked-upload lifecycle; ensure failed DB operations do not leave orphaned files or delete existing assets prematurely.
- [ ] Review upload chunk ordering, replay, expiry, cancellation, concurrent finalize, disk quota, MIME validation, and path traversal defenses.
- [ ] Verify video streaming Range behavior (200, 206, 416) and access policy.
- [ ] Add schema migration tests from every supported previous version and backup/restore rehearsal.
- [ ] Review SQLite locking, indexes, query pagination, and busy timeout for the shared-hosting workload.

## Phase 4 — frontend product quality

- [ ] Establish shared design tokens, typography, spacing, components, responsive breakpoints, and accessibility conventions.
- [ ] Test homepage, movie detail/player, login/register/reset, profile, admin, and mobile navigation in a real browser.
- [ ] Add keyboard navigation, visible focus, semantic labels, reduced-motion behavior, and contrast checks.
- [ ] Verify that untrusted text is rendered as text, external links use safe URL policies, and no secret is exposed in client bundles.
- [ ] Add browser regression tests for core user journeys.

## Phase 5 — security, privacy, and operations

- [ ] Review session fixation, cookie flags, CSRF, CORS, CSP, XSS, SQL injection, IDOR, password reset, email enumeration, and account lifecycle.
- [ ] Review secrets and Google Drive credentials: environment storage, least privilege, rotation, log redaction, and error handling.
- [ ] Add security event logging without passwords, tokens, cookies, or personal data.
- [ ] Define retention/deletion policy for accounts, uploads, logs, and watch history.
- [ ] Add health checks and actionable, privacy-safe operational logs.
- [ ] Rehearse backup restoration and rollback using a staging copy.
- [ ] Review dependency advisories and update policy.

## Phase 6 — performance and hosting fit

- [ ] Measure response time, memory, database lock duration, and disk growth on a staging environment representative of Alwaysdata.
- [ ] Add pagination and bounded result sizes to all list endpoints.
- [ ] Avoid synchronous FFmpeg processing on HTTP requests. Keep media processing disabled in production until a supported executable, scheduled execution budget, and staging tests are confirmed.
- [ ] Verify chunked upload behavior against actual PHP, Apache/proxy, storage quota, and hosting time limits.
- [ ] Add caching only where correctness and privacy are preserved.
- [ ] Define thresholds for when the hosting plan must be upgraded.

## Phase 7 — subscriptions and payments (separate project)

- [ ] Choose a legally and technically supported payment provider.
- [ ] Design signed webhook verification, idempotency, refunds, cancellations, and reconciliation.
- [ ] Enforce paid entitlements only from trusted server-side payment state.
- [ ] Test duplicate, delayed, invalid, and out-of-order webhook events.
- [ ] Do not show a paid plan as purchasable until the full flow is implemented and approved.

## Definition of done for a production release

- All required CI and review checks pass.
- Security-sensitive changes have test coverage and review.
- Database migration and rollback are rehearsed on a non-production copy.
- Storage paths and secrets are verified without exposing values.
- Core journeys pass on staging, including login, playback, upload, profile, and admin permissions.
- Performance is measured against the actual hosting limits.
- A backup exists and restore has been tested.
- The owner explicitly approves the exact production deployment.
