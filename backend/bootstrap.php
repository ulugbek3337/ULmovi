<?php
declare(strict_types=1);

$isHttps = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || getenv('ULMOVI_FORCE_SECURE_COOKIES') === '1';
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
session_set_cookie_params([
    'httponly' => true,
    'secure' => $isHttps,
    'samesite' => 'Lax',
    'path' => '/',
]);
session_start();

function respond(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function database(): PDO
{
    static $pdo;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dbFile = getenv('ULMOVI_DB_PATH') ?: __DIR__ . '/ulmovi.db';
    $dbDirectory = dirname($dbFile);
    if (!is_dir($dbDirectory) && !mkdir($dbDirectory, 0700, true) && !is_dir($dbDirectory)) {
        throw new RuntimeException('Ma’lumotlar bazasi papkasini yaratib bo‘lmadi.');
    }

    $pdo = new PDO('sqlite:' . $dbFile);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('PRAGMA busy_timeout = 5000');
    migrate_database($pdo);
    return $pdo;
}

function migrate_database(PDO $pdo): void
{
    $currentVersion = (int)$pdo->query('PRAGMA user_version')->fetchColumn();
    if ($currentVersion > 6) {
        throw new RuntimeException('Ma’lumotlar bazasi ushbu ilova qo‘llaydigan migratsiya versiyasidan yangi.');
    }

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS movies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            genre TEXT,
            year INTEGER,
            rating REAL,
            poster_url TEXT,
            video_url TEXT,
            description TEXT
        )'
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            status TEXT NOT NULL DEFAULT 'active'
        )"
    );

    $movieColumns = [
        'poster_path' => 'TEXT',
        'video_path' => 'TEXT',
        'video_mime' => 'TEXT',
        'created_at' => 'TEXT',
        'updated_at' => 'TEXT',
        'views_count' => 'INTEGER NOT NULL DEFAULT 0',
        'downloads_count' => 'INTEGER NOT NULL DEFAULT 0',
    ];
    $userColumns = [
        'created_at' => 'TEXT',
        'last_login_at' => 'TEXT',
        'session_version' => 'INTEGER NOT NULL DEFAULT 0',
    ];
    foreach (['movies' => $movieColumns, 'users' => $userColumns] as $table => $columns) {
        $existing = array_column($pdo->query('PRAGMA table_info(' . $table . ')')->fetchAll(), 'name');
        foreach ($columns as $name => $definition) {
            if (!in_array($name, $existing, true)) {
                $pdo->exec('ALTER TABLE ' . $table . ' ADD COLUMN ' . $name . ' ' . $definition);
            }
        }
    }
    $pdo->exec("UPDATE users SET role = 'user' WHERE role NOT IN ('user', 'admin', 'super_admin')");
    $pdo->exec("UPDATE movies SET created_at = COALESCE(created_at, datetime('now'))");
    $pdo->exec("UPDATE users SET created_at = COALESCE(created_at, datetime('now'))");

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS movie_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
            quality TEXT NOT NULL,
            file_path TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(movie_id, quality)
        )'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS likes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, movie_id)
        )'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS ratings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
            score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, movie_id)
        )'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
            body TEXT NOT NULL,
            is_hidden INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS advertisements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            image_url TEXT NOT NULL,
            destination_url TEXT NOT NULL,
            placement TEXT NOT NULL CHECK(placement IN ("home", "between_sections", "movie_detail")),
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )'
    );
    $adColumns = array_column($pdo->query('PRAGMA table_info(advertisements)')->fetchAll(), 'name');
    if (!in_array('image_path', $adColumns, true)) {
        $pdo->exec('ALTER TABLE advertisements ADD COLUMN image_path TEXT');
    }
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS subscription_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            description TEXT NOT NULL DEFAULT "",
            price_minor INTEGER NOT NULL DEFAULT 0,
            duration_days INTEGER NOT NULL DEFAULT 30,
            is_active INTEGER NOT NULL DEFAULT 1
        )'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS user_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            plan_id INTEGER NOT NULL REFERENCES subscription_plans(id),
            status TEXT NOT NULL DEFAULT "inactive",
            starts_at TEXT,
            expires_at TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS download_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            event TEXT NOT NULL,
            details TEXT NOT NULL DEFAULT "",
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS login_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            ip_address TEXT NOT NULL,
            attempted_at INTEGER NOT NULL
        )'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS system_settings (
            setting_key TEXT PRIMARY KEY,
            setting_value TEXT NOT NULL,
            updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS upload_sessions (
            upload_id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            genre TEXT NOT NULL,
            year INTEGER NOT NULL,
            description TEXT NOT NULL DEFAULT "",
            total_size INTEGER NOT NULL CHECK(total_size BETWEEN 1 AND 6442450944),
            chunk_size INTEGER NOT NULL CHECK(chunk_size BETWEEN 1048576 AND 16777216),
            chunk_count INTEGER NOT NULL CHECK(chunk_count > 0),
            status TEXT NOT NULL DEFAULT "uploading" CHECK(status IN ("uploading", "assembling", "completed", "failed", "cancelled")),
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL
        )'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS upload_chunks (
            upload_id TEXT NOT NULL REFERENCES upload_sessions(upload_id) ON DELETE CASCADE,
            chunk_index INTEGER NOT NULL CHECK(chunk_index >= 0),
            chunk_size INTEGER NOT NULL CHECK(chunk_size > 0),
            sha256 TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY(upload_id, chunk_index)
        )'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token_hash TEXT NOT NULL UNIQUE,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            used_at INTEGER
        )'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS password_reset_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            ip_address TEXT NOT NULL,
            attempted_at INTEGER NOT NULL
        )'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS registration_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip_address TEXT NOT NULL,
            attempted_at INTEGER NOT NULL
        )'
    );
    $settingDefaults = [
        'allow_registration' => '1',
        'maintenance_mode' => '0',
        'ffmpeg_enabled' => '1',
        'ffmpeg_path' => '',
        'ffprobe_path' => '',
        'login_attempt_limit' => '8',
        'login_window_minutes' => '15',
    ];
    $settingStatement = $pdo->prepare('INSERT OR IGNORE INTO system_settings(setting_key, setting_value) VALUES (?, ?)');
    foreach ($settingDefaults as $key => $value) {
        $settingStatement->execute([$key, $value]);
    }
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_movies_created_at ON movies(created_at DESC)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_comments_movie_visible ON comments(movie_id, is_hidden, created_at DESC)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_activity_created_at ON activity_logs(created_at DESC)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_login_attempts_key_time ON login_attempts(email, ip_address, attempted_at)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_upload_sessions_user_status ON upload_sessions(user_id, status, expires_at)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_password_reset_user_expiry ON password_reset_tokens(user_id, expires_at)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_password_reset_attempts_key_time ON password_reset_attempts(email, ip_address, attempted_at)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_registration_attempts_ip_time ON registration_attempts(ip_address, attempted_at)');
    $pdo->exec("INSERT OR IGNORE INTO subscription_plans(name, description, price_minor, duration_days) VALUES ('free', 'Bepul tarif', 0, 0)");
    $pdo->exec('PRAGMA user_version = 6');
}

