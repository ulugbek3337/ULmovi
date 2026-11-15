<?php
declare(strict_types=1);

putenv('ULMOVI_DB_PATH=:memory:');
require_once __DIR__ . '/../backend/bootstrap.php';

$pdo = database();
$version = (int)$pdo->query('PRAGMA user_version')->fetchColumn();
if ($version !== 8) {
    throw new RuntimeException('Profile schema migration version is not 8.');
}

$pdo->exec("INSERT INTO users(name, email, password) VALUES ('Test User', 'profile-smoke@example.test', 'hash')");
$userId = (int)$pdo->lastInsertId();
$pdo->exec("INSERT INTO movies(title) VALUES ('Profile Smoke Movie')");
$movieId = (int)$pdo->lastInsertId();

$save = $pdo->prepare(
    'INSERT INTO watch_progress(user_id, movie_id, position_seconds, duration_seconds)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, movie_id) DO UPDATE SET
        position_seconds = excluded.position_seconds,
        duration_seconds = excluded.duration_seconds,
        updated_at = CURRENT_TIMESTAMP'
);
$save->execute([$userId, $movieId, 42.5, 120.0]);
$save->execute([$userId, $movieId, 55.0, 120.0]);

$statement = $pdo->prepare('SELECT position_seconds, duration_seconds FROM watch_progress WHERE user_id = ? AND movie_id = ?');
$statement->execute([$userId, $movieId]);
$row = $statement->fetch();
if (!$row || (float)$row['position_seconds'] !== 55.0 || (float)$row['duration_seconds'] !== 120.0) {
    throw new RuntimeException('Watch progress insert/update did not persist expected values.');
}

$pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$userId]);
$statement = $pdo->prepare('SELECT COUNT(*) FROM watch_progress WHERE user_id = ?');
$statement->execute([$userId]);
if ((int)$statement->fetchColumn() !== 0) {
    throw new RuntimeException('Watch progress did not cascade on user deletion.');
}

echo "Profile progress smoke test passed.\n";
