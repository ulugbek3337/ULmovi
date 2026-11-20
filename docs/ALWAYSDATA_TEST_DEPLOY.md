# Alwaysdata: VIDORA test checkout

This procedure downloads or fast-forwards the VIDORA test source from GitHub and prepares a separate test database/storage directory. It does not deploy to the live website and does not change the Alwaysdata website document root.

## Safety boundaries

- Target directory is fixed to `$HOME/VIDORA-test`.
- Production `$HOME/ULmovi` and `$HOME/ULmovi-storage` are never used as targets.
- The script refuses a non-empty target directory that is not the expected Git checkout.
- No production database, media, OAuth credentials, or `.env` files are copied.
- Test database and media are isolated in `$HOME/VIDORA-test-data/` (mode 0700); the script refuses symlinks at the test paths.
- The script does not change Alwaysdata site settings or point the public domain to the test directory.

## Run from the Alwaysdata SSH terminal

```bash
cd "$HOME" || exit 1
curl -fsSL "https://raw.githubusercontent.com/ulugbek3337/ULmovi/feature/vidora-rebrand/scripts/update-vidora-test.sh" -o /tmp/update-vidora-test.sh
bash /tmp/update-vidora-test.sh
rm -f /tmp/update-vidora-test.sh
```

The output must show the `feature/vidora-rebrand` branch, the latest commit, and the two isolated test paths. If the script stops with an error, do not delete or rename any existing directory; send the complete error output for review.


## Configure a separate test site (do not edit the live site)

1. In Alwaysdata, open **Web > Sites** and check whether the account permits adding a second PHP site. Use a test-only address/subdomain that is not the existing `ulmovi.alwaysdata.net` production address.
2. Set the test site's document root to `$HOME/VIDORA-test` and open the app at the test address followed by `/public/` (for example, `https://TEST-ADDRESS/public/`). This is required because the current frontend calls `../backend/index.php`. Do not change the existing production site's document root or address.
3. The checkout script creates a **local-only** `backend/.htaccess` with Apache `SetEnv` directives for these exact test paths. Do not commit this file or copy it into the production checkout. It keeps the SQLite database and media outside the site's document root. Do not add production paths or production secrets.
4. Select PHP 8.1 or newer and verify `PDO`, `pdo_sqlite`, `fileinfo`, `mbstring`, and session support. The upload feature also requires FFprobe; the account has previously used `$HOME/bin/ffprobe`, but confirm it still exists.
5. Save only the new test site's settings. Do not change the existing site's settings. Alwaysdata applies site configuration changes through its Web > Sites interface; a site restart may be needed after changing settings.

Official Alwaysdata references:
- [PHP configuration and site-level PHP settings](https://help.alwaysdata.com/en/docs/web-hosting/languages/php/configuration/)
- [Adding a separate website](https://help.alwaysdata.com/en/docs/web-hosting/sites/add-a-site/)

## Test-site acceptance checklist

- [ ] Test URL opens VIDORA, while the production URL still opens the unchanged ULmovi site.
- [ ] Confirm the test DB file is exactly `$HOME/VIDORA-test-data/vidora.sqlite`.
- [ ] Confirm the test media path is exactly `$HOME/VIDORA-test-data/storage`.
- [ ] Create a test-only admin account; never copy production users or password hashes.
- [ ] Create one unpublished test series, season, and episode; verify they are not visible publicly.
- [ ] Publish the test series/episode and verify the public catalog and watch page.
- [ ] Upload a small MP4/WebM file; verify quality selection and byte-range playback.
- [ ] Verify anonymous playback and signed-in resume/auto-next.
- [ ] Verify mobile and desktop layouts, admin movie pages, movie uploads, and Google Drive movie integration remain unaffected.
- [ ] Delete only test-created records/files after recording the results; do not touch production data.

If Alwaysdata does not allow a second site/address on the current plan, stop here and use an approved isolated test domain/site option. Never reuse the live production document root as a shortcut.

## Deployment gate

Do not open the test application until the second site's document root and the two isolated environment variables have been verified. If a separate site/address is not available on the current Alwaysdata plan, pause rather than changing the production site's document root.