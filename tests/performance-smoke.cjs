const fs = require('node:fs');
const assert = require('node:assert/strict');

const html = fs.readFileSync('public/index.html', 'utf8');
const baseCss = fs.readFileSync('public/css/style.css', 'utf8');
const homeCss = fs.readFileSync('public/css/netflix-home.css', 'utf8');
const mainJs = fs.readFileSync('public/js/main.js', 'utf8');
const htaccess = fs.readFileSync('public/.htaccess', 'utf8');

assert.match(html, /id="heroBackground" class="hero-backdrop"/);
assert.match(html, /id="heroPoster" class="hero-poster"[^>]+fetchpriority="high"/);
assert.match(html, /aria-roledescription="karusel"/);
assert.doesNotMatch(html, /images\.unsplash\.com/);
assert.doesNotMatch(homeCss, /images\.unsplash\.com/);

assert.doesNotMatch(baseCss, /@import\s+url\(['"]https:\/\/fonts\.googleapis\.com/i);
assert.match(homeCss, /--content-width:\s*1280px/);
assert.match(homeCss, /aspect-ratio:2\/3/);
assert.match(homeCss, /background-image:none !important/);

assert.match(mainJs, /image\.loading = 'lazy'/);
assert.match(mainJs, /image\.decoding = 'async'/);
assert.match(mainJs, /image\.fetchPriority = 'low'/);
assert.match(mainJs, /image\.width = 400/);
assert.match(mainJs, /image\.height = 600/);
assert.match(mainJs, /heroBackground\.src = source/);
assert.match(mainJs, /heroPoster\.src = source/);
assert.match(mainJs, /}, 7000\)/);
assert.match(mainJs, /prefers-reduced-motion/);

assert.match(htaccess, /max-age=3600/);
assert.match(htaccess, /max-age=2592000/);
assert.match(htaccess, /no-cache, must-revalidate/);
assert.match(html, /name="description" content="VIDORA/);
const backend = fs.readFileSync('backend/index.php', 'utf8');
assert.match(backend, /Cache-Control: public, max-age=3600, stale-while-revalidate=86400/);

console.log('Performance smoke test passed.');
