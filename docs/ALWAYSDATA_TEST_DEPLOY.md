# Alwaysdata: VIDORA test checkout

This procedure downloads or fast-forwards the VIDORA test source from GitHub. It does not deploy to the live website and does not change the Alwaysdata website document root.

## Safety boundaries

- Target directory is fixed to `$HOME/VIDORA-test`.
- Production `$HOME/ULmovi` and `$HOME/ULmovi-storage` are never used as targets.
- The script refuses a non-empty target directory that is not the expected Git checkout.
- No production database, media, OAuth credentials, or `.env` files are copied.
- The script does not change Alwaysdata site settings or point the public domain to the test directory.

## Run from the Alwaysdata SSH terminal

```bash
cd "$HOME" || exit 1
curl -fsSL "https://raw.githubusercontent.com/ulugbek3337/ULmovi/feature/vidora-rebrand/scripts/update-vidora-test.sh" -o /tmp/update-vidora-test.sh
bash /tmp/update-vidora-test.sh
rm -f /tmp/update-vidora-test.sh
```

The output must show the `feature/vidora-rebrand` branch and the latest commit. If the script stops with an error, do not delete or rename any existing directory; send the complete error output for review.

## Before opening the test site

The Alwaysdata website configuration must be reviewed separately to confirm whether a second site/subdomain or a temporary test document root is supported by the current account. Do not change the existing production site's document root. A test database and test storage path must be configured independently before the test application is allowed to write data.