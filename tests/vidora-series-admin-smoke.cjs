const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/vidora-series-admin.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'public/js/vidora-series-admin.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'public/admin.html'), 'utf8');

for (const id of [
    'seriesForm', 'seasonForm', 'episodeForm', 'seriesList', 'seasonList',
    'episodeList', 'seriesAdminStatus', 'seriesLogout'
]) {
    if (!html.includes(`id="${id}"`)) throw new Error(`Missing VIDORA series admin element: ${id}`);
}
for (const action of [
    'admin_get_series', 'admin_get_series_details', 'admin_save_series',
    'admin_delete_series', 'admin_save_season', 'admin_delete_season',
    'admin_save_episode', 'admin_delete_episode'
]) {
    if (!js.includes(`'${action}'`)) throw new Error(`Missing VIDORA series admin API action: ${action}`);
}
if (!html.includes('css/vidora-series-admin.css') || !html.includes('js/vidora-series-admin.js')) {
    throw new Error('VIDORA series admin assets are not linked.');
}
if (!admin.includes('href="vidora-series-admin.html"')) {
    throw new Error('Existing admin navigation does not link to VIDORA series management.');
}
if (/\.innerHTML\s*=/.test(js)) {
    throw new Error('Series admin rendering must not inject API/user content through innerHTML.');
}
process.stdout.write('VIDORA series admin smoke test passed.\\n');