function require_method(string $method): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== $method) {
        header('Allow: ' . $method);
        respond(['success' => false, 'error' => 'So‘rov usuli qo‘llab-quvvatlanmaydi.'], 405);
    }
}

function post_string(string $key): string
{
    $value = $_POST[$key] ?? '';
    return is_string($value) ? $value : '';
}

function ini_size_bytes(string $value): int
{
    $value = trim($value);
    if ($value === '' || $value === '0') {
        return 0;
    }
    $unit = strtolower(substr($value, -1));
    $size = (float)$value;
    return (int)match ($unit) {
        'g' => $size * 1024 * 1024 * 1024,
        'm' => $size * 1024 * 1024,
        'k' => $size * 1024,
        default => $size,
    };
}

function ensure_csrf_token(): string
{
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function require_csrf_token(): void
{
    $provided = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    $expected = $_SESSION['csrf_token'] ?? '';
    if (!is_string($expected) || $expected === '' || !hash_equals($expected, $provided)) {
        respond(['success' => false, 'error' => 'So‘rov xavfsizlik tekshiruvidan o‘tmadi. Sahifani yangilang.'], 403);
    }
}

function current_user(PDO $pdo): ?array
{
    $userId = $_SESSION['user_id'] ?? null;
    if (!is_int($userId)) {
        return null;
    }
    $statement = $pdo->prepare("SELECT id, name, email, role, status, session_version FROM users WHERE id = ?");
    $statement->execute([$userId]);
    $user = $statement->fetch();
    if (!$user || $user['status'] !== 'active' || !isset($_SESSION['session_version'])
        || (int)$_SESSION['session_version'] !== (int)$user['session_version']) {
        $_SESSION = [];
        session_regenerate_id(true);
        return null;
    }
    $user['id'] = (int)$user['id'];
    $user['session_version'] = (int)$user['session_version'];
    return $user;
}

function require_user(PDO $pdo): array
{
    $user = current_user($pdo);
    if (!$user) {
        respond(['success' => false, 'error' => 'Bu amal uchun tizimga kiring.'], 401);
    }
    return $user;
}

function require_admin(PDO $pdo): array
{
    $user = require_user($pdo);
    if (!in_array($user['role'], ['admin', 'super_admin'], true)) {
        respond(['success' => false, 'error' => 'Bu amal uchun admin huquqi kerak.'], 403);
    }
    return $user;
}

function require_super_admin(PDO $pdo): array
{
    $user = require_admin($pdo);
    if ($user['role'] !== 'super_admin') {
        respond(['success' => false, 'error' => 'Bu amal faqat bosh super admin uchun.'], 403);
    }
    return $user;
}

function valid_https_url(string $value): bool
{
    if ($value === '') {
        return true;
    }
    $parts = parse_url($value);
    return filter_var($value, FILTER_VALIDATE_URL) !== false
        && isset($parts['scheme'], $parts['host'])
        && strtolower($parts['scheme']) === 'https';
}

function valid_youtube_embed_url(string $value): bool
{
    if ($value === '') {
        return true;
    }
    $parts = parse_url($value);
    $host = strtolower($parts['host'] ?? '');
    return filter_var($value, FILTER_VALIDATE_URL) !== false
        && strtolower($parts['scheme'] ?? '') === 'https'
        && in_array($host, ['youtube.com', 'www.youtube.com', 'www.youtube-nocookie.com'], true)
        && str_starts_with($parts['path'] ?? '', '/embed/');
}

function storage_directory(): string
{
    $configured = getenv('ULMOVI_STORAGE_PATH');
    $directory = $configured !== false && $configured !== ''
        ? $configured
        : dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'ULmovi-storage';
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new RuntimeException('Xavfsiz fayl saqlash papkasini yaratib bo‘lmadi.');
    }
    $resolved = realpath($directory);
    $publicRoot = realpath(dirname(__DIR__) . DIRECTORY_SEPARATOR . 'public');
    if ($resolved === false || ($publicRoot !== false
        && str_starts_with($resolved . DIRECTORY_SEPARATOR, rtrim($publicRoot, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR))) {
        throw new RuntimeException('Fayl saqlash joyi public papkadan tashqarida bo‘lishi kerak.');
    }
    return rtrim($resolved, DIRECTORY_SEPARATOR);
}

function save_upload(array $file, array $allowedMimes, int $maxBytes, string $kind): array
{
    if (!isset($file['error']) || is_array($file['error']) || $file['error'] !== UPLOAD_ERR_OK) {
        $message = match ($file['error'] ?? UPLOAD_ERR_NO_FILE) {
            UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'Fayl server ruxsat bergan hajmdan katta.',
            UPLOAD_ERR_PARTIAL => 'Fayl to‘liq yuklanmadi.',
            default => 'Fayl yuklanmadi.',
        };
        throw new DomainException($message);
    }
    if (!isset($file['tmp_name'], $file['size']) || (int)$file['size'] < 1 || (int)$file['size'] > $maxBytes) {
        throw new DomainException('Fayl hajmi ruxsat etilgan chegaradan tashqarida.');
    }
    if (!is_uploaded_file((string)$file['tmp_name'])) {
        throw new DomainException('Yuklangan fayl manbasi noto‘g‘ri.');
    }
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file((string)$file['tmp_name']);
    if (!is_string($mime) || !isset($allowedMimes[$mime])) {
        throw new DomainException('Fayl formati qo‘llab-quvvatlanmaydi.');
    }
    $extension = $allowedMimes[$mime];
    $filename = bin2hex(random_bytes(24)) . '.' . $extension;
    $relativePath = $kind . DIRECTORY_SEPARATOR . $filename;
    $directory = storage_directory() . DIRECTORY_SEPARATOR . $kind;
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new RuntimeException('Fayl saqlash papkasini yaratib bo‘lmadi.');
    }
    $destination = $directory . DIRECTORY_SEPARATOR . $filename;
    if (!move_uploaded_file((string)$file['tmp_name'], $destination)) {
        throw new RuntimeException('Yuklangan faylni saqlab bo‘lmadi.');
    }
    return [
        'path' => $relativePath,
        'mime' => $mime,
        'size' => (int)$file['size'],
        'absolute_path' => $destination,
    ];
}

