<?php
declare(strict_types=1);

/**
 * ULmovi Google Drive OAuth service.
 * Maxfiy tokenlar faqat private storage ichida saqlanadi.
 */

function ulmovi_google_drive_config(): array
{
    static $config = null;

    if ($config !== null) {
        return $config;
    }

    $path = ulmovi_google_drive_private_dir() . '/google-drive-config.php';

    if (!is_file($path)) {
        throw new RuntimeException('Google Drive konfiguratsiyasi topilmadi.');
    }

    $data = require $path;

    if (!is_array($data)) {
        throw new RuntimeException('Google Drive konfiguratsiyasi noto‘g‘ri.');
    }

    foreach (['client_id', 'client_secret', 'api_key', 'project_number'] as $key) {
        if (!isset($data[$key]) || !is_string($data[$key]) || $data[$key] === '') {
            throw new RuntimeException('Google Drive konfiguratsiyasi to‘liq emas.');
        }
    }

    $config = $data;
    return $config;
}

function ulmovi_google_drive_redirect_uri(): string
{
    $configured = trim((string)(getenv('ULMOVI_GOOGLE_DRIVE_REDIRECT_URI') ?: ''));
    return $configured !== ''
        ? $configured
        : 'https://ulmovi.alwaysdata.net/backend/index.php?action=google_drive_callback';
}

function ulmovi_google_drive_private_dir(): string
{
    $directory = storage_directory() . DIRECTORY_SEPARATOR . 'private';

    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new RuntimeException('Google Drive private papkasini yaratib bo‘lmadi.');
    }

    @chmod($directory, 0700);
    return $directory;
}

function ulmovi_google_drive_encryption_key(): string
{
    $path = ulmovi_google_drive_private_dir() . '/google-drive-encryption.key';

    if (!is_file($path)) {
        throw new RuntimeException('Google Drive shifrlash kaliti topilmadi.');
    }

    $encoded = trim((string)file_get_contents($path));
    $key = base64_decode($encoded, true);

    if ($key === false || strlen($key) !== 32) {
        throw new RuntimeException('Google Drive shifrlash kaliti noto‘g‘ri.');
    }

    return $key;
}

function ulmovi_google_drive_token_path(): string
{
    return ulmovi_google_drive_private_dir() . '/google-drive-tokens.enc';
}

function ulmovi_google_drive_encrypt(array $tokens): string
{
    $key = ulmovi_google_drive_encryption_key();
    $nonce = random_bytes(12);
    $tag = '';

    $plaintext = json_encode($tokens, JSON_THROW_ON_ERROR);
    $ciphertext = openssl_encrypt(
        $plaintext,
        'aes-256-gcm',
        $key,
        OPENSSL_RAW_DATA,
        $nonce,
        $tag,
        'ULmovi Google Drive OAuth tokens v1',
        16
    );

    if ($ciphertext === false || strlen($tag) !== 16) {
        throw new RuntimeException('Google tokenlarini shifrlab bo‘lmadi.');
    }

    return json_encode([
        'version' => 1,
        'nonce' => base64_encode($nonce),
        'tag' => base64_encode($tag),
        'ciphertext' => base64_encode($ciphertext),
    ], JSON_THROW_ON_ERROR);
}

function ulmovi_google_drive_decrypt(string $encrypted): array
{
    $envelope = json_decode($encrypted, true);

    if (!is_array($envelope)
        || ($envelope['version'] ?? null) !== 1
        || !isset($envelope['nonce'], $envelope['tag'], $envelope['ciphertext'])) {
        throw new RuntimeException('Google token fayli formati noto‘g‘ri.');
    }

    $nonce = base64_decode((string)$envelope['nonce'], true);
    $tag = base64_decode((string)$envelope['tag'], true);
    $ciphertext = base64_decode((string)$envelope['ciphertext'], true);

    if ($nonce === false || strlen($nonce) !== 12
        || $tag === false || strlen($tag) !== 16
        || $ciphertext === false) {
        throw new RuntimeException('Google token fayli buzilgan.');
    }

    $plaintext = openssl_decrypt(
        $ciphertext,
        'aes-256-gcm',
        ulmovi_google_drive_encryption_key(),
        OPENSSL_RAW_DATA,
        $nonce,
        $tag,
        'ULmovi Google Drive OAuth tokens v1'
    );

    if ($plaintext === false) {
        throw new RuntimeException('Google tokenlarini ochib bo‘lmadi.');
    }

    $tokens = json_decode($plaintext, true);

    if (!is_array($tokens)) {
        throw new RuntimeException('Google token ma’lumotlari noto‘g‘ri.');
    }

    return $tokens;
}

