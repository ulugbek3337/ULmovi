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
    if ($version !== 6) {
        throw new RuntimeException('Expected schema version 6, got ' . $version);
    }
    $table = $pdo->query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'registration_attempts'")->fetchColumn();
    if ($table !== 'registration_attempts') {
        throw new RuntimeException('Registration rate-limit table was not created.');
    }

    // Verify an existing v5 database can be upgraded idempotently to v6.
    $pdo->exec('PRAGMA user_version = 5');
    migrate_database($pdo);
    $upgradedVersion = (int)$pdo->query('PRAGMA user_version')->fetchColumn();
    if ($upgradedVersion !== 6) {
        throw new RuntimeException('Existing v5 database did not upgrade to v6.');
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
