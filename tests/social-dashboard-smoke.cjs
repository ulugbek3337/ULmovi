const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (path) => fs.readFileSync(path, 'utf8');
const homepage = read('public/index.html');
const homepageJs = read('public/js/main.js');
const adminHtml = read('public/admin.html');
const adminJs = read('public/js/admin.js');
const backend = read('backend/index.php');
const bootstrap = read('backend/bootstrap.php');

const promoPosition = homepage.indexOf('id="instagramPromo"');
const recommendedPosition = homepage.indexOf('id="recommended"');
const mainEndPosition = homepage.indexOf('</main>');
assert.ok(promoPosition > recommendedPosition && promoPosition < mainEndPosition,
    'Instagram promo must appear after the movie sections near the bottom of the homepage.');
assert.match(homepage, /id="footerSocialLinks"/, 'Footer social links must be rendered dynamically.');
assert.doesNotMatch(homepage, /https:\/\/www\.instagram\.com\//,
    'Instagram URL must not be hardcoded in homepage HTML.');
assert.match(homepageJs, /fetchAPI\('get_social_links'\)/,
    'Homepage must load social links from the public API.');
assert.match(homepageJs, /promo\.href = instagramUrl/,
    'Instagram promo must use the URL configured by Super Admin.');
assert.match(homepageJs, /loadSocialLinks\(\),/,
    'Social links must load during homepage initialization.');

for (const id of ['catalogChart', 'engagementChart', 'reachChart']) {
    assert.ok(adminHtml.includes(`id="${id}"`), `Missing dashboard chart: ${id}`);
}
assert.match(adminHtml, /id="reachChart" class="chart-bars[^"]*"/,
    'Super Admin reach chart container must exist.');
assert.match(adminHtml, /chart-panel super-admin-only/,
    'Extended analytics must be restricted to Super Admin UI.');
assert.match(adminJs, /function renderMetricChart\(/,
    'Dashboard chart renderer is missing.');
assert.match(adminJs, /renderMetricChart\('catalogChart'/,
    'Catalog chart is not connected to dashboard statistics.');
assert.match(adminJs, /renderMetricChart\('engagementChart'/,
    'Engagement chart is not connected to dashboard statistics.');
assert.match(adminJs, /renderMetricChart\('reachChart'/,
    'Super Admin chart is not connected to dashboard statistics.');
assert.match(adminHtml, /id="socialLinksJson"/,
    'Social link settings payload field is missing.');
assert.match(adminJs, /function collectSocialLinks\(/,
    'Social link settings collector is missing.');

assert.match(backend, /case 'get_social_links':/,
    'Public social links API action is missing.');
assert.match(backend, /case 'admin_save_settings':[\s\S]*?social_links_json/,
    'Super Admin settings must persist the editable social links.');
assert.match(backend, /!valid_https_url\(\$socialUrl\)/,
    'Social links must be validated as HTTPS URLs on the server.');
assert.match(bootstrap, /'social_links' =>/,
    'Fresh installations must receive default social links.');

console.log('Social links and dashboard chart smoke tests passed.');
