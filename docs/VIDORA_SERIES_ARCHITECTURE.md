# VIDORA Series Architecture

## Status

The additive SQLite schema migration v10 is implemented. Series API routes, admin CRUD, uploads, and playback are not implemented yet. Continue in small, independently tested pull-request commits.

## Goals

- Keep existing movies and movie playback working unchanged.
- Add series as a first-class catalog item with seasons and episodes.
- Allow public browsing and playback without requiring an account.
- Allow signed-in users to save episode progress and resume watching.
- Support an explicit next-episode action and optional auto-next.
- Preserve admin-only management and auditability.

## Data model proposal

Use additive SQLite migrations. The current schema is version 10. The additive v10 migration creates series, seasons, episodes, episode files, and per-user episode progress tables. Fresh installs and upgrades from v6, v7, and v9 must pass regression tests before API work proceeds.

### `series`

- `id` — integer primary key
- `title` — required
- `description` — optional
- `year` — optional
- `genre` — optional
- `poster_path` / `poster_url` — follow the existing media-path conventions
- `status` — draft, published, or archived
- `created_at`, `updated_at`

### `seasons`

- `id` — integer primary key
- `series_id` — required foreign key to `series`, cascade on series deletion
- `season_number` — positive integer
- `title` — optional display title
- `description` — optional
- `created_at`, `updated_at`
- Unique constraint on (`series_id`, `season_number`)

### `episodes`

- `id` — integer primary key
- `season_id` — required foreign key to `seasons`, cascade on season deletion
- `episode_number` — positive integer
- `title` — required
- `description` — optional
- `duration_seconds` — non-negative integer, nullable until media metadata is available
- `poster_path` — optional
- `status` — draft, published, or archived
- `created_at`, `updated_at`
- Unique constraint on (`season_id`, `episode_number`)

### `episode_files`

Keep episode media separate from the existing `movie_files` table so movie upload and playback contracts are not silently changed.

- `id` — integer primary key
- `episode_id` — required foreign key to `episodes`, cascade on episode deletion
- `quality`, `file_path`, `mime_type`, `file_size`
- `source_type` — local by default; allow Google Drive only after the shared storage abstraction is tested
- `drive_file_id` — nullable
- Unique constraint on (`episode_id`, `quality`)

### `episode_watch_progress`

- `id` — integer primary key
- `user_id` — required foreign key to `users`, cascade on user deletion
- `episode_id` — required foreign key to `episodes`, cascade on episode deletion
- `position_seconds`, `duration_seconds` — non-negative
- `updated_at`
- Unique constraint on (`user_id`, `episode_id`)

Anonymous playback must not create user rows or persistent personal progress. If anonymous resume is later required, it must be designed separately with privacy and retention limits.

## API and route proposal

Follow the existing `backend/index.php?action=...` API convention initially, while keeping the implementation in small helper modules where practical.

Public read actions:
- `get_series` — published series listing with pagination and filters
- `get_series_detail` — series metadata and published seasons
- `get_season_episodes` — published episodes for one season
- `get_episode` — episode metadata and playback availability

Authenticated actions:
- `save_episode_progress` — save the current user's progress
- `episode_watch_progress` — retrieve the current user's resume position

Admin actions (admin or super-admin only):
- `admin_create_series`, `admin_update_series`, `admin_delete_series`
- `admin_create_season`, `admin_update_season`, `admin_delete_season`
- `admin_create_episode`, `admin_update_episode`, `admin_delete_episode`
- Episode media upload actions must use the existing chunked-upload security principles, with separate episode ownership checks and storage paths.

All state-changing actions must require POST, CSRF validation, authorization, input validation, and audit logging. Public actions must expose published content only. Deletion must be checked for dependent media cleanup and must never delete a Google Drive object unless the user explicitly requests that behavior and the API supports it safely.

## Watch experience

Proposed internal routes:
- `/watch/movie/{movieId}`
- `/watch/series/{seriesId}?season={seasonNumber}&episode={episodeNumber}`

The episode player should:
1. Load only published episode metadata and an authorized media source.
2. Reuse the existing secure streaming/range behavior where compatible.
3. Resume from the signed-in user's saved position.
4. Save progress periodically and on pause/page exit, with throttling.
5. Show previous/next episode navigation.
6. Offer auto-next as a user-controlled preference; do not unexpectedly start another episode if the preference is off.
7. Fall back gracefully when an episode has no playable media.

## Required regression coverage before implementation is accepted

- Existing movie list, movie detail, movie upload, movie poster, movie playback, Range requests, and movie watch progress remain unchanged.
- Fresh schema creation and upgrades from supported prior schema versions preserve all existing rows.
- Series/season/episode CRUD enforces admin roles and CSRF.
- Public users cannot read draft or archived series, seasons, or episodes.
- Episode media upload rejects unauthorized users, invalid chunks, path traversal, and mismatched episode IDs.
- Local episode playback supports byte ranges and correct MIME/length headers.
- Google Drive episode media is not enabled until token handling, picker ownership, streaming, deletion semantics, and integration tests are complete.
- Signed-in episode progress is isolated by user and episode; anonymous users cannot read or write another user's progress.
- Auto-next respects the user's preference and season/series ordering.
- Admin UI is tested at desktop and mobile widths to prevent blank-page regressions.

## Implementation sequence

1. [x] Add schema migration and migration smoke tests.
2. Add public read-only series API and API tests.
3. Add admin series/season/episode CRUD and authorization tests.
4. Add episode media upload and local playback.
5. Add episode progress and watch-page experience.
6. Add Google Drive episode support only after a separate security review.
7. Run full movie regression tests and manual browser checks before merging.

No production deployment is authorized by this design document.
