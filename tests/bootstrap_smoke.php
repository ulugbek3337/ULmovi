<?php
declare(strict_types=1);

$root = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'ulmovi-ci-' . bin2hex(random_bytes(8));
$dbDirectory = $root . DIRECTORY_SEPARATOR . 'db';
if (!mkdir($dbDirectory, 0700, true) && !is_dir($dbDirectory)) {
    throw new RuntimeException('Could not create temporary test directory.');
}
$dbFile = $dbDirectory . DIRECTORY_SEPARATOR . 'ulmovi.sqlite';
putenv('ULMOVI_DB_PATH=' . $dbFile);
require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'backend' . DIRECTORY_SEPARATOR . 'bootstrap.php';

try {
    $pdo = database();
    $version = (int)$pdo->query('PRAGMA user_version')->fetchColumn();
    if ($version !== 10) {
        throw new RuntimeException('Expected schema version 10, got ' . $version);
    }
    $movieFileColumns = array_column($pdo->query('PRAGMA table_info(movie_files)')->fetchAll(PDO::FETCH_ASSOC), 'name');
    foreach (['source_type', 'drive_file_id'] as $column) {
        if (!in_array($column, $movieFileColumns, true)) {
            throw new RuntimeException('Google Drive movie_files column was not created: ' . $column);
        }
    }

    $table = $pdo->query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'registration_attempts'")->fetchColumn();
    if ($table !== 'registration_attempts') {
        throw new RuntimeException('Registration rate-limit table was not created.');
    }

    $jobsTable = $pdo->query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'video_processing_jobs'")->fetchColumn();
    if ($jobsTable !== 'video_processing_jobs') {
        throw new RuntimeException('Video processing job queue table was not created.');
    }
    $watchTable = $pdo->query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'watch_progress'")->fetchColumn();
    if ($watchTable !== 'watch_progress') {
        throw new RuntimeException('Watch progress table was not created.');
    }
    $watchIndex = $pdo->query("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_watch_progress_user_updated'")->fetchColumn();
    if ($watchIndex !== 'idx_watch_progress_user_updated') {
        throw new RuntimeException('Watch progress index was not created.');
    }

    $pdo->exec("INSERT INTO movies(title) VALUES ('CI queue smoke test')");
    $movieId = (int)$pdo->lastInsertId();
    $job = $pdo->prepare(
        'INSERT INTO video_processing_jobs(movie_id, source_path, metadata_json, status, created_at, updated_at)
         VALUES (?, ?, ?, "pending", ?, ?)'
    );
    $job->execute([$movieId, 'videos/test.mp4', '{"height":1080}', time(), time()]);
    $jobStatus = $pdo->query('SELECT status FROM video_processing_jobs WHERE movie_id = ' . $movieId)->fetchColumn();
    if ($jobStatus !== 'pending') {
        throw new RuntimeException('Video processing job could not be queued.');
    }

    // Simulate a PR #1 v7 database: it has the video queue and registration
    // throttle tables, but not PR #3's watch-progress table.
    $pdo->exec('DROP TABLE watch_progress');
    $pdo->exec('PRAGMA user_version = 7');
    migrate_database($pdo);
    $upgradedVersion = (int)$pdo->query('PRAGMA user_version')->fetchColumn();
    if ($upgradedVersion !== 10) {
        throw new RuntimeException('Existing v7 database did not upgrade to v9.');
    }
    $watchTable = $pdo->query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'watch_progress'")->fetchColumn();
    if ($watchTable !== 'watch_progress') {
        throw new RuntimeException('v7 to v8 migration did not add watch progress.');
    }

    // Simulate a PR #3 v6 database: watch history exists, while security v7
    // tables do not. Existing watch history must remain intact.
    $pdo->exec("INSERT INTO users(name, email, password) VALUES ('Migration User', 'migration@example.test', 'hash')");
    $userId = (int)$pdo->lastInsertId();
    $pdo->exec("INSERT INTO movies(title) VALUES ('Migration Movie')");
    $movieId = (int)$pdo->lastInsertId();
    $pdo->prepare('INSERT INTO watch_progress(user_id, movie_id, position_seconds, duration_seconds) VALUES (?, ?, ?, ?)')
        ->execute([$userId, $movieId, 123.5, 600.0]);
    $pdo->exec('DROP TABLE video_processing_jobs');
    $pdo->exec('DROP TABLE registration_attempts');
    $pdo->exec('PRAGMA user_version = 6');
    migrate_database($pdo);
    $upgradedVersion = (int)$pdo->query('PRAGMA user_version')->fetchColumn();
    if ($upgradedVersion !== 10) {
        throw new RuntimeException('Existing v6 database did not upgrade to v9.');
    }
    $savedPosition = $pdo->query('SELECT position_seconds FROM watch_progress WHERE user_id = ' . $userId . ' AND movie_id = ' . $movieId)->fetchColumn();
    if ((float)$savedPosition !== 123.5) {
        throw new RuntimeException('Existing watch history was not preserved during v6 to v8 migration.');
    }
    foreach (['video_processing_jobs', 'registration_attempts', 'watch_progress'] as $tableName) {
        $exists = $pdo->query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = " . $pdo->quote($tableName))->fetchColumn();
        if ($exists !== $tableName) {
            throw new RuntimeException('Missing consolidated schema table: ' . $tableName);
        }
    }

    // A v10 database remains stable on repeated migration.
    migrate_database($pdo);
    if ((int)$pdo->query('PRAGMA user_version')->fetchColumn() !== 9) {
        throw new RuntimeException('Repeated migration changed the v10 schema version.');
    }

    // VIDORA series schema: relationships, uniqueness, and cascading deletes.
    foreach (['series', 'seasons', 'episodes', 'episode_files', 'episode_watch_progress'] as $tableName) {
        $exists = $pdo->query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = " . $pdo->quote($tableName))->fetchColumn();
        if ($exists !== $tableName) {
            throw new RuntimeException('Missing VIDORA series table: ' . $tableName);
        }
    }
    $pdo->exec("INSERT INTO series(title, status) VALUES ('VIDORA Test Series', 'published')");
    $seriesId = (int)$pdo->lastInsertId();
    $pdo->prepare('INSERT INTO seasons(series_id, season_number, title) VALUES (?, ?, ?)')
        ->execute([$seriesId, 1, 'Season 1']);
    $seasonId = (int)$pdo->lastInsertId();
    $pdo->prepare("INSERT INTO episodes(season_id, episode_number, title, status, duration_seconds) VALUES (?, ?, ?, 'published', ?)")
        ->execute([$seasonId, 1, 'Episode 1', 1800]);
    $episodeId = (int)$pdo->lastInsertId();
    $pdo->prepare('INSERT INTO episode_files(episode_id, quality, file_path, mime_type, file_size) VALUES (?, ?, ?, ?, ?)')
        ->execute([$episodeId, '1080p', 'episodes/test.mp4', 'video/mp4', 1024]);
    $pdo->prepare('INSERT INTO episode_watch_progress(user_id, episode_id, position_seconds, duration_seconds) VALUES (?, ?, ?, ?)')
        ->execute([$userId, $episodeId, 120.5, 1800.0]);

    $duplicateRejected = false;
    try {
        $pdo->prepare('INSERT INTO seasons(series_id, season_number) VALUES (?, ?)')->execute([$seriesId, 1]);
    } catch (PDOException $exception) {
        $duplicateRejected = true;
    }
    if (!$duplicateRejected) {
        throw new RuntimeException('Duplicate season numbers were not rejected.');
    }

    $progress = $pdo->prepare('SELECT position_seconds FROM episode_watch_progress WHERE user_id = ? AND episode_id = ?');
    $progress->execute([$userId, $episodeId]);
    if ((float)$progress->fetchColumn() !== 120.5) {
        throw new RuntimeException('Episode watch progress was not saved.');
    }

    $pdo->prepare('DELETE FROM series WHERE id = ?')->execute([$seriesId]);
    foreach (['seasons', 'episodes', 'episode_files', 'episode_watch_progress'] as $tableName) {
        $count = (int)$pdo->query('SELECT COUNT(*) FROM ' . $tableName)->fetchColumn();
        if ($count !== 0) {
            throw new RuntimeException('Series deletion did not cascade to ' . $tableName . '.');
        }
    }
    if ($pdo->query('PRAGMA foreign_key_check')->fetchAll(PDO::FETCH_ASSOC) !== []) {
        throw new RuntimeException('VIDORA series migration created foreign-key violations.');
    }

    // A database created by a newer application must be rejected.
    $pdo->exec('PRAGMA user_version = 11');
    try {
        migrate_database($pdo);
        throw new RuntimeException('A newer database schema version was unexpectedly accepted.');
    } catch (RuntimeException $exception) {
        if (!str_contains($exception->getMessage(), 'ushbu ilova qo‘llaydigan migratsiya')) {
            throw $exception;
        }
    }

    fwrite(STDOUT, "ULmovi SQLite migration smoke test passed.\n");
} finally {
    unset($pdo);
    foreach ([$dbFile, $dbFile . '-journal', $dbFile . '-wal', $dbFile . '-shm'] as $file) {
        if (is_file($file)) {
            @unlink($file);
        }
    }
    @rmdir($dbDirectory);
    @rmdir($root);
}