function ulmovi_google_drive_load_tokens(): ?array
{
    $path = ulmovi_google_drive_token_path();

    if (!is_file($path)) {
        return null;
    }

    return ulmovi_google_drive_decrypt((string)file_get_contents($path));
}

function ulmovi_google_drive_save_tokens(array $response): void
{
    $accessToken = $response['access_token'] ?? null;

    if (!is_string($accessToken) || $accessToken === '') {
        throw new RuntimeException('Google access token javobda mavjud emas.');
    }

    $previous = ulmovi_google_drive_load_tokens() ?? [];
    $refreshToken = $response['refresh_token'] ?? ($previous['refresh_token'] ?? null);

    $tokens = [
        'access_token' => $accessToken,
        'refresh_token' => is_string($refreshToken) ? $refreshToken : null,
        'token_type' => (string)($response['token_type'] ?? 'Bearer'),
        'scope' => (string)($response['scope'] ?? ($previous['scope'] ?? '')),
        'expires_at' => time() + max(60, (int)($response['expires_in'] ?? 3600)),
    ];

    $path = ulmovi_google_drive_token_path();
    $temporary = $path . '.tmp';

    $encrypted = ulmovi_google_drive_encrypt($tokens);

    if (file_put_contents($temporary, $encrypted . PHP_EOL, LOCK_EX) === false) {
        throw new RuntimeException('Google token faylini yozib bo‘lmadi.');
    }

    chmod($temporary, 0600);

    if (!rename($temporary, $path)) {
        @unlink($temporary);
        throw new RuntimeException('Google token faylini saqlab bo‘lmadi.');
    }

    chmod($path, 0600);
}

function ulmovi_google_drive_create_oauth_url(): string
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        throw new RuntimeException('OAuth uchun PHP sessiyasi faol bo‘lishi kerak.');
    }

    $config = ulmovi_google_drive_config();

    $state = bin2hex(random_bytes(32));
    $verifier = rtrim(strtr(base64_encode(random_bytes(48)), '+/', '-_'), '=');
    $challenge = rtrim(strtr(
        base64_encode(hash('sha256', $verifier, true)),
        '+/',
        '-_'
    ), '=');

    $_SESSION['google_drive_oauth_state'] = $state;
    $_SESSION['google_drive_oauth_verifier'] = $verifier;

    $parameters = [
        'client_id' => $config['client_id'],
        'redirect_uri' => ulmovi_google_drive_redirect_uri(),
        'response_type' => 'code',
        'scope' => 'https://www.googleapis.com/auth/drive.file',
        'access_type' => 'offline',
        'prompt' => 'consent',
        'include_granted_scopes' => 'true',
        'state' => $state,
        'code_challenge' => $challenge,
        'code_challenge_method' => 'S256',
    ];

    return 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query($parameters);
}

function ulmovi_google_drive_consume_oauth_state(string $provided): string
{
    $expected = $_SESSION['google_drive_oauth_state'] ?? '';
    $verifier = $_SESSION['google_drive_oauth_verifier'] ?? '';

    unset(
        $_SESSION['google_drive_oauth_state'],
        $_SESSION['google_drive_oauth_verifier']
    );

    if (!is_string($expected) || $expected === ''
        || !is_string($verifier) || $verifier === ''
        || $provided === ''
        || !hash_equals($expected, $provided)) {
        throw new RuntimeException('Google OAuth xavfsizlik tekshiruvidan o‘tmadi.');
    }

    return $verifier;
}

