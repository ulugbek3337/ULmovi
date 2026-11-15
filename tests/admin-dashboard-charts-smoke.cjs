const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('public/admin.html', 'utf8');
const js = fs.readFileSync('public/js/admin.js', 'utf8');
const css = fs.readFileSync('public/css/style.css', 'utf8');
const backend = fs.readFileSync('backend/index.php', 'utf8');

for (const id of ['catalogChart', 'engagementChart', 'reachChart']) {
    assert.ok(html.includes(`id="${id}"`), `Missing chart container: ${id}`);
}
assert.match(html, /chart-panel super-admin-only/,
    'Extended analytics chart must be restricted to Super Admin.');
assert.match(js, /function renderMetricChart\(/, 'Chart renderer is missing.');
assert.match(js, /renderMetricChart\('catalogChart'/, 'Catalog chart is not connected to stats.');
assert.match(js, /renderMetricChart\('engagementChart'/, 'Engagement chart is not connected to stats.');
assert.match(js, /renderMetricChart\('reachChart'/, 'Super Admin chart is not connected to stats.');
assert.match(js, /fetchAPI\('admin_stats'\)/, 'Charts must use the existing role-protected stats API.');
assert.match(backend, /case 'admin_stats':[\s\S]*?require_admin\(\$pdo\)/,
    'Statistics endpoint must enforce admin authentication.');
assert.match(backend, /if \(\$admin\['role'\] === 'super_admin'\)/,
    'Extended metrics must be restricted server-side to Super Admin.');
assert.match(css, /\.admin-charts-grid[\s\S]*?@media\(max-width:760px\)/,
    'Charts must have a responsive layout.');
console.log('Admin dashboard chart smoke tests passed.');
