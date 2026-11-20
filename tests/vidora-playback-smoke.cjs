const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const backend = fs.readFileSync(path.join(root, 'backend/index.php'), 'utf8');
const bootstrap = fs.readFileSync(path.join(root, 'backend/bootstrap.php'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'public/js/vidora-series-admin.js'), 'utf8');
const watch = fs.readFileSync(path.join(root, 'public/js/vidora-watch.js'), 'utf8');
const watchHtml = fs.readFileSync(path.join(root, 'public/watch-series.html'), 'utf8');
const catalog = fs.readFileSync(path.join(root, 'public/series.html'), 'utf8');
const home = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

for (const action of [
    "case 'admin_episode_upload_init'",
    "case 'admin_episode_upload_finalize'",
    "if ($action === 'stream_episode')",
    "case 'get_episode_progress'",
    "case 'save_episode_progress'"
]) {
    if (!backend.includes(action)) throw new Error(`Missing episode playback endpoint: ${action}`);
}
for (const requirement of [
    "require_admin($pdo)",
    "resolve_storage_file((string)$file['file_path'])",
    "stream_file($path, (string)$file['mime_type'])",
    "resolve_storage_file((string)$oldFile['file_path'])",
    "e.status = 'published' AND s.status = 'published'",
    "require_user($pdo)"
]) {
    if (!backend.includes(requirement)) throw new Error(`Missing episode playback security requirement: ${requirement}`);
}
for (const requirement of [
    "crypto.subtle.digest('SHA-256'",
    "admin_episode_upload_init",
    "admin_upload_chunk",
    "admin_episode_upload_finalize"
]) {
    if (!admin.includes(requirement)) throw new Error(`Missing chunked upload control: ${requirement}`);
}
for (const requirement of ["stream_episode", "save_episode_progress", "get_episode_progress", "player.addEventListener('ended'"]) {
    if (!watch.includes(requirement)) throw new Error(`Missing watch-page behavior: ${requirement}`);
}
if (!watchHtml.includes('controls playsinline') || !catalog.includes('series.html')) {
    throw new Error('Public series watch/catalog markup is incomplete.');
}
if (!home.includes('homeSeriesGrid') || !home.includes('vidora-home-series.js')) {
    throw new Error('VIDORA series shelf is not connected to the homepage.');
}
if (!bootstrap.includes("target_type TEXT NOT NULL DEFAULT 'movie'")) {
    throw new Error('Legacy movie upload sessions do not default to movie target.');
}
process.stdout.write('VIDORA episode upload and playback smoke test passed.\\n');