function ulmovi_google_drive_token_request(array $parameters): array
{
    $config = ulmovi_google_drive_config();

    $parameters['client_id'] = $config['client_id'];
    $parameters['client_secret'] = $config['client_secret'];

    if (($parameters['grant_type'] ?? '') === 'authorization_code') {
        $parameters['redirect_uri'] = ulmovi_google_drive_redirect_uri();
    }

    $curl = curl_init('https://oauth2.googleapis.com/token');

    curl_setopt_array($curl, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query($parameters),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
    ]);

    $body = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);

    if (!is_string($body) || $status < 200 || $status >= 300) {
        error_log('ULmovi Google OAuth: token endpoint so‘rovi muvaffaqiyatsiz.');
        throw new RuntimeException('Google hisobini ulash amalga oshmadi. Qayta urinib ko‘ring.');
    }

    $response = json_decode($body, true);

    if (!is_array($response) || empty($response['access_token'])) {
        throw new RuntimeException('Google token javobi noto‘g‘ri.');
    }

    return $response;
}

function ulmovi_google_drive_exchange_code(string $code, string $verifier): void
{
    if ($code === '' || $verifier === '') {
        throw new RuntimeException('Google OAuth kodi noto‘g‘ri.');
    }

    $response = ulmovi_google_drive_token_request([
        'code' => $code,
        'code_verifier' => $verifier,
        'grant_type' => 'authorization_code',
    ]);

    ulmovi_google_drive_save_tokens($response);
}

function ulmovi_google_drive_access_token(): string
{
    $tokens = ulmovi_google_drive_load_tokens();

    if (!$tokens) {
        throw new RuntimeException('Google Drive hali ulanmagan.');
    }

    if (!empty($tokens['access_token'])
        && (int)($tokens['expires_at'] ?? 0) > time() + 60) {
        return (string)$tokens['access_token'];
    }

    $refreshToken = $tokens['refresh_token'] ?? '';

    if (!is_string($refreshToken) || $refreshToken === '') {
        throw new RuntimeException('Google hisobini qayta ulash talab qilinadi.');
    }

    $response = ulmovi_google_drive_token_request([
        'refresh_token' => $refreshToken,
        'grant_type' => 'refresh_token',
    ]);

    ulmovi_google_drive_save_tokens($response);

    $updated = ulmovi_google_drive_load_tokens();

    if (!$updated || empty($updated['access_token'])) {
        throw new RuntimeException('Google access token yangilanmadi.');
    }

    return (string)$updated['access_token'];
}

function ulmovi_google_drive_file_metadata(string $fileId): array
{
    if ($fileId === '' || strlen($fileId) > 256
        || !preg_match('/^[A-Za-z0-9_-]+$/', $fileId)) {
        throw new RuntimeException('Google Drive fayl ID noto‘g‘ri.');
    }

    $token = ulmovi_google_drive_access_token();
    $url = 'https://www.googleapis.com/drive/v3/files/'
        . rawurlencode($fileId) . '?'
        . http_build_query([
            'fields' => 'id,name,mimeType,size,capabilities(canDownload)',
            'supportsAllDrives' => 'true',
        ]);

    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $token],
    ]);

    $body = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $curlError = curl_error($curl);
    curl_close($curl);

    if (!is_string($body) || $status !== 200) {
        $errorData = is_string($body) ? json_decode($body, true) : null;
        $googleError = is_array($errorData) ? ($errorData['error'] ?? []) : [];
        $googleStatus = is_array($googleError) ? (string)($googleError['status'] ?? '') : '';
        $googleMessage = is_array($googleError) ? (string)($googleError['message'] ?? '') : '';

        error_log(
            'ULmovi Google Drive metadata error: HTTP ' . $status
            . '; status=' . substr($googleStatus, 0, 100)
            . '; message=' . substr($googleMessage, 0, 500)
            . '; curl=' . substr($curlError, 0, 300)
        );

        throw new RuntimeException('Google Drive faylini tekshirib bo‘lmadi.');
    }

    $data = json_decode($body, true);
    if (!is_array($data) || ($data['id'] ?? '') !== $fileId
        || !str_starts_with((string)($data['mimeType'] ?? ''), 'video/')
        || empty($data['capabilities']['canDownload'])
        || !isset($data['size']) || !is_numeric($data['size'])) {
        throw new RuntimeException('Bu fayl video emas yoki uni yuklab olishga ruxsat yo‘q.');
    }

    return [
        'id' => $fileId,
        'name' => (string)($data['name'] ?? 'video'),
        'mime_type' => (string)$data['mimeType'],
        'size' => (int)$data['size'],
    ];
}

