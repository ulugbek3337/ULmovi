const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pages = [
  'public/index.html',
  'public/admin.html',
  'public/profile.html',
  'public/series.html',
  'public/watch-series.html',
  'public/vidora-series-admin.html'
];
const cssPath = path.join(root, 'public/css/vidora-premium.css');
const css = fs.readFileSync(cssPath, 'utf8');

for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  assert.match(html, /css\/vidora-premium\.css/, `Premium design layer is not linked from ${page}`);
}
for (const token of [
  '--vd-bg:#08090d',
  '--vd-gold:#d4af37',
  '--vd-text:#f5f5f5',
  '#videoContainer .player-toolbar',
  'position:relative!important',
  '@media(max-width:620px)',
  'prefers-reduced-motion:reduce'
]) {
  assert.ok(css.includes(token), `Missing premium UI requirement: ${token}`);
}
assert.match(css, /\.profile-avatar[\s\S]*?background:linear-gradient\(135deg,#f0d77f,#9b7620\)/);
assert.match(css, /\.series-card:hover/);
assert.match(css, /\.admin-sidebar/);
console.log('VIDORA premium UI smoke tests passed.');
