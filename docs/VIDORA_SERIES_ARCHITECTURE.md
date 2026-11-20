# VIDORA Series Architecture

## Status

The additive SQLite schema migration v11 and initial public read-only series catalog endpoints are implemented. Protected admin metadata endpoints now support series/season/episode create, update, delete, and hierarchy reads. A separate VIDORA series admin page is implemented and linked from the existing admin sidebar. The admin page now supports chunked MP4/WebM episode uploads with SHA-256 chunk checks and private local storage. Public published-episode streaming uses byte-range responses; a public catalog, watch page, signed-in progress/resume, and auto-next are implemented. End-to-end browser and Alwaysdata verification remain outstanding. Public endpoints return published series and episodes only, and never expose private file paths or Google Drive IDs. Continue in small, independently tested pull-request commits.

## Goals

- Keep existing movies and movie playback working unchanged.
- Add series as a first-class catalog item with seasons and episodes.
- Allow public browsing and playback without requiring an account.
- Allow signed-in users to save episode progress and resume watching.
- Support an explicit next-episode action and optional auto-next.
- Preserve admin-only management and auditability.

## Data model proposal

Use additive SQLite migrations. The current schema is version 11. Migration v11 adds upload target metadata to the existing chunk-upload sessions; existing movie uploads default to the `movie` target and are not redirected. The additive v10 migration creates series, seasons, episodes, episode files, and per-user episode progress tables. Migration v11 adds `target_type`, `target_id`, and `target_quality` to upload sessions, with a backward-compatible `movie` default. Fresh installs and upgrades from v6, v7, and v9 pass the GitHub Actions migration regression suite. The public `get_series` and `get_series_details` actions are read-only; they filter out draft content and omit storage paths and Drive identifiers. Admin actions (`admin_get_series`, `admin_get_series_details`, `admin_save_series`, `admin_delete_series`, `admin_save_season`, `admin_delete_season`, `admin_save_episode`, and `admin_delete_episode`) require the existing admin role and POST+CSRF for writes. The separate `public/vidora-series-admin.html` page consumes these actions; it uses DOM text nodes rather than injecting API data as HTML.

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

Anonymous playback is public and does not create user rows or persistent personal progress. Signed-in progress is saved separately in `episode_watch_progress` and completed episodes clear their resume position. If anonymous resume is later required, it must be designed separately with privacy and retention limits.

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
- Episode media uploads reuse the verified chunk transport, enforce admin ownership, verify every chunk SHA-256, inspect the assembled MP4/WebM MIME and FFprobe metadata, and save into a private `episode-videos` storage directory. Public streaming is limited to published series/episodes and resolves files through the private storage path guard.

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
