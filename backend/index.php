<?php
declare(strict_types=1);

header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
header('Referrer-Policy: same-origin');
header('X-Frame-Options: DENY');
header('Permissions-Policy: camera=(), microphone=(), geolocation=()');

require_once __DIR__ . '/bootstrap.php';

function stream_file(string $path, string $mime, string $downloadName = ''): never
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }
    $size = filesize($path);
    if ($size === false) {
        respond(['success' => false, 'error' => 'Faylni o‘qib bo‘lmadi.'], 500);
    }

    $start = 0;
    $end = $size - 1;
    $status = 200;
    $range = $_SERVER['HTTP_RANGE'] ?? '';
    if ($range !== '') {
        if (!preg_match('/^bytes=(\d*)-(\d*)$/', $range, $matches)
            || ($matches[1] === '' && $matches[2] === '')) {
            header('Content-Range: bytes */' . $size);
            respond(['success' => false, 'error' => 'Video oralig‘i noto‘g‘ri.'], 416);
        }
        if ($matches[1] === '') {
            $length = min((int)$matches[2], $size);
            $start = $size - $length;
        } else {
            $start = (int)$matches[1];
            $end = $matches[2] === '' ? $end : min((int)$matches[2], $end);
        }
        if ($start > $end || $start >= $size) {
            header('Content-Range: bytes */' . $size);
            respond(['success' => false, 'error' => 'Video oralig‘i mavjud emas.'], 416);
        }
        $status = 206;
    }

    http_response_code($status);
    header('Content-Type: ' . $mime);
    header('Accept-Ranges: bytes');
    header('Content-Length: ' . ($end - $start + 1));
    header('X-Content-Type-Options: nosniff');
    if ($status === 206) {
        header("Content-Range: bytes {$start}-{$end}/{$size}");
    }
    if ($downloadName !== '') {
        header('Content-Disposition: attachment; filename="' . rawurlencode($downloadName) . '"');
    } else {
        header('Content-Disposition: inline');
    }

    $handle = fopen($path, 'rb');
    if ($handle === false) {
        exit;
    }
    fseek($handle, $start);
    $remaining = $end - $start + 1;
    while ($remaining > 0 && !feof($handle)) {
        $chunk = fread($handle, min(1024 * 1024, $remaining));
        if ($chunk === false || $chunk === '') {
            break;
        }
        echo $chunk;
        $remaining -= strlen($chunk);
        flush();
    }
    fclose($handle);
    exit;
}

function get_id(string $key): int
{
    $value = filter_var($_GET[$key] ?? $_POST[$key] ?? null, FILTER_VALIDATE_INT);
    if ($value === false || $value === null || $value < 1) {
        respond(['success' => false, 'error' => 'So‘rov ma’lumoti noto‘g‘ri.'], 422);
    }
    return $value;
}

function require_movie_exists(PDO $pdo, int $movieId): void
{
    $statement = $pdo->prepare('SELECT 1 FROM movies WHERE id = ?');
    $statement->execute([$movieId]);
    if ($statement->fetchColumn() === false) {
        respond(['success' => false, 'error' => 'Kino topilmadi.'], 404);
    }
}

function video_file(PDO $pdo, int $movieId, string $quality): array
{
    $statement = $pdo->prepare('SELECT file_path, mime_type FROM movie_files WHERE movie_id = ? AND quality = ?');
    $statement->execute([$movieId, $quality]);
    $file = $statement->fetch();
    if (!$file) {
        respond(['success' => false, 'error' => 'Tanlangan video sifati mavjud emas.'], 404);
    }
    return [resolve_storage_file($file['file_path']), $file['mime_type']];
}

function password_reset_url(string $token): ?string
{
    $baseUrl = trim((string)(getenv('ULMOVI_PUBLIC_URL') ?: ''));
    $parts = parse_url($baseUrl);
    $scheme = strtolower((string)($parts['scheme'] ?? ''));
    $host = strtolower((string)($parts['host'] ?? ''));
    $localHost = in_array($host, ['localhost', '127.0.0.1', '::1'], true);
    if (filter_var($baseUrl, FILTER_VALIDATE_URL) === false
        || !isset($parts['host']) || !in_array($scheme, $localHost ? ['http', 'https'] : ['https'], true)
        || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])) {
        return null;
    }
    return rtrim($baseUrl, '/') . '/reset-password.html?token=' . rawurlencode($token);
}

function send_password_reset_email(string $email, string $token): bool
{
    $resetUrl = password_reset_url($token);
    if ($resetUrl === null) {
        error_log('ULmovi password reset was not delivered: ULMOVI_PUBLIC_URL is invalid or missing.');
        return false;
    }
    $mode = strtolower(trim((string)(getenv('ULMOVI_MAIL_MODE') ?: '')));
    if ($mode === 'development_file') {
        $directory = storage_directory() . DIRECTORY_SEPARATOR . 'private_mail';
        if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
            error_log('ULmovi password reset development file could not be created.');
            return false;
        }
        foreach (new DirectoryIterator($directory) as $entry) {
            if ($entry->isFile() && $entry->getMTime() < time() - 86400) {
                @unlink($entry->getPathname());
            }
        }
        $path = $directory . DIRECTORY_SEPARATOR . 'reset-' . bin2hex(random_bytes(12)) . '.txt';
        $handle = @fopen($path, 'xb');
        if ($handle === false) {
            error_log('ULmovi password reset development file could not be opened.');
            return false;
        }
        fwrite($handle, $resetUrl . PHP_EOL);
        fflush($handle);
        fclose($handle);
        @chmod($path, 0600);
        return true;
    }
    if ($mode !== 'smtp') {
        error_log('ULmovi password reset email was not sent because mail mode is not configured.');
        return false;
    }

    $autoload = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'vendor' . DIRECTORY_SEPARATOR . 'autoload.php';
    if (!is_file($autoload)) {
        error_log('ULmovi password reset email dependency is missing; run composer install.');
        return false;
    }
    require_once $autoload;
    if (!class_exists(\PHPMailer\PHPMailer\PHPMailer::class)) {
        error_log('ULmovi password reset email dependency PHPMailer is unavailable.');
        return false;
    }

    try {
        $host = trim((string)(getenv('ULMOVI_SMTP_HOST') ?: ''));
        $username = (string)(getenv('ULMOVI_SMTP_USERNAME') ?: '');
        $password = (string)(getenv('ULMOVI_SMTP_PASSWORD') ?: '');
        $from = trim((string)(getenv('ULMOVI_MAIL_FROM') ?: ''));
        $fromName = trim((string)(getenv('ULMOVI_MAIL_FROM_NAME') ?: 'ULmovi'));
        $encryption = strtolower(trim((string)(getenv('ULMOVI_SMTP_ENCRYPTION') ?: 'tls')));
        $port = (int)(getenv('ULMOVI_SMTP_PORT') ?: 587);
        if ($host === '' || $username === '' || $password === '' || !filter_var($from, FILTER_VALIDATE_EMAIL)
            || !in_array($encryption, ['tls', 'ssl'], true) || $port < 1 || $port > 65535) {
            error_log('ULmovi password reset email configuration is incomplete.');
            return false;
        }
        $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
        $mail->isSMTP();
        $mail->Host = $host;
        $mail->SMTPAuth = true;
        $mail->Username = $username;
        $mail->Password = $password;
        $mail->Port = $port;
        $mail->SMTPSecure = $encryption === 'ssl'
            ? \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS
            : \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Timeout = 15;
        $mail->SMTPOptions = ['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'allow_self_signed' => false]];
        $mail->CharSet = 'UTF-8';
        $mail->setFrom($from, $fromName);
        $mail->addAddress($email);
        $mail->isHTML(true);
        $mail->Subject = 'ULmovi parolini tiklash';
        $safeUrl = htmlspecialchars($resetUrl, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $mail->Body = '<p>Parolingizni tiklash uchun quyidagi havolani oching. Havola 30 daqiqa amal qiladi.</p>'
            . '<p><a href="' . $safeUrl . '">Parolni tiklash</a></p>'
            . '<p>Agar bu so‘rovni siz yubormagan bo‘lsangiz, ushbu xabarni e’tiborsiz qoldiring.</p>';
        $mail->AltBody = 'Parolni tiklash havolasi: ' . $resetUrl . ' (30 daqiqa amal qiladi)';
        return $mail->send();
    } catch (Throwable $exception) {
        error_log('ULmovi SMTP reset delivery failed: ' . $exception->getMessage());
        return false;
    }
}

function valid_password_reset(PDO $pdo, string $token): ?array
{
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) return null;
    $statement = $pdo->prepare(
        'SELECT id, user_id FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?'
    );
    $statement->execute([hash('sha256', $token), time()]);
    $reset = $statement->fetch();
    return $reset ?: null;
}

function media_log_directory(): string
{
    $directory = storage_directory() . DIRECTORY_SEPARATOR . 'logs';
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new RuntimeException('Media processing log papkasini yaratib bo‘lmadi.');
    }
    return $directory;
}

