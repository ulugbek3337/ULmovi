const assert = require('node:assert/strict');
const fs = require('node:fs');

const homepage = fs.readFileSync('public/index.html', 'utf8');
const admin = fs.readFileSync('public/admin.html', 'utf8');
const profile = fs.readFileSync('public/profile.html', 'utf8');
const auth = fs.readFileSync('public/js/auth.js', 'utf8');
const profileJs = fs.readFileSync('public/js/profile.js', 'utf8');
const brandCss = fs.readFileSync('public/css/vidora-brand.css', 'utf8');

assert.match(homepage, /<title>VIDORA — Feel the World of Cinema<\/title>/);
assert.match(homepage, /Kino dunyosini his eting/);
assert.match(homepage, /css\/vidora-brand\.css/);
assert.match(homepage, /class="vidora-mark"/);
assert.doesNotMatch(homepage, /ULmovi|logo-ul|logo-movi/);

assert.match(admin, /<title>VIDORA — Boshqaruv<\/title>/);
assert.match(admin, /VIDORA boshqaruvi/);
assert.match(admin, /css\/vidora-brand\.css/);
assert.doesNotMatch(admin, /ULmovi/);

assert.match(profile, /<title>VIDORA — Mening profilim<\/title>/);
assert.match(profile, /SIZNING VIDORA MAKONINGIZ/);
assert.match(profile, /css\/vidora-brand\.css/);
assert.doesNotMatch(profile, /ULmovi|ULMOVI/);

assert.match(auth, /VIDORA hisobini yarating/);
assert.match(profileJs, /VIDORA a’zosi/);
assert.match(profileJs, /VIDORA foydalanuvchisi/);
assert.doesNotMatch(profileJs, /ULmovi a’zosi|ULmovi foydalanuvchisi/);
assert.match(brandCss, /--vidora-bg:\s*#08090d/i);
assert.match(brandCss, /--vidora-gold:\s*#d4af37/i);
assert.match(brandCss, /--vidora-graphite:\s*#1e1e24/i);
assert.match(brandCss, /--vidora-ivory:\s*#f5f5f5/i);
assert.match(brandCss, /--vidora-burgundy:\s*#8b1e2d/i);

console.log('VIDORA brand smoke tests passed.');
