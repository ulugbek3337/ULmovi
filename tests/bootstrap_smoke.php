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
    if ($version !== 7) {
        throw new RuntimeException('Expected schema version 7, got ' . $version);
    }
    $table = $pdo->query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'registration_attempts'")->fetchColumn();
    if ($table !== 'registration_attempts') {
        throw new RuntimeException('Registration rate-limit table was not created.');
    }

    $jobsTable = $pdo->query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'video_processing_jobs'")->fetchColumn();
    if ($jobsTable !== 'video_processing_jobs') {
        throw new RuntimeException('Video processing job queue table was not created.');
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

    // Verify an existing v6 database can be upgraded idempotently to v7.
    $pdo->exec('PRAGMA user_version = 6');
    migrate_database($pdo);
    $upgradedVersion = (int)$pdo->query('PRAGMA user_version')->fetchColumn();
    if ($upgradedVersion !== 7) {
        throw new RuntimeException('Existing v6 database did not upgrade to v7.');
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