function resolve_storage_file(string $relativePath): string
{
    if ($relativePath === '' || str_contains($relativePath, "\0")) {
        throw new RuntimeException('Fayl yo‘li noto‘g‘ri.');
    }
    $root = realpath(storage_directory());
    $candidate = realpath(storage_directory() . DIRECTORY_SEPARATOR . $relativePath);
    if ($root === false || $candidate === false
        || !str_starts_with($candidate, $root . DIRECTORY_SEPARATOR)
        || !is_file($candidate) || !is_readable($candidate)) {
        throw new RuntimeException('Fayl topilmadi.');
    }
    return $candidate;
}

function record_activity(PDO $pdo, ?int $userId, string $event, string $details = ''): void
{
    $statement = $pdo->prepare('INSERT INTO activity_logs(user_id, event, details) VALUES (?, ?, ?)');
    $statement->execute([$userId, $event, $details]);
}

function system_setting(PDO $pdo, string $key, string $default = ''): string
{
    $statement = $pdo->prepare('SELECT setting_value FROM system_settings WHERE setting_key = ?');
    $statement->execute([$key]);
    $value = $statement->fetchColumn();
    return is_string($value) ? $value : $default;
}

function system_settings(PDO $pdo): array
{
    $settings = [];
    foreach ($pdo->query('SELECT setting_key, setting_value FROM system_settings') as $row) {
        $settings[$row['setting_key']] = $row['setting_value'];
    }
    return $settings;
}
