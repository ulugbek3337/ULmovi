<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/bootstrap.php';

$pdo = database();
$configured = system_setting($pdo, 'ffmpeg_path', '');
$environment = getenv('ULMOVI_FFMPEG');
$ffmpeg = $configured !== '' ? $configured
    : (is_string($environment) && $environment !== '' ? $environment : 'ffmpeg');
$limit = isset($argv[1]) ? filter_var($argv[1], FILTER_VALIDATE_INT) : 500;
$limit = max(1, min(1000, $limit === false ? 500 : $limit));

$storage = storage_directory();
$posterDirectory = $storage . DIRECTORY_SEPARATOR . 'posters';
$logDirectory = $storage . DIRECTORY_SEPARATOR . 'logs';
foreach ([$posterDirectory, $logDirectory] as $directory) {
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
        fwrite(STDERR, "Saqlash papkasini yaratib bo‘lmadi: {$directory}\n");
        exit(1);
    }
}

$statement = $pdo->prepare(
    'SELECT id, video_path FROM movies
     WHERE poster_path IS NULL AND video_path IS NOT NULL
     ORDER BY id ASC LIMIT ?'
);
$statement->bindValue(1, $limit, PDO::PARAM_INT);
$statement->execute();
$movies = $statement->fetchAll();
$created = 0;
$skipped = 0;

foreach ($movies as $movie) {
    $movieId = (int)$movie['id'];
    $target = $posterDirectory . DIRECTORY_SEPARATOR . bin2hex(random_bytes(24)) . '.jpg';
    $logPath = $logDirectory . DIRECTORY_SEPARATOR . 'preview-backfill-' . $movieId . '-' . bin2hex(random_bytes(5)) . '.log';
    try {
        $videoPath = resolve_storage_file((string)$movie['video_path']);
        $descriptors = [
            0 => ['file', PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null', 'r'],
            1 => ['file', PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null', 'w'],
            2 => ['file', $logPath, 'a'],
        ];
        $process = @proc_open([
            $ffmpeg, '-nostdin', '-y', '-ss', '0.5', '-i', $videoPath,
            '-frames:v', '1', '-vf', 'scale=min(640\\,iw):-2', '-q:v', '4', $target,
        ], $descriptors, $pipes);
        if (!is_resource($process)) {
            throw new RuntimeException('FFmpeg ishga tushmadi.');
        }
        $startedAt = microtime(true);
        $exitCode = null;
        while (true) {
            $status = proc_get_status($process);
            if (!$status['running']) {
                $exitCode = (int)$status['exitcode'];
                break;
            }
            if (microtime(true) - $startedAt > 25) {
                proc_terminate($process);
                $exitCode = -1;
                break;
            }
            usleep(100000);
        }
        $closeCode = proc_close($process);
        if ($exitCode === null || $exitCode < 0) $exitCode = $closeCode;
        $mime = is_file($target) ? (new finfo(FILEINFO_MIME_TYPE))->file($target) : false;
        if ($exitCode !== 0 || $mime !== 'image/jpeg' || filesize($target) < 256) {
            throw new RuntimeException('Birinchi kadrni JPEG sifatida yaratib bo‘lmadi.');
        }
        $relative = 'posters' . DIRECTORY_SEPARATOR . basename($target);
        $update = $pdo->prepare('UPDATE movies SET poster_path = ? WHERE id = ? AND poster_path IS NULL');
        $update->execute([$relative, $movieId]);
        if ($update->rowCount() === 1) {
            $created++;
            @unlink($logPath);
            echo "Kino #{$movieId}: muqova yaratildi.\n";
        } else {
            @unlink($target);
            @unlink($logPath);
            $skipped++;
        }
    } catch (Throwable $exception) {
        @unlink($target);
        $skipped++;
        fwrite(STDERR, "Kino #{$movieId}: " . $exception->getMessage() . " Jurnal: {$logPath}\n");
    }
}

echo "Tayyor. Yaratildi: {$created}; o‘tkazib yuborildi: {$skipped}; tekshirilgan: " . count($movies) . ".\n";