function ulmovi_google_drive_stream_file(
    string $fileId,
    string $mimeType = 'video/mp4',
    string $downloadName = ''
): never {
    if ($fileId === '' || strlen($fileId) > 256
        || !preg_match('/^[A-Za-z0-9_-]+$/', $fileId)) {
        http_response_code(404);
        exit;
    }

    $token = ulmovi_google_drive_access_token();
    $url = 'https://www.googleapis.com/drive/v3/files/'
        . rawurlencode($fileId) . '?alt=media';

    $range = $_SERVER['HTTP_RANGE'] ?? '';
    if ($range !== '' && !preg_match('/^bytes=\d*-\d*$/', $range)) {
        http_response_code(416);
        exit;
    }

    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }

    while (ob_get_level() > 0) {
        ob_end_clean();
    }

    $status = 0;
    $responseHeaders = [];
    $curl = curl_init($url);

    $requestHeaders = ['Authorization: Bearer ' . $token];
    if ($range !== '') {
        $requestHeaders[] = 'Range: ' . $range;
    }

    $safeMime = preg_match('#^video/[a-zA-Z0-9.+-]+$#', $mimeType)
        ? $mimeType : 'application/octet-stream';

    curl_setopt_array($curl, [
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 5,
        CURLOPT_RETURNTRANSFER => false,
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_TIMEOUT => 0,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_HTTPHEADER => $requestHeaders,
        CURLOPT_BUFFERSIZE => 1048576,

        CURLOPT_HEADERFUNCTION => static function ($curl, string $line) use (
            &$status, &$responseHeaders, $safeMime, $downloadName
        ): int {
            $length = strlen($line);

            if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $line, $match)) {
                $status = (int)$match[1];
                $responseHeaders = [];
                return $length;
            }

            if (trim($line) === '') {
                if (($status >= 200 && $status < 300) || $status === 416) {
                    http_response_code($status);
                    header('Cache-Control: private, no-store');
                    header('X-Content-Type-Options: nosniff');
                    header('Accept-Ranges: bytes');

                    header('Content-Type: ' . $safeMime);

                    foreach (['content-length', 'content-range'] as $name) {
                        if (!isset($responseHeaders[$name])) {
                            continue;
                        }

                        $value = $responseHeaders[$name];
                        $valid = $name === 'content-length'
                            ? preg_match('/^[0-9]+$/', $value)
                            : preg_match('/^bytes (?:[0-9]+-[0-9]+\/[0-9]+|\*\/[0-9]+)$/', $value);

                        if ($valid) {
                            header($name . ': ' . $value);
                        }
                    }

                    if ($downloadName !== '') {
                        $name = basename(str_replace(["\r", "\n"], '', $downloadName));
                        $fallback = preg_replace('/[^A-Za-z0-9._-]/', '_', $name);
                        header(
                            'Content-Disposition: attachment; filename="' . $fallback
                            . '"; filename*=UTF-8\'\'' . rawurlencode($name)
                        );
                    }
                }

                return $length;
            }

            if (str_contains($line, ':')) {
                [$name, $value] = explode(':', $line, 2);
                $name = strtolower(trim($name));
                $value = trim($value);

                if (in_array($name, ['content-length', 'content-range'], true)) {
                    $responseHeaders[$name] = $value;
                }
            }

            return $length;
        },

        CURLOPT_WRITEFUNCTION => static function ($curl, string $chunk) use (&$status): int {
            if ($status < 200 || $status >= 300) {
                return strlen($chunk);
            }

            if (connection_aborted()) {
                return 0;
            }

            echo $chunk;
            flush();
            return strlen($chunk);
        },
    ]);

    $result = curl_exec($curl);
    $curlError = curl_errno($curl);
    curl_close($curl);

    if ($status === 416) {
        exit;
    }

    if ($result === false || $curlError !== 0 || $status < 200 || $status >= 300) {
        error_log('ULmovi Google Drive: video oqimini olish muvaffaqiyatsiz.');
        if (!headers_sent()) {
            http_response_code(502);
            header('Content-Type: application/json; charset=utf-8');
            header('Cache-Control: no-store');
            echo json_encode([
                'success' => false,
                'error' => 'Google Drive videosini uzatib bo‘lmadi.',
            ]);
        }
    }

    exit;
}