function run_media_process(array $command, string $outputPath, string $logPath, int $timeoutSeconds): array
{
    if (!function_exists('proc_open')) {
        return ['started' => false, 'exit_code' => -1, 'timed_out' => false];
    }
    $descriptors = [
        0 => ['file', PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null', 'r'],
        1 => ['file', $outputPath, 'w'],
        2 => ['file', $logPath, 'a'],
    ];
    $process = @proc_open($command, $descriptors, $pipes);
    if (!is_resource($process)) {
        return ['started' => false, 'exit_code' => -1, 'timed_out' => false];
    }

    $startedAt = microtime(true);
    $exitCode = null;
    $timedOut = false;
    while (true) {
        $status = proc_get_status($process);
        if (!$status['running']) {
            $exitCode = (int)$status['exitcode'];
            break;
        }
        if (microtime(true) - $startedAt >= $timeoutSeconds) {
            $timedOut = true;
            @proc_terminate($process);
            $terminationDeadline = microtime(true) + 5;
            do {
                usleep(100000);
                $status = proc_get_status($process);
            } while ($status['running'] && microtime(true) < $terminationDeadline);
            if (!$status['running']) {
                $exitCode = (int)$status['exitcode'];
            }
            break;
        }
        usleep(100000);
    }
    $closeCode = proc_close($process);
    if ($exitCode === null || $exitCode < 0) {
        $exitCode = $closeCode;
    }
    return ['started' => true, 'exit_code' => $exitCode, 'timed_out' => $timedOut];
}

function configured_ffmpeg(PDO $pdo): string
{
    $configured = system_setting($pdo, 'ffmpeg_path', '');
    if ($configured !== '') return $configured;
    $environment = getenv('ULMOVI_FFMPEG');
    if (is_string($environment) && $environment !== '') return $environment;
    $windowsDefault = 'C:' . DIRECTORY_SEPARATOR . 'ffmpeg' . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'ffmpeg.exe';
    return is_file($windowsDefault) ? $windowsDefault : 'ffmpeg';
}

function configured_ffprobe(PDO $pdo, string $ffmpeg): string
{
    $configured = system_setting($pdo, 'ffprobe_path', '');
    if ($configured !== '') return $configured;
    $environment = getenv('ULMOVI_FFPROBE');
    if (is_string($environment) && $environment !== '') return $environment;
    if (str_contains($ffmpeg, DIRECTORY_SEPARATOR)) {
        return dirname($ffmpeg) . DIRECTORY_SEPARATOR . (PHP_OS_FAMILY === 'Windows' ? 'ffprobe.exe' : 'ffprobe');
    }
    $windowsDefault = 'C:' . DIRECTORY_SEPARATOR . 'ffmpeg' . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'ffprobe.exe';
    return is_file($windowsDefault) ? $windowsDefault : 'ffprobe';
}

function probe_video_metadata(PDO $pdo, string $path): array
{
    if (!function_exists('proc_open')) {
        throw new DomainException('Serverda video tekshirish imkoniyati yo‘q. Administrator FFprobe sozlamasini tekshirishi kerak.');
    }
    $ffprobe = configured_ffprobe($pdo, configured_ffmpeg($pdo));
    $logs = media_log_directory();
    $token = bin2hex(random_bytes(8));
    $outputPath = $logs . DIRECTORY_SEPARATOR . 'ffprobe-' . $token . '.json';
    $logPath = $logs . DIRECTORY_SEPARATOR . 'ffprobe-' . $token . '.log';
    $result = run_media_process([
        $ffprobe, '-v', 'error', '-show_entries',
        'format=duration:stream=codec_type,codec_name,width,height', '-of', 'json', $path,
    ], $outputPath, $logPath, 45);
    $output = is_file($outputPath) ? file_get_contents($outputPath) : false;
    @unlink($outputPath);
    if (!$result['started'] || $result['timed_out'] || $result['exit_code'] !== 0 || !is_string($output)) {
        error_log('ULmovi FFprobe failed; timeout=' . ($result['timed_out'] ? 'yes' : 'no') . '; log=' . $logPath);
        throw new DomainException($result['timed_out']
            ? 'Video tekshiruvi vaqtida tugamadi. Fayl buzilgan yoki server resursi yetarli emas.'
            : 'Video tekshirilmadi. Administrator FFprobe o‘rnatilishi va server jurnalini tekshirishi kerak.');
    }
    @unlink($logPath);
    $metadata = json_decode($output, true);
    $streams = is_array($metadata['streams'] ?? null) ? $metadata['streams'] : [];
    $video = null;
    $audioCodec = '';
    foreach ($streams as $stream) {
        if (($stream['codec_type'] ?? '') === 'video' && $video === null) $video = $stream;
        if (($stream['codec_type'] ?? '') === 'audio' && $audioCodec === '') $audioCodec = (string)($stream['codec_name'] ?? '');
    }
    $duration = (float)($metadata['format']['duration'] ?? 0);
    $width = (int)($video['width'] ?? 0);
    $height = (int)($video['height'] ?? 0);
    if ($duration <= 0 || $width < 1 || $height < 1 || empty($video['codec_name'])) {
        throw new DomainException('Video faylida yaroqli video oqimi topilmadi yoki fayl buzilgan.');
    }
    return [
        'duration' => $duration,
        'width' => $width,
        'height' => $height,
        'video_codec' => (string)$video['codec_name'],
        'audio_codec' => $audioCodec,
    ];
}

function generate_video_variants(PDO $pdo, int $movieId, PDOStatement $fileStatement, string $sourcePath, array $metadata): void
{
    if (system_setting($pdo, 'ffmpeg_enabled', '1') !== '1') {
        return;
    }
    if (!function_exists('proc_open')) {
        error_log('ULmovi FFmpeg is unavailable because proc_open is disabled.');
        return;
    }
    $ffmpeg = configured_ffmpeg($pdo);
    $sourceHeight = (int)$metadata['height'];
    $qualities = ['360p' => 360, '480p' => 480, '720p' => 720, '1080p' => 1080];
    $conversionDeadline = microtime(true) + 210;
    foreach ($qualities as $label => $height) {
        if ($height >= $sourceHeight) continue;
        $remainingSeconds = (int)floor($conversionDeadline - microtime(true));
        if ($remainingSeconds < 1) {
            error_log('ULmovi FFmpeg variants skipped after reaching the request processing budget.');
            break;
        }
        $variantName = bin2hex(random_bytes(24)) . '.mp4';
        $variantRelative = 'videos' . DIRECTORY_SEPARATOR . $variantName;
        $variantPath = storage_directory() . DIRECTORY_SEPARATOR . $variantRelative;
        $token = bin2hex(random_bytes(8));
        $outputPath = media_log_directory() . DIRECTORY_SEPARATOR . 'ffmpeg-' . $token . '.out';
        $logPath = media_log_directory() . DIRECTORY_SEPARATOR . 'ffmpeg-' . $token . '.log';
        $filter = 'scale=-2:min(' . $height . '\\,ih)';
        $command = [
            $ffmpeg, '-nostdin', '-y', '-i', $sourcePath,
            '-vf', $filter, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24',
            '-c:a', 'aac', '-movflags', '+faststart', $variantPath,
        ];
        $result = run_media_process($command, $outputPath, $logPath, $remainingSeconds);
        @unlink($outputPath);
        if (!$result['started'] || $result['timed_out'] || $result['exit_code'] !== 0
            || !is_file($variantPath) || filesize($variantPath) === 0) {
            error_log('ULmovi FFmpeg variant failed; quality=' . $label . '; timeout='
                . ($result['timed_out'] ? 'yes' : 'no') . '; log=' . $logPath);
            @unlink($variantPath);
            continue;
        }
        @unlink($logPath);
        $fileStatement->execute([$movieId, $label, $variantRelative, 'video/mp4', (int)filesize($variantPath)]);
    }
}

const MAX_VIDEO_UPLOAD_BYTES = 6442450944;
const VIDEO_UPLOAD_CHUNK_BYTES = 8388608;
const VIDEO_UPLOAD_TTL_SECONDS = 604800;

function upload_session_directory(string $uploadId, bool $create = false): string
{
    if (!preg_match('/^[a-f0-9]{32}$/', $uploadId)) {
        throw new DomainException('Yuklash sessiyasi identifikatori noto‘g‘ri.');
    }
    $root = storage_directory() . DIRECTORY_SEPARATOR . 'upload_tmp';
    if (!is_dir($root) && !mkdir($root, 0700, true) && !is_dir($root)) {
        throw new RuntimeException('Vaqtinchalik yuklash papkasini yaratib bo‘lmadi.');
    }
    $directory = $root . DIRECTORY_SEPARATOR . $uploadId;
    if ($create && !is_dir($directory) && !mkdir($directory, 0700) && !is_dir($directory)) {
        throw new RuntimeException('Yuklash sessiyasi uchun joy ajratib bo‘lmadi.');
    }
    return $directory;
}

function remove_upload_session_directory(string $uploadId): void
{
    $directory = upload_session_directory($uploadId);
    if (!is_dir($directory)) {
        return;
    }
    foreach (new DirectoryIterator($directory) as $entry) {
        if ($entry->isDot()) {
            continue;
        }
        if ($entry->isFile() || $entry->isLink()) {
            @unlink($entry->getPathname());
        }
    }
    @rmdir($directory);
}

function cleanup_expired_upload_sessions(PDO $pdo): void
{
    $statement = $pdo->prepare('SELECT upload_id FROM upload_sessions WHERE expires_at < ? ORDER BY expires_at LIMIT 50');
    $statement->execute([time()]);
    $expiredIds = $statement->fetchAll(PDO::FETCH_COLUMN);
    foreach ($expiredIds as $uploadId) {
        remove_upload_session_directory((string)$uploadId);
        $pdo->prepare('DELETE FROM upload_sessions WHERE upload_id = ? AND expires_at < ?')->execute([$uploadId, time()]);
    }
}

function owned_upload_session(PDO $pdo, string $uploadId, int $userId): array
{
    $statement = $pdo->prepare('SELECT * FROM upload_sessions WHERE upload_id = ? AND user_id = ?');
    $statement->execute([$uploadId, $userId]);
    $session = $statement->fetch();
    if (!$session) {
        respond(['success' => false, 'error' => 'Yuklash sessiyasi topilmadi yoki sizga tegishli emas.'], 404);
    }
    if ((int)$session['expires_at'] < time()) {
        remove_upload_session_directory($uploadId);
        $pdo->prepare('DELETE FROM upload_sessions WHERE upload_id = ?')->execute([$uploadId]);
        respond(['success' => false, 'error' => 'Yuklash sessiyasi muddati tugadi. Videoni qayta tanlab yangi yuklashni boshlang.'], 410);
    }
    return $session;
}

function start_admin_upload(PDO $pdo, array $admin): array
{
    $title = trim(post_string('title'));
    $genre = trim(post_string('genre'));
    $year = filter_var(post_string('year'), FILTER_VALIDATE_INT);
    $description = trim(post_string('description'));
    $totalSize = filter_var(post_string('total_size'), FILTER_VALIDATE_INT);
    $genres = ['action', 'comedy', 'drama', 'thriller', 'animation', 'documentary', 'romance', 'adventure', 'other'];
    if ($title === '' || mb_strlen($title) > 200 || !in_array($genre, $genres, true)
        || $year === false || $year < 1888 || $year > (int)date('Y') + 10
        || mb_strlen($description) > 5000 || $totalSize === false || $totalSize < 1) {
        respond(['success' => false, 'error' => 'Kino ma’lumotlari yoki video hajmi noto‘g‘ri.'], 422);
    }
    if ($totalSize > MAX_VIDEO_UPLOAD_BYTES) {
        respond(['success' => false, 'error' => 'Video 6 GB chegarasidan oshib ketdi.'], 413);
    }
    $freeBytes = @disk_free_space(storage_directory());
    $requiredBytes = ($totalSize * 2) + (128 * 1024 * 1024);
    if ($freeBytes === false || $freeBytes < $requiredBytes) {
        respond(['success' => false, 'error' => 'Diskda yuklash va yig‘ish uchun yetarli bo‘sh joy yo‘q.'], 507);
    }

    cleanup_expired_upload_sessions($pdo);
    $uploadId = bin2hex(random_bytes(16));
    $chunkCount = (int)ceil($totalSize / VIDEO_UPLOAD_CHUNK_BYTES);
    $now = time();
    upload_session_directory($uploadId, true);
    try {
        $statement = $pdo->prepare(
            'INSERT INTO upload_sessions(upload_id, user_id, title, genre, year, description, total_size, chunk_size, chunk_count, status, created_at, updated_at, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "uploading", ?, ?, ?)'
        );
        $statement->execute([
            $uploadId, $admin['id'], $title, $genre, $year, $description, $totalSize,
            VIDEO_UPLOAD_CHUNK_BYTES, $chunkCount, $now, $now, $now + VIDEO_UPLOAD_TTL_SECONDS,
        ]);
    } catch (Throwable $exception) {
        remove_upload_session_directory($uploadId);
        throw $exception;
    }
    return [
        'upload_id' => $uploadId,
        'chunk_size' => VIDEO_UPLOAD_CHUNK_BYTES,
        'chunk_count' => $chunkCount,
        'expires_at' => $now + VIDEO_UPLOAD_TTL_SECONDS,
    ];
}

function store_admin_upload_chunk(PDO $pdo, array $admin): array
{
    $uploadId = post_string('upload_id');
    $index = filter_var(post_string('chunk_index'), FILTER_VALIDATE_INT);
    $session = owned_upload_session($pdo, $uploadId, (int)$admin['id']);
    if ($session['status'] !== 'uploading') {
        respond(['success' => false, 'error' => 'Bu yuklash sessiyasi hozir chunk qabul qilmayapti.'], 409);
    }
    if ($index === false || $index < 0 || $index >= (int)$session['chunk_count']) {
        respond(['success' => false, 'error' => 'Video qismi raqami noto‘g‘ri.'], 422);
    }
    $expectedSize = min((int)$session['chunk_size'], (int)$session['total_size'] - ($index * (int)$session['chunk_size']));
    $upload = $_FILES['chunk'] ?? [];
    if (!isset($upload['error']) || is_array($upload['error']) || $upload['error'] !== UPLOAD_ERR_OK) {
        $uploadError = $upload['error'] ?? UPLOAD_ERR_NO_FILE;
        $message = match ($uploadError) {
            UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'Video qismi PHP ruxsat bergan hajmdan katta. PHP upload sozlamasini tekshiring.',
            UPLOAD_ERR_PARTIAL => 'Video qismi to‘liq kelmadi. Shu qismni qayta yuboring.',
            UPLOAD_ERR_NO_TMP_DIR => 'PHP vaqtinchalik papkasi topilmadi. Server sozlamasini tekshiring.',
            UPLOAD_ERR_CANT_WRITE => 'Server vaqtinchalik faylni yoza olmadi. Disk va ruxsatlarni tekshiring.',
            default => 'Video qismi kelmadi. Faylni qayta yuboring.',
        };
        respond(['success' => false, 'error' => $message], $uploadError === UPLOAD_ERR_INI_SIZE ? 413 : 422);
    }
    $temporaryPath = (string)($upload['tmp_name'] ?? '');
    $actualSize = is_uploaded_file($temporaryPath) ? filesize($temporaryPath) : false;
    $expectedHash = strtolower(post_string('chunk_sha256'));
    if ($actualSize !== $expectedSize || !preg_match('/^[a-f0-9]{64}$/', $expectedHash)) {
        respond(['success' => false, 'error' => 'Video qismi hajmi yoki tekshiruv ma’lumoti mos kelmadi. Shu qismni qayta yuboring.'], 422);
    }
    $actualHash = hash_file('sha256', $temporaryPath);
    if (!is_string($actualHash) || !hash_equals($expectedHash, $actualHash)) {
        respond(['success' => false, 'error' => 'Video qismi buzilgan yoki uzatishda o‘zgargan. Shu qismni qayta yuboring.'], 422);
    }

    $statement = $pdo->prepare('SELECT chunk_size, sha256 FROM upload_chunks WHERE upload_id = ? AND chunk_index = ?');
    $statement->execute([$uploadId, $index]);
    $existing = $statement->fetch();
    $directory = upload_session_directory($uploadId);
    $chunkPath = $directory . DIRECTORY_SEPARATOR . sprintf('chunk-%08d.part', $index);
    if ($existing) {
        $storedSize = is_file($chunkPath) ? filesize($chunkPath) : false;
        $storedHash = is_file($chunkPath) ? hash_file('sha256', $chunkPath) : false;
        if ((int)$existing['chunk_size'] === $expectedSize && hash_equals($existing['sha256'], $actualHash)
            && $storedSize === $expectedSize && is_string($storedHash) && hash_equals($actualHash, $storedHash)) {
            return ['chunk_index' => $index, 'duplicate' => true];
        }
        $pdo->prepare('DELETE FROM upload_chunks WHERE upload_id = ? AND chunk_index = ?')->execute([$uploadId, $index]);
        @unlink($chunkPath);
    }

    if (is_file($chunkPath)) {
        $orphanSize = filesize($chunkPath);
        $orphanHash = hash_file('sha256', $chunkPath);
        if ($orphanSize !== $expectedSize || !is_string($orphanHash) || !hash_equals($expectedHash, $orphanHash)) {
            @unlink($chunkPath);
        }
    }
    if (!is_file($chunkPath)) {
        $source = fopen($temporaryPath, 'rb');
        $destination = @fopen($chunkPath, 'xb');
        if ($source === false || $destination === false) {
            if (is_resource($source)) fclose($source);
            if (is_resource($destination)) fclose($destination);
            $storedHash = is_file($chunkPath) ? hash_file('sha256', $chunkPath) : false;
            if (!is_file($chunkPath) || filesize($chunkPath) !== $expectedSize
                || !is_string($storedHash) || !hash_equals($expectedHash, $storedHash)) {
                respond(['success' => false, 'error' => 'Server video qismini saqlay olmadi. Disk joyi va papka ruxsatlarini tekshiring.'], 507);
            }
        } else {
            $copied = stream_copy_to_stream($source, $destination);
            fclose($source);
            fclose($destination);
            if ($copied !== $expectedSize) {
                @unlink($chunkPath);
                respond(['success' => false, 'error' => 'Video qismi to‘liq saqlanmadi. Shu qismni qayta yuboring.'], 507);
            }
        }
    }
    $currentStatus = $pdo->prepare('SELECT status FROM upload_sessions WHERE upload_id = ? AND user_id = ?');
    $currentStatus->execute([$uploadId, $admin['id']]);
    if ($currentStatus->fetchColumn() !== 'uploading') {
        @unlink($chunkPath);
        respond(['success' => false, 'error' => 'Yuklash bekor qilingan yoki yakunlangan.'], 409);
    }
    $statement = $pdo->prepare(
        'INSERT OR IGNORE INTO upload_chunks(upload_id, chunk_index, chunk_size, sha256, created_at) VALUES (?, ?, ?, ?, ?)'
    );
    $statement->execute([$uploadId, $index, $expectedSize, $actualHash, time()]);
    $inserted = $statement->rowCount() > 0;
    $statement = $pdo->prepare('SELECT chunk_size, sha256 FROM upload_chunks WHERE upload_id = ? AND chunk_index = ?');
    $statement->execute([$uploadId, $index]);
    $storedChunk = $statement->fetch();
    if (!$storedChunk || (int)$storedChunk['chunk_size'] !== $expectedSize || !hash_equals($storedChunk['sha256'], $actualHash)) {
        respond(['success' => false, 'error' => 'Video qismi parallel so‘rov bilan to‘qnashdi. Shu qismni qayta yuboring.'], 409);
    }
    $pdo->prepare('UPDATE upload_sessions SET updated_at = ? WHERE upload_id = ?')->execute([time(), $uploadId]);
    return ['chunk_index' => $index, 'duplicate' => !$inserted];
}

function finalize_admin_upload(PDO $pdo, array $admin): array
{
    $uploadId = post_string('upload_id');
    $session = owned_upload_session($pdo, $uploadId, (int)$admin['id']);
    if ($session['status'] === 'completed') {
        return ['message' => 'Bu video avval saqlangan.', 'already_completed' => true];
    }
    if ($session['status'] !== 'uploading') {
        respond(['success' => false, 'error' => 'Yuklash sessiyasi boshqa amal bilan band.'], 409);
    }
    $statement = $pdo->prepare('SELECT chunk_index, chunk_size, sha256 FROM upload_chunks WHERE upload_id = ? ORDER BY chunk_index');
    $statement->execute([$uploadId]);
    $chunks = $statement->fetchAll();
    if (count($chunks) !== (int)$session['chunk_count']) {
        respond(['success' => false, 'error' => 'Ayrim video qismlari yetishmayapti. Yuklashni davom ettiring.'], 422);
    }
    foreach ($chunks as $expectedIndex => $chunk) {
        $expectedSize = min((int)$session['chunk_size'], (int)$session['total_size'] - ($expectedIndex * (int)$session['chunk_size']));
        $path = upload_session_directory($uploadId) . DIRECTORY_SEPARATOR . sprintf('chunk-%08d.part', $expectedIndex);
        if ((int)$chunk['chunk_index'] !== $expectedIndex || (int)$chunk['chunk_size'] !== $expectedSize
            || !is_file($path) || filesize($path) !== $expectedSize
            || !hash_equals($chunk['sha256'], (string)hash_file('sha256', $path))) {
            respond(['success' => false, 'error' => 'Video qismlaridan biri yetishmayapti yoki buzilgan. Uni qayta yuklang.'], 422);
        }
    }

    $now = time();
    $statement = $pdo->prepare('UPDATE upload_sessions SET status = "assembling", updated_at = ? WHERE upload_id = ? AND status = "uploading"');
    $statement->execute([$now, $uploadId]);
    if ($statement->rowCount() !== 1) {
        respond(['success' => false, 'error' => 'Yuklash sessiyasi band. Birozdan so‘ng urinib ko‘ring.'], 409);
    }

    $storage = storage_directory();
    $videoDirectory = $storage . DIRECTORY_SEPARATOR . 'videos';
    if (!is_dir($videoDirectory) && !mkdir($videoDirectory, 0700, true) && !is_dir($videoDirectory)) {
        $pdo->prepare('UPDATE upload_sessions SET status = "uploading" WHERE upload_id = ?')->execute([$uploadId]);
        throw new RuntimeException('Video saqlash papkasini yaratib bo‘lmadi.');
    }
    $assembledPath = $videoDirectory . DIRECTORY_SEPARATOR . '.upload-' . $uploadId . '.assembling';
    $videoPath = null;
    $posterPath = null;
    try {
        @unlink($assembledPath);
        $output = @fopen($assembledPath, 'xb');
        if ($output === false) {
            throw new RuntimeException('Yakuniy videoni yig‘ish faylini yaratib bo‘lmadi. Disk joyi va ruxsatlarni tekshiring.');
        }
        $totalWritten = 0;
        foreach ($chunks as $chunkIndex => $chunk) {
            $input = fopen(upload_session_directory($uploadId) . DIRECTORY_SEPARATOR . sprintf('chunk-%08d.part', $chunkIndex), 'rb');
            if ($input === false) {
                fclose($output);
                throw new RuntimeException('Video qismini yig‘ish vaqtida o‘qib bo‘lmadi.');
            }
            while (!feof($input)) {
                $buffer = fread($input, 1024 * 1024);
                if ($buffer === false || $buffer === '') break;
                $length = strlen($buffer);
                $written = 0;
                while ($written < $length) {
                    $count = fwrite($output, substr($buffer, $written));
                    if ($count === false || $count === 0) {
                        fclose($input);
                        fclose($output);
                        throw new RuntimeException('Diskka video yig‘ish vaqtida yozib bo‘lmadi. Bo‘sh joyni tekshiring.');
                    }
                    $written += $count;
                }
                $totalWritten += $length;
            }
            fclose($input);
        }
        fflush($output);
        fclose($output);
        if ($totalWritten !== (int)$session['total_size'] || filesize($assembledPath) !== (int)$session['total_size']) {
            throw new DomainException('Yig‘ilgan video hajmi asl fayl hajmiga mos kelmadi. Qismlarni qayta tekshiring.');
        }
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($assembledPath);
        $extensions = ['video/mp4' => 'mp4', 'video/webm' => 'webm'];
        if (!is_string($mime) || !isset($extensions[$mime])) {
            throw new DomainException('Video MP4 yoki WebM emas, yoki fayl buzilgan.');
        }
        $metadata = probe_video_metadata($pdo, $assembledPath);
        $filename = bin2hex(random_bytes(24)) . '.' . $extensions[$mime];
        $relativeVideoPath = 'videos' . DIRECTORY_SEPARATOR . $filename;
        $videoPath = $videoDirectory . DIRECTORY_SEPARATOR . $filename;
        if (!rename($assembledPath, $videoPath)) {
            throw new RuntimeException('Yig‘ilgan videoni doimiy saqlash joyiga ko‘chirib bo‘lmadi.');
        }
        if (isset($_FILES['poster']) && ($_FILES['poster']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
            $poster = save_upload($_FILES['poster'], [
                'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp',
            ], 10 * 1024 * 1024, 'posters');
            $posterPath = $poster['path'];
        }

        $pdo->beginTransaction();
        $statement = $pdo->prepare(
            'INSERT INTO movies(title, genre, year, description, created_at, updated_at, video_path, video_mime)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?)'
        );
        $statement->execute([$session['title'], $session['genre'], $session['year'], $session['description'], $relativeVideoPath, $mime]);
        $movieId = (int)$pdo->lastInsertId();
        $fileStatement = $pdo->prepare(
            'INSERT INTO movie_files(movie_id, quality, file_path, mime_type, file_size) VALUES (?, ?, ?, ?, ?)'
        );
        $fileStatement->execute([$movieId, 'original', $relativeVideoPath, $mime, (int)$session['total_size']]);
        if ($posterPath !== null) {
            $pdo->prepare('UPDATE movies SET poster_path = ? WHERE id = ?')->execute([$posterPath, $movieId]);
        }
        generate_video_variants($pdo, $movieId, $fileStatement, $videoPath, $metadata);
        record_activity($pdo, (int)$admin['id'], 'movie_added', (string)$movieId);
        $pdo->prepare('UPDATE upload_sessions SET status = "completed", updated_at = ? WHERE upload_id = ?')->execute([time(), $uploadId]);
        $pdo->commit();
        remove_upload_session_directory($uploadId);
        return ['message' => 'Kino muvaffaqiyatli yuklandi.', 'movie_id' => $movieId];
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        @unlink($assembledPath);
        if (is_string($videoPath)) @unlink($videoPath);
        if (is_string($posterPath)) {
            try { @unlink(resolve_storage_file($posterPath)); } catch (Throwable) {}
        }
        $pdo->prepare('UPDATE upload_sessions SET status = "uploading", updated_at = ? WHERE upload_id = ? AND status = "assembling"')->execute([time(), $uploadId]);
        throw $exception;
    }
}

function store_movie_upload(PDO $pdo, int $movieId, array $upload): void
{
    $stored = save_upload(
        $upload,
        ['video/mp4' => 'mp4', 'video/webm' => 'webm'],
        MAX_VIDEO_UPLOAD_BYTES,
        'videos'
    );
    try {
        $metadata = probe_video_metadata($pdo, $stored['absolute_path']);
    } catch (Throwable $exception) {
        @unlink($stored['absolute_path']);
        throw $exception;
    }
    $quality = 'original';
    $fileStatement = $pdo->prepare(
        'INSERT INTO movie_files(movie_id, quality, file_path, mime_type, file_size) VALUES (?, ?, ?, ?, ?)'
    );
    $fileStatement->execute([$movieId, $quality, $stored['path'], $stored['mime'], $stored['size']]);
    $statement = $pdo->prepare('UPDATE movies SET video_path = ?, video_mime = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    $statement->execute([$stored['path'], $stored['mime'], $movieId]);
    generate_video_variants($pdo, $movieId, $fileStatement, $stored['absolute_path'], $metadata);
}

try {
    $pdo = database();
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    $action = $_GET['action'] ?? $_POST['action'] ?? '';
    if (!is_string($action)) {
        respond(['success' => false, 'error' => 'API amali noto‘g‘ri.'], 400);
    }

    $userForMaintenance = current_user($pdo);
    if (system_setting($pdo, 'maintenance_mode', '0') === '1'
        && ($userForMaintenance['role'] ?? '') !== 'super_admin'
        && !in_array($action, ['auth_csrf', 'auth_me', 'auth_login', 'auth_logout', 'auth_forgot_password', 'auth_reset_validate', 'auth_reset_password'], true)) {
        respond(['success' => false, 'error' => 'Sayt vaqtincha texnik xizmatda. Keyinroq qayta urinib ko‘ring.'], 503);
    }

    if ($action === 'stream_video' || $action === 'download_movie') {
        require_method('GET');
        $user = $action === 'download_movie' ? require_user($pdo) : current_user($pdo);
        $movieId = get_id('id');
        $quality = isset($_GET['quality']) && is_string($_GET['quality']) ? $_GET['quality'] : 'original';
        [$path, $mime] = video_file($pdo, $movieId, $quality);
        if ($action === 'download_movie') {
            $statement = $pdo->prepare('SELECT title FROM movies WHERE id = ?');
            $statement->execute([$movieId]);
            $title = (string)$statement->fetchColumn();
            if ($title === '') {
                respond(['success' => false, 'error' => 'Kino topilmadi.'], 404);
            }
            $statement = $pdo->prepare('INSERT INTO download_events(user_id, movie_id) VALUES (?, ?)');
            $statement->execute([$user['id'], $movieId]);
            $pdo->prepare('UPDATE movies SET downloads_count = downloads_count + 1 WHERE id = ?')->execute([$movieId]);
            record_activity($pdo, $user['id'], 'movie_download', (string)$movieId);
            stream_file($path, $mime, preg_replace('/[^a-zA-Z0-9._-]/', '_', $title) . '.' . ($mime === 'video/webm' ? 'webm' : 'mp4'));
        }
        if (!isset($_SERVER['HTTP_RANGE'])) {
            $pdo->prepare('UPDATE movies SET views_count = views_count + 1 WHERE id = ?')->execute([$movieId]);
        }
        stream_file($path, $mime);
    }

    if ($action === 'movie_poster') {
        require_method('GET');
        $movieId = get_id('id');
        $statement = $pdo->prepare('SELECT poster_path FROM movies WHERE id = ?');
        $statement->execute([$movieId]);
        $relativePath = $statement->fetchColumn();
        if (!is_string($relativePath) || $relativePath === '') {
            respond(['success' => false, 'error' => 'Poster topilmadi.'], 404);
        }
        $path = resolve_storage_file($relativePath);
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($path);
        if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
            respond(['success' => false, 'error' => 'Poster formati noto‘g‘ri.'], 404);
        }
        stream_file($path, $mime);
    }

    if ($action === 'ad_image') {
        require_method('GET');
        $adId = get_id('id');
        $statement = $pdo->prepare('SELECT image_path FROM advertisements WHERE id = ? AND is_active = 1');
        $statement->execute([$adId]);
        $relativePath = $statement->fetchColumn();
        if (!is_string($relativePath) || $relativePath === '') {
            respond(['success' => false, 'error' => 'Reklama rasmi topilmadi.'], 404);
        }
        $path = resolve_storage_file($relativePath);
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($path);
        if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
            respond(['success' => false, 'error' => 'Reklama rasmi formati noto‘g‘ri.'], 404);
        }
        stream_file($path, $mime);
    }

    header('Content-Type: application/json; charset=UTF-8');
    if ($method === 'POST') {
        $postLimit = ini_size_bytes((string)ini_get('post_max_size'));
        $contentLength = filter_var($_SERVER['CONTENT_LENGTH'] ?? 0, FILTER_VALIDATE_INT);
        if ($postLimit > 0 && $contentLength !== false && $contentLength > $postLimit) {
            respond(['success' => false, 'error' => 'Fayl server ruxsat bergan so‘rov hajmidan katta. PHP post_max_size sozlamasini tekshiring.'], 413);
        }
        require_csrf_token();
    }

    switch ($action) {
        case 'auth_csrf':
            require_method('GET');
            respond(['success' => true, 'csrf_token' => ensure_csrf_token()]);

        case 'auth_me':
            require_method('GET');
            respond(['success' => true, 'data' => current_user($pdo), 'csrf_token' => ensure_csrf_token()]);

        case 'auth_forgot_password':
            require_method('POST');
            $email = strtolower(trim(post_string('email')));
            if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) {
                respond(['success' => false, 'error' => 'Email manzili noto‘g‘ri.'], 422);
            }
            $ipAddress = (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
            $now = time();
            $cutoff = $now - 900;
            $pdo->prepare('DELETE FROM password_reset_attempts WHERE attempted_at < ?')->execute([$now - 86400]);
            $statement = $pdo->prepare(
                'SELECT
                    (SELECT COUNT(*) FROM password_reset_attempts WHERE email = ? AND attempted_at >= ?) AS email_count,
                    (SELECT COUNT(*) FROM password_reset_attempts WHERE ip_address = ? AND attempted_at >= ?) AS ip_count'
            );
            $statement->execute([$email, $cutoff, $ipAddress, $cutoff]);
            $attemptCounts = $statement->fetch();
            if ((int)$attemptCounts['email_count'] >= 5 || (int)$attemptCounts['ip_count'] >= 30) {
                respond(['success' => false, 'error' => 'So‘rovlar ko‘paydi. 15 daqiqadan so‘ng qayta urinib ko‘ring.'], 429);
            }
            $pdo->prepare('INSERT INTO password_reset_attempts(email, ip_address, attempted_at) VALUES (?, ?, ?)')
                ->execute([$email, $ipAddress, $now]);
            $statement = $pdo->prepare('SELECT id FROM users WHERE email = ? AND status = "active"');
            $statement->execute([$email]);
            $userId = $statement->fetchColumn();
            if ($userId !== false) {
                $token = bin2hex(random_bytes(32));
                $pdo->beginTransaction();
                $pdo->prepare('DELETE FROM password_reset_tokens WHERE user_id = ?')->execute([$userId]);
                $pdo->prepare(
                    'INSERT INTO password_reset_tokens(user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)'
                )->execute([$userId, hash('sha256', $token), $now, $now + 1800]);
                $pdo->commit();
                if (!send_password_reset_email($email, $token)) {
                    error_log('ULmovi password reset delivery is unavailable for request id ' . bin2hex(random_bytes(6)) . '.');
                }
            }
            respond(['success' => true, 'message' => 'Agar bu email ro‘yxatdan o‘tgan bo‘lsa, parolni tiklash havolasi yuboriladi.']);

        case 'auth_reset_validate':
            require_method('GET');
            $token = $_GET['token'] ?? '';
            $reset = is_string($token) ? valid_password_reset($pdo, $token) : null;
            if (!$reset) {
                respond(['success' => false, 'error' => 'Tiklash havolasi yaroqsiz, ishlatilgan yoki muddati tugagan.'], 422);
            }
            respond(['success' => true, 'message' => 'Havola yaroqli. Yangi parolni kiriting.']);

        case 'auth_reset_password':
            require_method('POST');
            $token = post_string('token');
            $password = post_string('password');
            $confirmation = post_string('password_confirmation');
            if (strlen($password) < 8 || strlen($password) > 200 || !hash_equals($password, $confirmation)) {
                respond(['success' => false, 'error' => 'Parollar mos emas yoki parol kamida 8 belgidan iborat bo‘lishi kerak.'], 422);
            }
            $reset = valid_password_reset($pdo, $token);
            if (!$reset) {
                respond(['success' => false, 'error' => 'Tiklash havolasi yaroqsiz, ishlatilgan yoki muddati tugagan.'], 422);
            }
            $now = time();
            $pdo->beginTransaction();
            $statement = $pdo->prepare(
                'UPDATE password_reset_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL AND expires_at > ?'
            );
            $statement->execute([$now, $reset['id'], $now]);
            if ($statement->rowCount() !== 1) {
                $pdo->rollBack();
                respond(['success' => false, 'error' => 'Tiklash havolasi avval ishlatilgan yoki muddati tugagan.'], 409);
            }
            $statement = $pdo->prepare(
                'UPDATE users SET password = ?, session_version = session_version + 1 WHERE id = ? AND status = "active"'
            );
            $statement->execute([password_hash($password, PASSWORD_DEFAULT), $reset['user_id']]);
            if ($statement->rowCount() !== 1) {
                $pdo->rollBack();
                respond(['success' => false, 'error' => 'Hisob faol emas. Administratorga murojaat qiling.'], 409);
            }
            $pdo->prepare('DELETE FROM password_reset_tokens WHERE user_id = ?')->execute([$reset['user_id']]);
            record_activity($pdo, (int)$reset['user_id'], 'password_reset_completed');
            $pdo->commit();
            $_SESSION = [];
            session_regenerate_id(true);
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
            respond(['success' => true, 'message' => 'Parol yangilandi. Endi yangi parol bilan tizimga kiring.', 'csrf_token' => $_SESSION['csrf_token']]);

        case 'auth_register':
            require_method('POST');
            if (system_setting($pdo, 'allow_registration', '1') !== '1') {
                respond(['success' => false, 'error' => 'Yangi hisob yaratish vaqtincha o‘chirilgan.'], 403);
            }
            $name = trim(post_string('name'));
            $email = strtolower(trim(post_string('email')));
            $password = post_string('password');
            if ($name === '' || mb_strlen($name) > 100 || !filter_var($email, FILTER_VALIDATE_EMAIL)
                || strlen($email) > 254 || strlen($password) < 8 || strlen($password) > 200) {
                respond(['success' => false, 'error' => 'Ism, email yoki parol talablarga mos emas. Parol kamida 8 belgidan iborat bo‘lsin.'], 422);
            }
            $statement = $pdo->prepare('INSERT INTO users(name, email, password, role, status) VALUES (?, ?, ?, ?, ?)');
            try {
                $statement->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT), 'user', 'active']);
            } catch (PDOException $exception) {
                if (str_contains(strtolower($exception->getMessage()), 'unique')) {
                    respond(['success' => false, 'error' => 'Bu email bilan hisob mavjud.'], 409);
                }
                throw $exception;
            }
            session_regenerate_id(true);
            $_SESSION['user_id'] = (int)$pdo->lastInsertId();
            $_SESSION['session_version'] = 0;
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
            record_activity($pdo, (int)$_SESSION['user_id'], 'user_registered');
            respond(['success' => true, 'message' => 'Hisob yaratildi.', 'csrf_token' => $_SESSION['csrf_token']], 201);

        case 'auth_login':
            require_method('POST');
            $email = strtolower(trim(post_string('email')));
            $password = post_string('password');
            $ipAddress = (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
            $windowMinutes = max(1, min(1440, (int)system_setting($pdo, 'login_window_minutes', '15')));
            $attemptLimit = max(1, min(100, (int)system_setting($pdo, 'login_attempt_limit', '8')));
            $cutoff = time() - ($windowMinutes * 60);
            $pdo->prepare('DELETE FROM login_attempts WHERE attempted_at < ?')->execute([$cutoff]);
            $statement = $pdo->prepare('SELECT COUNT(*) FROM login_attempts WHERE email = ? AND ip_address = ? AND attempted_at >= ?');
            $statement->execute([$email, $ipAddress, $cutoff]);
            if ((int)$statement->fetchColumn() >= $attemptLimit) {
                respond(['success' => false, 'error' => "Kirish urinishlari ko‘payib ketdi. {$windowMinutes} daqiqadan so‘ng urinib ko‘ring."], 429);
            }
            $statement = $pdo->prepare('SELECT id, password, status, session_version FROM users WHERE email = ?');
            $statement->execute([$email]);
            $user = $statement->fetch();
            if (!$user || !password_verify($password, $user['password']) || $user['status'] !== 'active') {
                $pdo->prepare('INSERT INTO login_attempts(email, ip_address, attempted_at) VALUES (?, ?, ?)')->execute([$email, $ipAddress, time()]);
                respond(['success' => false, 'error' => 'Email yoki parol noto‘g‘ri, yoxud hisob faol emas.'], 401);
            }
            $pdo->prepare('DELETE FROM login_attempts WHERE email = ? AND ip_address = ?')->execute([$email, $ipAddress]);
            $pdo->prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$user['id']]);
            session_regenerate_id(true);
            $_SESSION['user_id'] = (int)$user['id'];
            $_SESSION['session_version'] = (int)$user['session_version'];
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
            record_activity($pdo, (int)$user['id'], 'user_login');
            respond(['success' => true, 'message' => 'Tizimga kirdingiz.', 'csrf_token' => $_SESSION['csrf_token']]);

        case 'auth_logout':
            require_method('POST');
            $_SESSION = [];
            $cookie = session_get_cookie_params();
            if (ini_get('session.use_cookies')) {
                setcookie(session_name(), '', [
                    'expires' => time() - 42000,
                    'path' => $cookie['path'] ?: '/',
                    'domain' => $cookie['domain'],
                    'secure' => $cookie['secure'],
                    'httponly' => $cookie['httponly'],
                    'samesite' => $cookie['samesite'] ?? 'Lax',
                ]);
            }
            session_destroy();
            session_id('');
            session_start();
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
            respond(['success' => true, 'message' => 'Tizimdan chiqdingiz.', 'csrf_token' => $_SESSION['csrf_token']]);

        case 'auth_profile_update':
            require_method('POST');
            $user = require_user($pdo);
            $name = trim(post_string('name'));
            $email = strtolower(trim(post_string('email')));
            $currentPassword = post_string('current_password');
            $newPassword = post_string('new_password');
            $statement = $pdo->prepare('SELECT password FROM users WHERE id = ?');
            $statement->execute([$user['id']]);
            $passwordHash = $statement->fetchColumn();
            if ($name === '' || mb_strlen($name) > 100 || !filter_var($email, FILTER_VALIDATE_EMAIL)
                || strlen($email) > 254 || !is_string($passwordHash) || !password_verify($currentPassword, $passwordHash)
                || ($newPassword !== '' && (strlen($newPassword) < 8 || strlen($newPassword) > 200))) {
                respond(['success' => false, 'error' => 'Profil ma’lumotlari noto‘g‘ri yoki joriy parol xato.'], 422);
            }
            $statement = $pdo->prepare('SELECT id FROM users WHERE email = ? AND id != ?');
            $statement->execute([$email, $user['id']]);
            if ($statement->fetch()) {
                respond(['success' => false, 'error' => 'Bu email bilan boshqa hisob mavjud.'], 409);
            }
            if ($newPassword !== '') {
                $statement = $pdo->prepare('UPDATE users SET name = ?, email = ?, password = ?, session_version = session_version + 1 WHERE id = ?');
                $statement->execute([$name, $email, password_hash($newPassword, PASSWORD_DEFAULT), $user['id']]);
                $statement = $pdo->prepare('SELECT session_version FROM users WHERE id = ?');
                $statement->execute([$user['id']]);
                $_SESSION['session_version'] = (int)$statement->fetchColumn();
                session_regenerate_id(true);
                $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
            } else {
                $statement = $pdo->prepare('UPDATE users SET name = ?, email = ? WHERE id = ?');
                $statement->execute([$name, $email, $user['id']]);
            }
            record_activity($pdo, $user['id'], 'profile_updated');
            respond(['success' => true, 'message' => 'Profil yangilandi.', 'csrf_token' => ensure_csrf_token()]);

        case 'get_movies':
            require_method('GET');
            $query = trim(is_string($_GET['q'] ?? null) ? $_GET['q'] : '');
            $genre = trim(is_string($_GET['genre'] ?? null) ? $_GET['genre'] : '');
            $limit = filter_var($_GET['limit'] ?? 50, FILTER_VALIDATE_INT);
            $offset = filter_var($_GET['offset'] ?? 0, FILTER_VALIDATE_INT);
            $limit = max(1, min(100, $limit === false ? 50 : $limit));
            $offset = max(0, $offset === false ? 0 : $offset);
            $sql = 'SELECT m.id, m.title, m.genre, m.year, m.rating, m.poster_url, m.video_url, m.description,
                    (m.video_path IS NOT NULL) AS has_video_file, (m.poster_path IS NOT NULL) AS has_poster,
                    m.views_count, m.downloads_count,
                    (SELECT COUNT(*) FROM likes l WHERE l.movie_id = m.id) AS likes_count,
                    (SELECT COUNT(*) FROM ratings r WHERE r.movie_id = m.id) AS rating_count,
                    (SELECT AVG(score) FROM ratings r WHERE r.movie_id = m.id) AS average_rating
                    FROM movies m WHERE (? = \'\' OR m.title LIKE ? OR m.genre LIKE ?)
                    AND (? = \'\' OR m.genre = ?) ORDER BY m.id DESC LIMIT ? OFFSET ?';
            $statement = $pdo->prepare($sql);
            $likeQuery = '%' . $query . '%';
            $statement->execute([$query, $likeQuery, $likeQuery, $genre, $genre, $limit, $offset]);
            $movies = $statement->fetchAll();
            $qualitiesByMovie = [];
            if ($movies) {
                $ids = array_column($movies, 'id');
                $placeholders = implode(',', array_fill(0, count($ids), '?'));
                $statement = $pdo->prepare(
                    "SELECT movie_id, quality FROM movie_files WHERE movie_id IN ({$placeholders})
                     ORDER BY movie_id, CASE quality WHEN '1080p' THEN 0 WHEN '720p' THEN 1
                     WHEN '480p' THEN 2 WHEN '360p' THEN 3 WHEN 'original' THEN 4 ELSE 5 END"
                );
                $statement->execute($ids);
                foreach ($statement->fetchAll() as $file) {
                    $qualitiesByMovie[$file['movie_id']][] = $file['quality'];
                }
            }
            foreach ($movies as &$movie) {
                $movie['qualities'] = $qualitiesByMovie[$movie['id']] ?? [];
                $movie['is_liked'] = false;
                $movie['my_rating'] = null;
            }
            unset($movie);
            $user = current_user($pdo);
            if ($user && $movies) {
                $ids = array_column($movies, 'id');
                $placeholders = implode(',', array_fill(0, count($ids), '?'));
                $statement = $pdo->prepare('SELECT movie_id FROM likes WHERE user_id = ? AND movie_id IN (' . $placeholders . ')');
                $statement->execute(array_merge([$user['id']], $ids));
                $liked = array_fill_keys(array_column($statement->fetchAll(), 'movie_id'), true);
                $statement = $pdo->prepare('SELECT movie_id, score FROM ratings WHERE user_id = ? AND movie_id IN (' . $placeholders . ')');
                $statement->execute(array_merge([$user['id']], $ids));
                $rated = [];
                foreach ($statement->fetchAll() as $row) {
                    $rated[$row['movie_id']] = (int)$row['score'];
                }
                foreach ($movies as &$movie) {
                    $movie['is_liked'] = isset($liked[$movie['id']]);
                    $movie['my_rating'] = $rated[$movie['id']] ?? null;
                }
                unset($movie);
            }
            respond(['success' => true, 'data' => $movies]);

        case 'get_comments':
            require_method('GET');
            $movieId = get_id('id');
            require_movie_exists($pdo, $movieId);
            $statement = $pdo->prepare(
                'SELECT c.id, c.user_id, u.name AS username, c.body, c.created_at, c.updated_at
                 FROM comments c JOIN users u ON u.id = c.user_id
                 WHERE c.movie_id = ? AND c.is_hidden = 0 ORDER BY c.created_at DESC LIMIT 100'
            );
            $statement->execute([$movieId]);
            respond(['success' => true, 'data' => $statement->fetchAll()]);

        case 'add_comment':
            require_method('POST');
            $user = require_user($pdo);
            $movieId = filter_var(post_string('movie_id'), FILTER_VALIDATE_INT);
            $body = trim(post_string('body'));
            if ($movieId === false || $movieId < 1 || mb_strlen($body) < 1 || mb_strlen($body) > 2000) {
                respond(['success' => false, 'error' => 'Izoh 1 dan 2000 belgigacha bo‘lishi kerak.'], 422);
            }
            require_movie_exists($pdo, $movieId);
            $statement = $pdo->prepare('INSERT INTO comments(user_id, movie_id, body) VALUES (?, ?, ?)');
            $statement->execute([$user['id'], $movieId, $body]);
            record_activity($pdo, $user['id'], 'comment_added', (string)$movieId);
            respond(['success' => true, 'message' => 'Izoh qo‘shildi.'], 201);

        case 'update_comment':
        case 'delete_comment':
            require_method('POST');
            $user = require_user($pdo);
            $commentId = filter_var(post_string('id'), FILTER_VALIDATE_INT);
            if ($commentId === false || $commentId < 1) {
                respond(['success' => false, 'error' => 'Izoh ID noto‘g‘ri.'], 422);
            }
            $statement = $pdo->prepare('SELECT user_id FROM comments WHERE id = ?');
            $statement->execute([$commentId]);
            $ownerId = $statement->fetchColumn();
            if ($ownerId === false) {
                respond(['success' => false, 'error' => 'Izoh topilmadi.'], 404);
            }
            if ((int)$ownerId !== $user['id'] && !in_array($user['role'], ['admin', 'super_admin'], true)) {
                respond(['success' => false, 'error' => 'Bu izohni boshqarish huquqi yo‘q.'], 403);
            }
            if ($action === 'delete_comment') {
                $pdo->prepare('DELETE FROM comments WHERE id = ?')->execute([$commentId]);
            } else {
                $body = trim(post_string('body'));
                if ($body === '' || mb_strlen($body) > 2000) {
                    respond(['success' => false, 'error' => 'Izoh 1 dan 2000 belgigacha bo‘lishi kerak.'], 422);
                }
                $pdo->prepare('UPDATE comments SET body = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$body, $commentId]);
            }
            respond(['success' => true, 'message' => 'Izoh yangilandi.']);

        case 'toggle_like':
            require_method('POST');
            $user = require_user($pdo);
            $movieId = filter_var(post_string('movie_id'), FILTER_VALIDATE_INT);
            if ($movieId === false || $movieId < 1) {
                respond(['success' => false, 'error' => 'Kino ID noto‘g‘ri.'], 422);
            }
            require_movie_exists($pdo, $movieId);
            $statement = $pdo->prepare('DELETE FROM likes WHERE user_id = ? AND movie_id = ?');
            $statement->execute([$user['id'], $movieId]);
            $liked = $statement->rowCount() === 0;
            if ($liked) {
                $pdo->prepare('INSERT INTO likes(user_id, movie_id) VALUES (?, ?)')->execute([$user['id'], $movieId]);
            }
            $statement = $pdo->prepare('SELECT COUNT(*) FROM likes WHERE movie_id = ?');
            $statement->execute([$movieId]);
            respond(['success' => true, 'data' => ['liked' => $liked, 'count' => (int)$statement->fetchColumn()]]);

        case 'rate_movie':
            require_method('POST');
            $user = require_user($pdo);
            $movieId = filter_var(post_string('movie_id'), FILTER_VALIDATE_INT);
            $score = filter_var(post_string('score'), FILTER_VALIDATE_INT);
            if ($movieId === false || $movieId < 1 || $score === false || $score < 1 || $score > 5) {
                respond(['success' => false, 'error' => 'Baho 1 dan 5 gacha bo‘lishi kerak.'], 422);
            }
            require_movie_exists($pdo, $movieId);
            $statement = $pdo->prepare(
                'INSERT INTO ratings(user_id, movie_id, score) VALUES (?, ?, ?)
                 ON CONFLICT(user_id, movie_id) DO UPDATE SET score = excluded.score, updated_at = CURRENT_TIMESTAMP'
            );
            $statement->execute([$user['id'], $movieId, $score]);
            $statement = $pdo->prepare('SELECT AVG(score), COUNT(*) FROM ratings WHERE movie_id = ?');
            $statement->execute([$movieId]);
            [$average, $count] = $statement->fetch(PDO::FETCH_NUM);
            respond(['success' => true, 'data' => ['average' => round((float)$average, 1), 'count' => (int)$count]]);

        case 'admin_stats':
            require_method('GET');
            $admin = require_admin($pdo);
            $stats = [];
            $queries = [
                'total_movies' => 'SELECT COUNT(*) FROM movies',
                'total_users' => $admin['role'] === 'super_admin'
                    ? 'SELECT COUNT(*) FROM users'
                    : "SELECT COUNT(*) FROM users WHERE role = 'user'",
                'total_comments' => 'SELECT COUNT(*) FROM comments',
                'total_likes' => 'SELECT COUNT(*) FROM likes',
            ];
            if ($admin['role'] === 'super_admin') {
                $queries['total_admins'] = "SELECT COUNT(*) FROM users WHERE role IN ('admin', 'super_admin')";
                $queries['total_super_admins'] = "SELECT COUNT(*) FROM users WHERE role = 'super_admin'";
                $queries['suspended_users'] = "SELECT COUNT(*) FROM users WHERE status = 'suspended'";
                $queries['total_downloads'] = 'SELECT COUNT(*) FROM download_events';
                $queries['total_views'] = 'SELECT COALESCE(SUM(views_count), 0) FROM movies';
                $queries['total_ratings'] = 'SELECT COUNT(*) FROM ratings';
            }
            foreach ($queries as $key => $query) {
                $stats[$key] = (int)$pdo->query($query)->fetchColumn();
            }
            if ($admin['role'] === 'super_admin') {
                $stats['average_rating'] = round((float)$pdo->query('SELECT COALESCE(AVG(score), 0) FROM ratings')->fetchColumn(), 1);
            }
            respond(['success' => true, 'data' => $stats]);

        case 'admin_upload_init':
            require_method('POST');
            $admin = require_admin($pdo);
            respond(['success' => true, 'data' => start_admin_upload($pdo, $admin)], 201);

        case 'admin_upload_status':
            require_method('GET');
            $admin = require_admin($pdo);
            $uploadId = $_GET['upload_id'] ?? '';
            if (!is_string($uploadId)) {
                respond(['success' => false, 'error' => 'Yuklash sessiyasi identifikatori noto‘g‘ri.'], 422);
            }
            $session = owned_upload_session($pdo, $uploadId, (int)$admin['id']);
            if ($session['status'] === 'assembling' && time() - (int)$session['updated_at'] > 1800) {
                @unlink(storage_directory() . DIRECTORY_SEPARATOR . 'videos' . DIRECTORY_SEPARATOR . '.upload-' . $uploadId . '.assembling');
                $pdo->prepare('UPDATE upload_sessions SET status = "uploading", updated_at = ? WHERE upload_id = ? AND status = "assembling"')
                    ->execute([time(), $uploadId]);
                $session['status'] = 'uploading';
            }
            $statement = $pdo->prepare('SELECT chunk_index, chunk_size FROM upload_chunks WHERE upload_id = ? ORDER BY chunk_index');
            $statement->execute([$uploadId]);
            $chunks = $statement->fetchAll();
            respond(['success' => true, 'data' => [
                'upload_id' => $uploadId,
                'status' => $session['status'],
                'chunk_size' => (int)$session['chunk_size'],
                'chunk_count' => (int)$session['chunk_count'],
                'uploaded_chunks' => array_map(static fn(array $chunk): int => (int)$chunk['chunk_index'], $chunks),
                'uploaded_bytes' => array_sum(array_map(static fn(array $chunk): int => (int)$chunk['chunk_size'], $chunks)),
                'total_size' => (int)$session['total_size'],
                'expires_at' => (int)$session['expires_at'],
            ]]);

        case 'admin_upload_chunk':
            require_method('POST');
            $admin = require_admin($pdo);
            respond(['success' => true, 'data' => store_admin_upload_chunk($pdo, $admin)]);

        case 'admin_upload_finalize':
            require_method('POST');
            $admin = require_admin($pdo);
            respond(['success' => true, 'data' => finalize_admin_upload($pdo, $admin)], 201);

        case 'admin_upload_cancel':
            require_method('POST');
            $admin = require_admin($pdo);
            $uploadId = post_string('upload_id');
            $session = owned_upload_session($pdo, $uploadId, (int)$admin['id']);
            if ($session['status'] !== 'uploading') {
                respond(['success' => false, 'error' => 'Yuklashni faqat davom etayotgan holatda bekor qilish mumkin.'], 409);
            }
            $statement = $pdo->prepare('UPDATE upload_sessions SET status = "cancelled", updated_at = ? WHERE upload_id = ? AND status = "uploading"');
            $statement->execute([time(), $uploadId]);
            if ($statement->rowCount() !== 1) {
                respond(['success' => false, 'error' => 'Yuklash holati o‘zgardi. Sahifani yangilab qayta tekshiring.'], 409);
            }
            remove_upload_session_directory($uploadId);
            $pdo->prepare('DELETE FROM upload_chunks WHERE upload_id = ?')->execute([$uploadId]);
            respond(['success' => true, 'message' => 'Yuklash bekor qilindi.']);

        case 'admin_add_movie':
            require_method('POST');
            $admin = require_admin($pdo);
            $title = trim(post_string('title'));
            $genre = trim(post_string('genre'));
            $year = filter_var(post_string('year'), FILTER_VALIDATE_INT);
            $description = trim(post_string('description'));
            $posterUrl = trim(post_string('poster_url'));
            $legacyVideo = trim(post_string('video_url'));
            $allowedGenres = ['action', 'comedy', 'drama', 'thriller', 'animation', 'documentary', 'romance', 'adventure', 'other'];
            if ($title === '' || mb_strlen($title) > 200 || !in_array($genre, $allowedGenres, true)
                || $year === false || $year < 1888 || $year > (int)date('Y') + 10
                || mb_strlen($description) > 5000 || !valid_https_url($posterUrl)
            || !valid_youtube_embed_url($legacyVideo)
            || !isset($_FILES['video']) || ($_FILES['video']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
            respond(['success' => false, 'error' => 'Kino ma’lumotlari noto‘g‘ri yoki MP4/WebM video fayl tanlanmagan.'], 422);
            }
            $pdo->beginTransaction();
            $statement = $pdo->prepare(
                'INSERT INTO movies(title, genre, year, description, poster_url, video_url, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
            );
            $statement->execute([$title, $genre, $year, $description, $posterUrl, $legacyVideo]);
            $movieId = (int)$pdo->lastInsertId();
            if (isset($_FILES['video'])) {
                store_movie_upload($pdo, $movieId, $_FILES['video']);
            }
            if (isset($_FILES['poster']) && ($_FILES['poster']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
                $poster = save_upload($_FILES['poster'], [
                    'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp',
                ], 10 * 1024 * 1024, 'posters');
                $pdo->prepare('UPDATE movies SET poster_path = ? WHERE id = ?')->execute([$poster['path'], $movieId]);
            }
            record_activity($pdo, $admin['id'], 'movie_added', (string)$movieId);
            $pdo->commit();
            respond(['success' => true, 'message' => 'Kino qo‘shildi.'], 201);

        case 'admin_update_movie':
            require_method('POST');
            $admin = require_admin($pdo);
            $id = filter_var(post_string('id'), FILTER_VALIDATE_INT);
            $title = trim(post_string('title'));
            $genre = trim(post_string('genre'));
            $year = filter_var(post_string('year'), FILTER_VALIDATE_INT);
            $description = trim(post_string('description'));
            $allowedGenres = ['action', 'comedy', 'drama', 'thriller', 'animation', 'documentary', 'romance', 'adventure', 'other'];
            if ($id === false || $id < 1 || $title === '' || mb_strlen($title) > 200
                || !in_array($genre, $allowedGenres, true)
                || $year === false || $year < 1888 || $year > (int)date('Y') + 10 || mb_strlen($description) > 5000) {
                respond(['success' => false, 'error' => 'Kino ma’lumotlari noto‘g‘ri.'], 422);
            }
            $statement = $pdo->prepare('UPDATE movies SET title = ?, genre = ?, year = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
            $statement->execute([$title, $genre, $year, $description, $id]);
            if ($statement->rowCount() === 0) {
                respond(['success' => false, 'error' => 'Kino topilmadi yoki o‘zgarish kiritilmadi.'], 404);
            }
            record_activity($pdo, $admin['id'], 'movie_updated', (string)$id);
            respond(['success' => true, 'message' => 'Kino ma’lumotlari yangilandi.']);

        case 'admin_delete_movie':
            require_method('POST');
            $admin = require_admin($pdo);
            $id = filter_var(post_string('id'), FILTER_VALIDATE_INT);
            if ($id === false || $id < 1) {
                respond(['success' => false, 'error' => 'Kino ID noto‘g‘ri.'], 422);
            }
            $statement = $pdo->prepare('SELECT file_path FROM movie_files WHERE movie_id = ?');
            $statement->execute([$id]);
            $files = $statement->fetchAll(PDO::FETCH_COLUMN);
            $statement = $pdo->prepare('SELECT poster_path FROM movies WHERE id = ?');
            $statement->execute([$id]);
            $poster = $statement->fetchColumn();
            $statement = $pdo->prepare('DELETE FROM movies WHERE id = ?');
            $statement->execute([$id]);
            if ($statement->rowCount() === 0) {
                respond(['success' => false, 'error' => 'Kino topilmadi.'], 404);
            }
            foreach (array_merge($files, is_string($poster) && $poster !== '' ? [$poster] : []) as $relativePath) {
                try {
                    @unlink(resolve_storage_file((string)$relativePath));
                } catch (RuntimeException) {
                    error_log('ULmovi: deleted movie file is missing or inaccessible.');
                }
            }
            record_activity($pdo, $admin['id'], 'movie_deleted', (string)$id);
            respond(['success' => true, 'message' => 'Kino o‘chirildi.']);

        case 'admin_get_users':
            require_method('GET');
            $admin = require_admin($pdo);
            $query = "SELECT id, substr(email, 1, instr(email, '@') - 1) AS username,
                             name AS full_name, name, email, role, status, created_at, last_login_at
                      FROM users";
            if ($admin['role'] !== 'super_admin') {
                $query .= " WHERE role = 'user'";
            }
            $users = $pdo->query($query . ' ORDER BY id DESC')->fetchAll();
            respond(['success' => true, 'data' => $users]);

        case 'admin_update_user':
            require_method('POST');
            $admin = require_admin($pdo);
            $id = filter_var(post_string('id'), FILTER_VALIDATE_INT);
            $role = post_string('role');
            $status = post_string('status');
            if ($id === false || $id < 1 || !in_array($role, ['user', 'admin', 'super_admin'], true)
                || !in_array($status, ['active', 'suspended'], true)) {
                respond(['success' => false, 'error' => 'Foydalanuvchi ma’lumotlari noto‘g‘ri.'], 422);
            }
            if ($id === $admin['id'] && ($role !== $admin['role'] || $status !== 'active')) {
                respond(['success' => false, 'error' => 'O‘z rolingiz yoki holatingizni bu yerdan o‘zgartira olmaysiz.'], 422);
            }
            $pdo->beginTransaction();
            $lock = $pdo->prepare('UPDATE users SET status = status WHERE id = ?');
            $lock->execute([$id]);
            $statement = $pdo->prepare('SELECT role, status, name, email FROM users WHERE id = ?');
            $statement->execute([$id]);
            $target = $statement->fetch();
            if (!$target) {
                $pdo->rollBack();
                respond(['success' => false, 'error' => 'Foydalanuvchi topilmadi.'], 404);
            }
            if ($admin['role'] !== 'super_admin' && ($target['role'] !== 'user' || $role !== 'user')) {
                $pdo->rollBack();
                respond(['success' => false, 'error' => 'Admin faqat oddiy foydalanuvchi holatini boshqarishi mumkin.'], 403);
            }
            if ($target['role'] === 'super_admin'
                && $target['status'] === 'active'
                && ($role !== 'super_admin' || $status !== 'active')) {
                $statement = $pdo->query("SELECT COUNT(*) FROM users WHERE role = 'super_admin' AND status = 'active'");
                if ((int)$statement->fetchColumn() <= 1) {
                    $pdo->rollBack();
                    respond(['success' => false, 'error' => 'Oxirgi faol Super Adminni lavozimidan olish yoki o‘chirish mumkin emas.'], 409);
                }
            }
            $pdo->prepare('UPDATE users SET role = ?, status = ?, session_version = session_version + 1 WHERE id = ?')
                ->execute([$role, $status, $id]);
            record_activity(
                $pdo,
                $admin['id'],
                $admin['role'] === 'super_admin' ? 'user_role_or_status_changed' : 'user_status_changed',
                "user_id={$id};role={$target['role']}->{$role};status={$target['status']}->{$status}"
            );
            $pdo->commit();
            respond(['success' => true, 'message' => 'Foydalanuvchi yangilandi.']);

        case 'admin_create_admin':
            require_method('POST');
            $admin = require_super_admin($pdo);
            $name = trim(post_string('name'));
            $email = strtolower(trim(post_string('email')));
            $password = post_string('password');
            if ($name === '' || mb_strlen($name) > 100 || !filter_var($email, FILTER_VALIDATE_EMAIL)
                || strlen($email) > 254 || strlen($password) < 12 || strlen($password) > 200) {
                respond(['success' => false, 'error' => 'Ma’lumotlar noto‘g‘ri. Parol kamida 12 belgidan iborat bo‘lishi kerak.'], 422);
            }
            $pdo->beginTransaction();
            $statement = $pdo->prepare('INSERT INTO users(name, email, password, role, status) VALUES (?, ?, ?, ?, ?)');
            try {
                $statement->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT), 'admin', 'active']);
            } catch (PDOException $exception) {
                $pdo->rollBack();
                if (str_contains(strtolower($exception->getMessage()), 'unique')) {
                    respond(['success' => false, 'error' => 'Bu email bilan hisob mavjud.'], 409);
                }
                throw $exception;
            }
            record_activity($pdo, $admin['id'], 'administrator_created', 'user_id=' . (string)$pdo->lastInsertId());
            $pdo->commit();
            respond(['success' => true, 'message' => 'Administrator yaratildi.'], 201);

        case 'admin_get_admins':
            require_method('GET');
            require_super_admin($pdo);
            $admins = $pdo->query(
                "SELECT id, substr(email, 1, instr(email, '@') - 1) AS username,
                        name AS full_name, name, email, role, status, created_at, last_login_at
                 FROM users WHERE role IN ('admin', 'super_admin') ORDER BY role, name"
            )->fetchAll();
            respond(['success' => true, 'data' => $admins]);

        case 'admin_update_admin':
            require_method('POST');
            $superAdmin = require_super_admin($pdo);
            $id = filter_var(post_string('id'), FILTER_VALIDATE_INT);
            $name = trim(post_string('name'));
            $email = strtolower(trim(post_string('email')));
            $role = post_string('role');
            $status = post_string('status');
            $newPassword = post_string('new_password');
            if ($id === false || $id < 1 || $name === '' || mb_strlen($name) > 100
                || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254
                || !in_array($role, ['user', 'admin', 'super_admin'], true)
                || !in_array($status, ['active', 'suspended'], true)
                || ($newPassword !== '' && (strlen($newPassword) < 12 || strlen($newPassword) > 200))) {
                respond(['success' => false, 'error' => 'Admin ma’lumotlari noto‘g‘ri. Yangi parol kamida 12 belgidan iborat bo‘lsin.'], 422);
            }

            $pdo->beginTransaction();
            $pdo->prepare('UPDATE users SET status = status WHERE id = ?')->execute([$id]);
            $statement = $pdo->prepare('SELECT role, status, name, email FROM users WHERE id = ?');
            $statement->execute([$id]);
            $target = $statement->fetch();
            if (!$target || !in_array($target['role'], ['admin', 'super_admin'], true)) {
                $pdo->rollBack();
                respond(['success' => false, 'error' => 'Admin hisobi topilmadi.'], 404);
            }
            if ($id === $superAdmin['id']
                && ($role !== $target['role'] || $status !== $target['status'])) {
                $pdo->rollBack();
                respond(['success' => false, 'error' => 'O‘z rolingiz yoki holatingizni bu yerdan o‘zgartira olmaysiz.'], 422);
            }
            if ($target['role'] === 'super_admin' && $target['status'] === 'active'
                && ($role !== 'super_admin' || $status !== 'active')) {
                $activeSuperAdmins = (int)$pdo->query(
                    "SELECT COUNT(*) FROM users WHERE role = 'super_admin' AND status = 'active'"
                )->fetchColumn();
                if ($activeSuperAdmins <= 1) {
                    $pdo->rollBack();
                    respond(['success' => false, 'error' => 'Oxirgi faol Super Adminni lavozimidan olish mumkin emas.'], 409);
                }
            }
            $statement = $pdo->prepare('SELECT id FROM users WHERE email = ? AND id != ?');
            $statement->execute([$email, $id]);
            if ($statement->fetch()) {
                $pdo->rollBack();
                respond(['success' => false, 'error' => 'Bu email bilan boshqa hisob mavjud.'], 409);
            }
            if ($newPassword !== '') {
                $statement = $pdo->prepare('UPDATE users SET name = ?, email = ?, role = ?, status = ?, password = ?, session_version = session_version + 1 WHERE id = ?');
                $statement->execute([$name, $email, $role, $status, password_hash($newPassword, PASSWORD_DEFAULT), $id]);
            } else {
                $statement = $pdo->prepare('UPDATE users SET name = ?, email = ?, role = ?, status = ?, session_version = session_version + 1 WHERE id = ?');
                $statement->execute([$name, $email, $role, $status, $id]);
            }
            $changedFields = [];
            foreach (['name' => $name, 'email' => $email, 'role' => $role, 'status' => $status] as $field => $newValue) {
                if ((string)$target[$field] !== $newValue) {
                    $changedFields[] = $field;
                }
            }
            if ($newPassword !== '') {
                $changedFields[] = 'password';
            }
            record_activity(
                $pdo,
                $superAdmin['id'],
                'administrator_updated',
                "user_id={$id};fields=" . implode(',', $changedFields)
            );
            $pdo->commit();
            respond(['success' => true, 'message' => 'Administrator ma’lumotlari yangilandi.']);

        case 'admin_get_settings':
            require_method('GET');
            require_super_admin($pdo);
            $settings = system_settings($pdo);
            $settings['ffmpeg_path_configured'] = system_setting($pdo, 'ffmpeg_path') !== ''
                || (getenv('ULMOVI_FFMPEG') !== false && getenv('ULMOVI_FFMPEG') !== '');
            $settings['ffprobe_path_configured'] = system_setting($pdo, 'ffprobe_path') !== ''
                || (getenv('ULMOVI_FFPROBE') !== false && getenv('ULMOVI_FFPROBE') !== '');
            respond(['success' => true, 'data' => $settings]);

        case 'admin_save_settings':
            require_method('POST');
            $superAdmin = require_super_admin($pdo);
            $allowRegistration = post_string('allow_registration');
            $maintenanceMode = post_string('maintenance_mode');
            $ffmpegEnabled = post_string('ffmpeg_enabled');
            $ffmpegPath = trim(post_string('ffmpeg_path'));
            $ffprobePath = trim(post_string('ffprobe_path'));
            $attemptLimit = filter_var(post_string('login_attempt_limit'), FILTER_VALIDATE_INT);
            $windowMinutes = filter_var(post_string('login_window_minutes'), FILTER_VALIDATE_INT);
            if (!in_array($allowRegistration, ['0', '1'], true)
                || !in_array($maintenanceMode, ['0', '1'], true)
                || !in_array($ffmpegEnabled, ['0', '1'], true)
                || strlen($ffmpegPath) > 500 || strlen($ffprobePath) > 500
                || ($ffmpegPath !== '' && (str_contains($ffmpegPath, "\0") || preg_match('/[\r\n]/', $ffmpegPath)))
                || ($ffprobePath !== '' && (str_contains($ffprobePath, "\0") || preg_match('/[\r\n]/', $ffprobePath)))
                || $attemptLimit === false || $attemptLimit < 1 || $attemptLimit > 100
                || $windowMinutes === false || $windowMinutes < 1 || $windowMinutes > 1440) {
                respond(['success' => false, 'error' => 'Tizim sozlamalaridan biri ruxsat etilgan qiymatga mos emas.'], 422);
            }
            $values = [
                'allow_registration' => $allowRegistration,
                'maintenance_mode' => $maintenanceMode,
                'ffmpeg_enabled' => $ffmpegEnabled,
                'ffmpeg_path' => $ffmpegPath,
                'ffprobe_path' => $ffprobePath,
                'login_attempt_limit' => (string)$attemptLimit,
                'login_window_minutes' => (string)$windowMinutes,
            ];
            $pdo->beginTransaction();
            $statement = $pdo->prepare(
                'INSERT INTO system_settings(setting_key, setting_value, updated_by, updated_at)
                 VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value,
                    updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP'
            );
            foreach ($values as $key => $value) {
                $statement->execute([$key, $value, $superAdmin['id']]);
            }
            record_activity(
                $pdo,
                $superAdmin['id'],
                'system_settings_updated',
                'keys=' . implode(',', array_keys($values))
            );
            $pdo->commit();
            respond(['success' => true, 'message' => 'Tizim sozlamalari saqlandi.']);

        case 'admin_activity_logs':
            require_method('GET');
            require_super_admin($pdo);
            $limit = filter_var($_GET['limit'] ?? 50, FILTER_VALIDATE_INT);
            $offset = filter_var($_GET['offset'] ?? 0, FILTER_VALIDATE_INT);
            $limit = max(1, min(200, $limit === false ? 50 : $limit));
            $offset = max(0, $offset === false ? 0 : $offset);
            $statement = $pdo->prepare(
                'SELECT a.id, a.event, a.details, a.created_at, u.name AS actor_name,
                        u.email AS actor_email, u.role AS actor_role
                 FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id
                 ORDER BY a.id DESC LIMIT ? OFFSET ?'
            );
            $statement->bindValue(1, $limit, PDO::PARAM_INT);
            $statement->bindValue(2, $offset, PDO::PARAM_INT);
            $statement->execute();
            respond(['success' => true, 'data' => $statement->fetchAll()]);

        case 'admin_comments':
            require_method('GET');
            require_admin($pdo);
            $statement = $pdo->query(
                'SELECT c.id, c.body, c.is_hidden, c.created_at, u.name AS username, m.title AS movie_title
                 FROM comments c JOIN users u ON u.id = c.user_id JOIN movies m ON m.id = c.movie_id
                 ORDER BY c.id DESC LIMIT 300'
            );
            respond(['success' => true, 'data' => $statement->fetchAll()]);

        case 'admin_moderate_comment':
            require_method('POST');
            $admin = require_admin($pdo);
            $id = filter_var(post_string('id'), FILTER_VALIDATE_INT);
            $hidden = filter_var(post_string('hidden'), FILTER_VALIDATE_INT);
            if ($id === false || $id < 1 || !in_array($hidden, [0, 1], true)) {
                respond(['success' => false, 'error' => 'Izoh ma’lumotlari noto‘g‘ri.'], 422);
            }
            $pdo->prepare('UPDATE comments SET is_hidden = ? WHERE id = ?')->execute([$hidden, $id]);
            record_activity($pdo, $admin['id'], 'comment_moderated', (string)$id);
            respond(['success' => true, 'message' => 'Izoh moderatsiya qilindi.']);

        case 'get_ads':
            require_method('GET');
            $placement = is_string($_GET['placement'] ?? null) ? $_GET['placement'] : 'home';
            if (!in_array($placement, ['home', 'between_sections', 'movie_detail'], true)) {
                respond(['success' => false, 'error' => 'Reklama joyi noto‘g‘ri.'], 422);
            }
            $statement = $pdo->prepare(
                'SELECT id, title, image_url, image_path, destination_url, placement FROM advertisements
                 WHERE is_active = 1 AND placement = ? ORDER BY id DESC LIMIT 10'
            );
            $statement->execute([$placement]);
            respond(['success' => true, 'data' => $statement->fetchAll()]);

        case 'admin_ads':
            require_method('GET');
            require_admin($pdo);
            respond(['success' => true, 'data' => $pdo->query('SELECT * FROM advertisements ORDER BY id DESC')->fetchAll()]);

        case 'admin_save_ad':
            require_method('POST');
            $admin = require_admin($pdo);
            $id = filter_var(post_string('id'), FILTER_VALIDATE_INT);
            $title = trim(post_string('title'));
            $imageUrl = trim(post_string('image_url'));
            $destination = trim(post_string('destination_url'));
            $placement = post_string('placement');
            $active = filter_var(post_string('is_active'), FILTER_VALIDATE_INT);
            $hasImageUpload = isset($_FILES['image']) && ($_FILES['image']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE;
            $hasExistingImage = false;
            if (!$hasImageUpload && $imageUrl === '' && $id !== false && $id > 0) {
                $existingImage = $pdo->prepare('SELECT image_path FROM advertisements WHERE id = ?');
                $existingImage->execute([$id]);
                $existingPath = $existingImage->fetchColumn();
                $hasExistingImage = is_string($existingPath) && $existingPath !== '';
            }
            if ($title === '' || mb_strlen($title) > 200
                || ($imageUrl !== '' && !valid_https_url($imageUrl))
                || (!$hasImageUpload && !$hasExistingImage && $imageUrl === '')
                || !valid_https_url($destination) || $destination === ''
                || !in_array($placement, ['home', 'between_sections', 'movie_detail'], true)
                || !in_array($active, [0, 1], true)) {
                respond(['success' => false, 'error' => 'Reklama ma’lumotlari noto‘g‘ri. HTTPS manzili yoki ruxsat etilgan rasm faylini kiriting.'], 422);
            }
            $image = null;
            if ($hasImageUpload) {
                $image = save_upload($_FILES['image'], [
                    'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp',
                ], 10 * 1024 * 1024, 'ads');
                $imageUrl = '';
            }
            $previousImagePath = null;
            if ($id !== false && $id > 0) {
                $statement = $pdo->prepare('SELECT image_path FROM advertisements WHERE id = ?');
                $statement->execute([$id]);
                $previousImagePath = $statement->fetchColumn();
                if ($previousImagePath === false) {
                    respond(['success' => false, 'error' => 'Reklama topilmadi.'], 404);
                }
                $imagePath = $image ? $image['path'] : ($imageUrl === '' ? $previousImagePath : null);
                $statement = $pdo->prepare(
                    'UPDATE advertisements SET title = ?, image_url = ?, image_path = ?, destination_url = ?, placement = ?, is_active = ? WHERE id = ?'
                );
                $statement->execute([$title, $imageUrl, $imagePath, $destination, $placement, $active, $id]);
                if ($statement->rowCount() === 0) {
                    respond(['success' => false, 'error' => 'Reklama topilmadi yoki o‘zgarish kiritilmadi.'], 404);
                }
            } else {
                $pdo->prepare(
                    'INSERT INTO advertisements(title, image_url, image_path, destination_url, placement, is_active) VALUES (?, ?, ?, ?, ?, ?)'
                )->execute([$title, $imageUrl, $image['path'] ?? null, $destination, $placement, $active]);
            }
            if (($image || $imageUrl !== '') && is_string($previousImagePath) && $previousImagePath !== '') {
                try {
                    @unlink(resolve_storage_file($previousImagePath));
                } catch (RuntimeException) {
                    error_log('ULmovi: replaced advertisement image is missing.');
                }
            }
            record_activity($pdo, $admin['id'], 'advertisement_saved');
            respond(['success' => true, 'message' => 'Reklama saqlandi.']);

        case 'admin_delete_ad':
            require_method('POST');
            $admin = require_admin($pdo);
            $id = filter_var(post_string('id'), FILTER_VALIDATE_INT);
            if ($id === false || $id < 1) {
                respond(['success' => false, 'error' => 'Reklama ID noto‘g‘ri.'], 422);
            }
            $statement = $pdo->prepare('SELECT image_path FROM advertisements WHERE id = ?');
            $statement->execute([$id]);
            $imagePath = $statement->fetchColumn();
            $statement = $pdo->prepare('DELETE FROM advertisements WHERE id = ?');
            $statement->execute([$id]);
            if ($statement->rowCount() === 0) {
                respond(['success' => false, 'error' => 'Reklama topilmadi.'], 404);
            }
            if (is_string($imagePath) && $imagePath !== '') {
                try {
                    @unlink(resolve_storage_file($imagePath));
                } catch (RuntimeException) {
                    error_log('ULmovi: deleted advertisement image is missing.');
                }
            }
            record_activity($pdo, $admin['id'], 'advertisement_deleted', (string)$id);
            respond(['success' => true, 'message' => 'Reklama o‘chirildi.']);

        case 'subscription_plans':
            require_method('GET');
            respond(['success' => true, 'data' => $pdo->query('SELECT id, name, description, price_minor, duration_days FROM subscription_plans WHERE is_active = 1 ORDER BY price_minor')->fetchAll()]);

        default:
            respond(['success' => false, 'error' => 'Noma’lum API amali.'], 404);
    }
} catch (DomainException $exception) {
    respond(['success' => false, 'error' => $exception->getMessage()], 422);
} catch (PDOException $exception) {
    error_log('ULmovi database error: ' . $exception->getMessage());
    respond(['success' => false, 'error' => 'Ma’lumotlar bazasida xatolik yuz berdi.'], 500);
} catch (Throwable $exception) {
    error_log('ULmovi API error: ' . $exception->getMessage());
    respond(['success' => false, 'error' => 'Serverda ichki xatolik yuz berdi.'], 500);
}
