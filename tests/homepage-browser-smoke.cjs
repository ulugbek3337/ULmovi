const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', 'public');
const movies = [
  { id: 1, title: 'Sinov jangari filmi', genre: 'action', year: 2024, description: 'Sinov', qualities: ['720p'], video_url: null, has_poster: false, poster_url: '', likes_count: 15, average_rating: 8.4, rating_count: 12, is_liked: false },
  { id: 2, title: 'Sinov drama filmi', genre: 'drama', year: 2023, description: 'Sinov', qualities: ['720p'], video_url: null, has_poster: false, poster_url: '', likes_count: 5, average_rating: 7.8, rating_count: 8, is_liked: false },
  { id: 3, title: 'Sinov komediya filmi', genre: 'comedy', year: 2022, description: 'Sinov', qualities: ['720p'], video_url: null, has_poster: false, poster_url: '', likes_count: 20, average_rating: 8.9, rating_count: 20, is_liked: false },
];

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  const filePath = path.resolve(root, '.' + pathname);
  if (!filePath.startsWith(root + path.sep) && filePath !== path.join(root, 'index.html')) {
    res.writeHead(403).end('Forbidden'); return;
  }
  fs.readFile(filePath, (error, body) => {
    if (error) { res.writeHead(404).end('Not found'); return; }
    const ext = path.extname(filePath);
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' }).end(body);
  });
});

(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.route('**/backend/index.php**', async (route) => {
      const url = new URL(route.request().url());
      const action = url.searchParams.get('action');
      if (action === 'auth_me') return route.fulfill({ json: { success: true, data: null } });
      if (action === 'get_ads') return route.fulfill({ json: { success: true, data: [] } });
      if (action === 'get_movies') {
        let result = movies;
        const genre = url.searchParams.get('genre');
        const q = (url.searchParams.get('q') || '').toLowerCase();
        if (genre) result = result.filter((movie) => movie.genre === genre);
        if (q) result = result.filter((movie) => movie.title.toLowerCase().includes(q));
        const offset = Number(url.searchParams.get('offset') || 0);
        const limit = Number(url.searchParams.get('limit') || 24);
        return route.fulfill({ json: { success: true, data: result.slice(offset, offset + limit) } });
      }
      return route.fulfill({ json: { success: true, data: [] } });
    });

    await page.goto(`http://127.0.0.1:${address.port}/index.html`);
    await page.waitForSelector('#moviesGrid .movie-card');
    await page.waitForTimeout(100);

    // Guest authentication navigation and modal states.
    const loginButton = page.getByRole('button', { name: 'Kirish', exact: true }).first();
    const registerButton = page.getByRole('button', { name: 'Ro‘yxatdan o‘tish', exact: true });
    if (await loginButton.count() !== 1 || await registerButton.count() !== 1) {
      throw new Error('Guest navigation must show login and registration actions');
    }
    await loginButton.click();
    if (!(await page.locator('#authModal').isVisible()) || !(await page.locator('#loginForm').isVisible())) {
      throw new Error('Login action did not open the login form');
    }
    await page.getByRole('button', { name: 'Ro‘yxatdan o‘tish', exact: true }).last().click();
    if (!(await page.locator('#registerForm').isVisible()) || await page.locator('#loginForm').isVisible()) {
      throw new Error('Registration tab did not switch forms');
    }
    await page.getByRole('button', { name: 'Kirish', exact: true }).last().click();
    await page.locator('#forgotPasswordBtn').click();
    if (!(await page.locator('#forgotPasswordPanel').isVisible())) {
      throw new Error('Forgot-password action did not open its panel');
    }
    await page.locator('#forgotPasswordPanel [data-auth-tab="login"]').click();
    if (!(await page.locator('#loginForm').isVisible()) || await page.locator('#forgotPasswordPanel').isVisible()) {
      throw new Error('Forgot-password return action did not restore login form');
    }
    await page.locator('#closeAuthModal').click();
    if (await page.locator('#authModal').isVisible()) throw new Error('Close action did not hide authentication modal');

    // Authenticated navigation must expose only role-appropriate links.
    await page.evaluate(() => window.renderAuthenticationNavigation({ id: 7, name: 'Sinov foydalanuvchi', role: 'user' }));
    if (await page.locator('#mainNav a[href="profile.html"]').count() !== 1) {
      throw new Error('Regular user navigation must include the profile link');
    }
    await page.evaluate(() => window.renderAuthenticationNavigation({ id: 8, name: 'Sinov admin', role: 'admin' }));
    if (await page.locator('#mainNav a[href="admin.html"]').count() !== 1 ||
        await page.locator('#mainNav a[href="profile.html"]').count() !== 0) {
      throw new Error('Admin navigation contains incorrect role links');
    }
    await page.evaluate(() => window.renderAuthenticationNavigation({ id: 9, name: 'Sinov super admin', role: 'super_admin' }));
    if (await page.locator('#mainNav a[href="admin.html#settingsTab"]').count() !== 1) {
      throw new Error('Super-admin navigation must include system settings');
    }
    await page.evaluate(() => window.renderAuthenticationNavigation(null));

    const posterlessCount = await page.locator('#moviesGrid .movie-poster-wrap.poster-placeholder').count();
    if (posterlessCount !== 3) throw new Error(`Expected poster placeholders for all 3 posterless movies, got ${posterlessCount}`);
    const brokenPosterSources = await page.locator('#moviesGrid .movie-poster').evaluateAll((images) =>
      images.filter((image) => !image.hidden && !image.getAttribute('src')).length
    );
    if (brokenPosterSources) throw new Error('Posterless movies must not render visible empty image elements');

    const sectionCount = await page.locator('.movies-section').count();
    if (sectionCount !== 4) throw new Error(`Expected four movie sections, got ${sectionCount}`);
    const desktopColumns = await page.locator('#moviesGrid').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    if (desktopColumns !== 5) throw new Error(`Expected five desktop columns, got ${desktopColumns}`);

    await page.getByRole('button', { name: 'Jangari', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('#moviesGrid .movie-card').length === 1);
    const filteredTitle = await page.locator('#moviesGrid h3').first().textContent();
    if (!filteredTitle.includes('jangari')) throw new Error('Genre chip did not filter the movie list');

    await page.locator('#genreFilter').selectOption('');
    await page.waitForFunction(() => document.querySelectorAll('#moviesGrid .movie-card').length === 3);
    await page.locator('#yearFilter').selectOption('2024');
    await page.waitForFunction(() => [...document.querySelectorAll('#moviesGrid .movie-card')].filter((el) => !el.hidden).length === 1);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileColumns = await page.locator('#moviesGrid').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    if (mobileColumns !== 2) throw new Error(`Expected two mobile columns, got ${mobileColumns}`);
    const overflowReport = await page.evaluate(() => {
      const viewport = document.documentElement.clientWidth;
      return [...document.querySelectorAll('body *')].map((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return { tag: el.tagName.toLowerCase(), id: el.id, className: typeof el.className === 'string' ? el.className : '', right: Math.round(rect.right), left: Math.round(rect.left), width: Math.round(rect.width), overflowX: style.overflowX };
      }).filter((item) => item.right > viewport + 1 || item.left < -1).sort((a,b) => b.right-a.right).slice(0,8);
    });
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    if (horizontalOverflow) throw new Error('Mobile layout has horizontal page overflow. Offenders: ' + JSON.stringify(overflowReport));

    console.log('Homepage browser smoke tests passed: guest/auth navigation, login/register/forgot-password modal, role links, poster placeholders, sections, desktop grid, genre/year filters, mobile grid and overflow.');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
