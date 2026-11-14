<?php
declare(strict_types=1);

require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'backend' . DIRECTORY_SEPARATOR . 'bootstrap.php';

$pdo = new PDO('sqlite::memory:');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->exec(
    'CREATE TABLE login_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        ip_address TEXT NOT NULL,
        attempted_at INTEGER NOT NULL
    )'
);

$now = time();
$cutoff = $now - 900;
$insert = $pdo->prepare(
    'INSERT INTO login_attempts(email, ip_address, attempted_at) VALUES (?, ?, ?)'
);
$assert = static function (bool $condition, string $message): void {
    if (!$condition) {
        throw new RuntimeException($message);
    }
};

// Existing email + IP limit remains independently enforced.
$insert->execute(['pair@example.test', '203.0.113.10', $now]);
$assert(!login_attempts_blocked($pdo, 'pair@example.test', '203.0.113.10', $cutoff, 2), 'Pair limit blocked too early.');
$insert->execute(['pair@example.test', '203.0.113.10', $now]);
$assert(login_attempts_blocked($pdo, 'pair@example.test', '203.0.113.10', $cutoff, 2), 'Pair limit was not enforced.');

// The same account is limited across different source IP addresses.
$pdo->exec('DELETE FROM login_attempts');
for ($i = 1; $i <= 4; $i++) {
    $insert->execute(['account@example.test', '198.51.100.' . $i, $now]);
}
$assert(login_attempts_blocked($pdo, 'account@example.test', '198.51.100.99', $cutoff, 2), 'Per-account limit was not enforced across IPs.');

// One source IP is limited across many different account names.
$pdo->exec('DELETE FROM login_attempts');
for ($i = 1; $i <= 20; $i++) {
    $insert->execute(['user' . $i . '@example.test', '192.0.2.55', $now]);
}
$assert(login_attempts_blocked($pdo, 'new-account@example.test', '192.0.2.55', $cutoff, 2), 'Per-IP limit was not enforced across accounts.');

// Attempts outside the configured time window must not count.
$pdo->exec('DELETE FROM login_attempts');
$insert->execute(['old@example.test', '203.0.113.20', $cutoff - 1]);
$assert(!login_attempts_blocked($pdo, 'old@example.test', '203.0.113.20', $cutoff, 2), 'Expired attempt was counted.');

fwrite(STDOUT, "ULmovi login rate-limit smoke test passed.\n");
