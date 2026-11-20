<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/backend/series.php';

$pdo = new PDO('sqlite::memory:');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
$pdo->exec('PRAGMA foreign_keys = ON');
$pdo->exec("CREATE TABLE series (
    id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT, year INTEGER,
    genre TEXT, poster_path TEXT, poster_url TEXT, status TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)");
$pdo->exec("CREATE TABLE seasons (
    id INTEGER PRIMARY KEY, series_id INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
    season_number INTEGER NOT NULL, title TEXT, description TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)");
$pdo->exec("CREATE TABLE episodes (
    id INTEGER PRIMARY KEY, season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    episode_number INTEGER NOT NULL, title TEXT NOT NULL, description TEXT,
    duration_seconds INTEGER, poster_path TEXT, status TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)");
$pdo->exec("CREATE TABLE episode_files (
    id INTEGER PRIMARY KEY, episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    quality TEXT NOT NULL, file_path TEXT NOT NULL, mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL, source_type TEXT NOT NULL DEFAULT 'local', drive_file_id TEXT
)");

$pdo->exec("INSERT INTO series(id, title, genre, status, poster_url) VALUES
    (1, 'VIDORA Ochiq Serial', 'Drama', 'published', 'https://cdn.example.test/poster.jpg'),
    (2, 'Yashirin Draft', 'Drama', 'draft', NULL)");
$pdo->exec("INSERT INTO seasons(id, series_id, season_number, title) VALUES
    (11, 1, 1, 'Birinchi mavsum'), (12, 2, 1, 'Draft mavsum')");
$pdo->exec("INSERT INTO episodes(id, season_id, episode_number, title, duration_seconds, status) VALUES
    (101, 11, 1, 'Ochiq qism', 1800, 'published'),
    (102, 11, 2, 'Yashirin qism', 1800, 'draft'),
    (201, 12, 1, 'Draft qism', 900, 'published')");
$pdo->exec("INSERT INTO episode_files(episode_id, quality, file_path, mime_type, file_size, drive_file_id)
    VALUES (101, '1080p', '/private/storage/episode.mp4', 'video/mp4', 4096, 'private-drive-id')");

$list = vidora_list_published_series($pdo);
if (count($list) !== 1 || (int)$list[0]['id'] !== 1 || (int)$list[0]['episode_count'] !== 1) {
    throw new RuntimeException('Public series listing exposed a draft or returned incorrect counts.');
}
$filtered = vidora_list_published_series($pdo, 'Drama', 1, 0);
if (count($filtered) !== 1) {
    throw new RuntimeException('Public series search did not return the matching published series.');
}
$detail = vidora_get_published_series($pdo, 1);
if ($detail === null || count($detail['seasons']) !== 1 || count($detail['seasons'][0]['episodes']) !== 1) {
    throw new RuntimeException('Series detail did not filter unpublished seasons/episodes.');
}
$episode = $detail['seasons'][0]['episodes'][0];
if ((int)$episode['id'] !== 101 || !$episode['has_video'] || $episode['qualities'] !== ['1080p']) {
    throw new RuntimeException('Published episode metadata or available qualities are incorrect.');
}
$serialized = json_encode($detail, JSON_THROW_ON_ERROR);
foreach (['/private/storage/episode.mp4', 'private-drive-id', 'file_path', 'drive_file_id'] as $secret) {
    if (str_contains($serialized, $secret)) {
        throw new RuntimeException('Public series API leaked private media storage metadata.');
    }
}
if (vidora_get_published_series($pdo, 2) !== null || vidora_get_published_series($pdo, 0) !== null) {
    throw new RuntimeException('Draft or invalid series ID was exposed.');
}

fwrite(STDOUT, "VIDORA public series API smoke test passed.\n");
