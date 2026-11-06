<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/bootstrap.php';

$name = trim((string)getenv('ULMOVI_ADMIN_NAME'));
$email = strtolower(trim((string)getenv('ULMOVI_ADMIN_EMAIL')));
$password = (string)getenv('ULMOVI_ADMIN_PASSWORD');

if ($name === '' || mb_strlen($name) > 100 || !filter_var($email, FILTER_VALIDATE_EMAIL)
    || strlen($password) < 12 || strlen($password) > 200) {
    fwrite(STDERR, "ULMOVI_ADMIN_NAME, ULMOVI_ADMIN_EMAIL va kamida 12 belgili ULMOVI_ADMIN_PASSWORD kerak.\n");
    exit(1);
}

try {
    $pdo = database();
    $activeSuperAdmins = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role = 'super_admin' AND status = 'active'")->fetchColumn();
    if ($activeSuperAdmins > 0) {
        fwrite(STDERR, "Faol super admin allaqachon mavjud. Hech qanday o‘zgarish qilinmadi.\n");
        exit(1);
    }

    $statement = $pdo->prepare('SELECT id, password FROM users WHERE email = ?');
    $statement->execute([$email]);
    $existing = $statement->fetch();
    if ($existing) {
        if (!password_verify($password, $existing['password'])) {
            fwrite(STDERR, "Bu email mavjud, lekin berilgan parol mos kelmadi. Hisob o‘zgartirilmadi.\n");
            exit(1);
        }
        $pdo->prepare("UPDATE users SET name = ?, role = 'super_admin', status = 'active' WHERE id = ?")
            ->execute([$name, $existing['id']]);
        $userId = (int)$existing['id'];
    } else {
        $statement = $pdo->prepare(
            "INSERT INTO users(name, email, password, role, status) VALUES (?, ?, ?, 'super_admin', 'active')"
        );
        $statement->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT)]);
        $userId = (int)$pdo->lastInsertId();
    }
    record_activity($pdo, $userId, 'initial_super_admin_created');
    fwrite(STDOUT, "Super admin hisobi xavfsiz yaratildi.\n");
} catch (Throwable $exception) {
    error_log('ULmovi setup error: ' . $exception->getMessage());
    fwrite(STDERR, "Super adminni yaratib bo‘lmadi. PHP xatolik jurnalini tekshiring.\n");
    exit(1);
}
