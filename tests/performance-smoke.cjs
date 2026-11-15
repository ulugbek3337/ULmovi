const fs = require('node:fs');
const assert = require('node:assert/strict');

const html = fs.readFileSync('public/index.html', 'utf8');
const baseCss = fs.readFileSync('public/css/style.css', 'utf8');
const homeCss = fs.readFileSync('public/css/netflix-home.css', 'utf8');
const mainJs = fs.readFileSync('public/js/main.js', 'utf8');
const htaccess = fs.readFileSync('public/.htaccess', 'utf8');

assert.match(html, /rel="preconnect" href="https:\/\/images\.unsplash\.com"/);
assert.match(html, /rel="preload" as="image"[^>]+fetchpriority="high"/);
assert.match(html, /media="\(min-width: 561px\)"/);
assert.match(html, /media="\(max-width: 560px\)"/);

assert.doesNotMatch(baseCss, /@import\s+url\(['"]https:\/\/fonts\.googleapis\.com/i);
assert.match(homeCss, /w=1600&q=70/);
assert.match(homeCss, /w=900&q=65/);

assert.match(mainJs, /image\.loading = 'lazy'/);
assert.match(mainJs, /image\.decoding = 'async'/);
assert.match(mainJs, /image\.fetchPriority = 'low'/);
assert.match(mainJs, /image\.width = 400/);
assert.match(mainJs, /image\.height = 600/);

assert.match(htaccess, /max-age=3600/);
assert.match(htaccess, /max-age=2592000/);
assert.match(htaccess, /no-cache, must-revalidate/);

console.log('Performance smoke test passed.');
