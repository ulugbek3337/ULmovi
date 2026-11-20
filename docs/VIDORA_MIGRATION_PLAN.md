# VIDORA Migration Plan

## Project direction

VIDORA is the new public brand and product identity of the existing ULmovi platform. The target deployment remains the current Alwaysdata hosting account and the existing Alwaysdata-provided domain. No new domain is required for this migration.

**Brand**
- Name: VIDORA
- Meaning: Video + Aura
- Slogan: Feel the World of Cinema.
- Uzbek slogan: Kino dunyosini his eting.
- Visual direction: premium cinematic
- Obsidian Black: #08090D
- Luxury Gold: #D4AF37
- Graphite: #1E1E24
- Ivory White: #F5F5F5
- Deep Burgundy: #8B1E2D

## Source of truth and workflow

- GitHub is the single source of truth for application code, configuration templates, documentation, tests, and deployment automation.
- All code changes must be committed to feature branches and reviewed through pull requests.
- `main` remains the stable branch.
- Test deployments must use a separate application directory, database, storage directory, and secrets from production.
- Production deployment is permitted only after test acceptance, a verified backup, and a documented rollback path.
- Never commit production databases, uploaded media, OAuth tokens, passwords, API keys, or `.env` files.
- Never overwrite production files or data as part of a test deployment.

## Deployment target

- Hosting provider: Alwaysdata (existing account).
- Domain: keep the current Alwaysdata-provided domain; no domain purchase or DNS migration is planned.
- Test environment: isolated directory and isolated data stores on the same hosting account, subject to confirmed account quotas and web-site configuration support.
- Production: the existing ULmovi installation will eventually be replaced by the VIDORA application after successful validation. Preserve existing user accounts, movies, media, settings, and integrations wherever technically compatible.

## Product requirements

1. Movie and series browsing and playback must not require registration.
2. Registration remains optional for profiles, favorites, and watch history.
3. Launch languages: Uzbek and Russian; keep the architecture ready for English later.
4. Provide a dedicated internal watch experience for movies and episodes.
5. Preserve current working authentication, admin roles, movie management, local uploads, Google Drive integration, video processing, playback/range support, ads, user profiles, history, analytics, and logs unless a replacement is explicitly tested and accepted.
6. Build series support with seasons, episodes, progress tracking, resume, and auto-next.
7. Keep administrative functions protected by role-based access control and audit logging.

## Architecture direction

- Start with a modular PHP monolith and versioned API.
- Preserve the currently working SQLite deployment during the first migration stage. VIDORA series schema v10 is additive and must pass fresh-install plus v6/v7/v9 upgrade regression tests before further series API work.
- Keep database and media storage outside the public web root.
- Use a storage abstraction so local storage and Google Drive can continue working, with future S3/CDN support possible.
- Use FFmpeg/FFprobe only where the hosting environment and execution limits support them.
- Add automated syntax, security, regression, and browser-level checks before production migration.

## Phases and acceptance gates

### Phase 0 — Repository and hosting baseline
- [x] Create a dedicated VIDORA feature branch.
- [x] Record the brand and deployment decisions.
- [ ] Review the full repository, current branches, open pull requests, and CI workflows.
- [ ] Confirm Alwaysdata account quota and website document-root configuration.
- [ ] Confirm the current production backup and restore procedure.

### Phase 1 — Brand foundation
- [x] Add the VIDORA color and typography override layer.
- [x] Rebrand the public homepage title, metadata, and primary wordmarks.
- [ ] Rebrand authentication, profile, admin, and remaining public pages.
- [ ] Review logo behavior and responsive layouts.

### Phase 2 — Product and backend completion
- [ ] Audit all current backend features and API contracts.
- [x] Design the additive series schema and implement SQLite migration v10 with upgrade regression coverage.\n- [ ] Implement series, seasons, and episodes APIs without breaking movie flows.
- [ ] Implement the internal watch-page routes and playback experience.
- [ ] Complete Uzbek/Russian localization.
- [ ] Review security, storage consistency, and background processing.

### Phase 3 — Automated and manual validation
- [ ] PHP syntax and static checks (pending CI confirmation).\n- [ ] Run SQLite v10 migration regression suite in GitHub Actions.
- [ ] JavaScript syntax and frontend smoke tests.
- [ ] Authentication and authorization regression tests.
- [ ] Movie upload, poster, Google Drive, FFmpeg, and playback tests.
- [ ] Mobile and desktop browser tests.
- [ ] Test admin operations and verify no blank/white admin page regressions.

### Phase 4 — Isolated Alwaysdata test deployment
- [ ] Confirm available disk/RAM limits and web-site configuration.
- [ ] Create a separate VIDORA test directory.
- [x] Add a GitHub-managed script for safely creating/updating the isolated test checkout.
- [ ] Use a separate test database, storage directory, and test-only credentials.
- [ ] Deploy only from a reviewed GitHub commit.
- [ ] Verify the test site without changing production.

### Phase 5 — Production migration
- [ ] Obtain final production cutover confirmation after test acceptance.
- [ ] Back up application files, database, media storage, and configuration.
- [ ] Verify that backups can be restored.
- [ ] Prepare a reversible deployment and rollback procedure.
- [ ] Replace the current ULmovi application with VIDORA on the existing Alwaysdata domain.
- [ ] Verify public playback, accounts, admin, uploads, integrations, and logs after cutover.

## Current scope and safety boundary

This branch contains the VIDORA brand foundation, additive SQLite schema v10, public read-only series catalog endpoints, and protected admin metadata API endpoints. It is not a complete VIDORA release and must not be deployed to production. End-to-end browser verification, episode upload and playback, watch pages, and Alwaysdata testing remain outstanding. The existing ULmovi production application and storage remain untouched until the test and production acceptance gates are met.
