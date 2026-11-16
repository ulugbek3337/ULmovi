const fs = require('node:fs');
const assert = require('node:assert/strict');

const html = fs.readFileSync('public/index.html', 'utf8');
const baseCss = fs.readFileSync('public/css/style.css', 'utf8');
const homeCss = fs.readFileSync('public/css/netflix-home.css', 'utf8');
const redesignCss = fs.readFileSync('public/css/homepage-redesign.css', 'utf8');
const mainJs = fs.readFileSync('public/js/main.js', 'utf8');
const htaccess = fs.readFileSync('public/.htaccess', 'utf8');

// The featured artwork now comes from real movie posters returned by the API,
// so the old static Unsplash preload is intentionally not required.
assert.match(html, /id="heroBackdrop"/);
assert.match(html, /id="heroPoster"/);
assert.doesNotMatch(html, /images\.unsplash\.com/);
assert.match(html, /href="css\/homepage-redesign\.css"/);
assert.match(html, /class="hero-pagination" aria-hidden="true"/);

assert.doesNotMatch(baseCss, /@import\s+url\(['"]https:\/\/fonts\.googleapis\.com/i);
assert.match(redesignCss, /aspect-ratio:\s*2\s*\/\s*3/);
assert.match(redesignCss, /aspect-ratio:\s*16\s*\/\s*9/);
assert.match(redesignCss, /@media\s*\(max-width:\s*1040px\)/);
assert.match(redesignCss, /prefers-reduced-motion:\s*reduce/);
assert.match(redesignCss, /background-image:\s*none\s*!important/);
assert.doesNotMatch(homeCss, /images\.unsplash\.com/);

assert.match(mainJs, /image\.loading = 'lazy'/);
assert.match(mainJs, /image\.decoding = 'async'/);
assert.match(mainJs, /image\.fetchPriority = 'low'/);
assert.match(mainJs, /image\.width = 400/);
assert.match(mainJs, /image\.height = 600/);
assert.match(mainJs, /function renderHeroCarousel\(/);
assert.match(mainJs, /setInterval\(\(\) => renderHeroSlide\(heroSlideIndex \+ 1\), 7000\)/);
assert.match(mainJs, /prefers-reduced-motion/);

assert.match(htaccess, /max-age=3600/);
assert.match(htaccess, /max-age=2592000/);
assert.match(htaccess, /no-cache, must-revalidate/);
assert.match(html, /name="description" content="ULmovi/);

const backend = fs.readFileSync('backend/index.php', 'utf8');
assert.match(backend, /Cache-Control: public, max-age=3600, stale-while-revalidate=86400/);

console.log('Performance smoke tests passed.');
