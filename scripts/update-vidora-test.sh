#!/usr/bin/env bash
set -Eeuo pipefail

REPOSITORY="https://github.com/ulugbek3337/ULmovi.git"
BRANCH="${VIDORA_TEST_BRANCH:-feature/vidora-rebrand}"
HOME_DIR="$(cd "$HOME" && pwd -P)"
TARGET="$HOME_DIR/VIDORA-test"
PRODUCTION="$HOME_DIR/ULmovi"
PRODUCTION_STORAGE="$HOME_DIR/ULmovi-storage"
TEST_DATA="$HOME_DIR/VIDORA-test-data"
TEST_DB="$TEST_DATA/vidora.sqlite"
TEST_STORAGE="$TEST_DATA/storage"

fail() {
    printf 'XATO: %s\n' "$*" >&2
    exit 1
}

command -v git >/dev/null 2>&1 || fail "Git topilmadi."
[ -n "$HOME_DIR" ] || fail "HOME aniqlanmadi."
[ "$TARGET" != "$PRODUCTION" ] || fail "Production papkaga tegish taqiqlangan."
[ "$TARGET" != "$PRODUCTION_STORAGE" ] || fail "Production storage papkasiga tegish taqiqlangan."
[ ! -L "$TARGET" ] || fail "VIDORA-test symlink bo‘lishi mumkin emas."

printf '%s\n' "=== VIDORA TEST CHECKOUT ==="
printf 'Branch: %s\nTarget: %s\n' "$BRANCH" "$TARGET"

if [ -d "$TARGET/.git" ]; then
    CURRENT_ORIGIN="$(git -C "$TARGET" remote get-url origin 2>/dev/null || true)"
    [ "$CURRENT_ORIGIN" = "$REPOSITORY" ] || fail "Mavjud VIDORA-test papkasi kutilgan GitHub repozitoriysiga tegishli emas."
    git -C "$TARGET" fetch --prune origin "$BRANCH"
    git -C "$TARGET" checkout "$BRANCH"
    git -C "$TARGET" pull --ff-only origin "$BRANCH"
elif [ -e "$TARGET" ]; then
    [ -d "$TARGET" ] || fail "VIDORA-test yo‘li katalog emas."
    [ -z "$(find "$TARGET" -mindepth 1 -maxdepth 1 -print -quit)" ] || fail "VIDORA-test mavjud va bo‘sh emas; xavfsizlik uchun to‘xtatildi."
    rmdir "$TARGET"
    git clone --depth 1 --branch "$BRANCH" "$REPOSITORY" "$TARGET"
else
    git clone --depth 1 --branch "$BRANCH" "$REPOSITORY" "$TARGET"
fi

printf '\n%s\n' "=== PREPARE ISOLATED TEST DATA ==="
[ "$TEST_DATA" != "$PRODUCTION_STORAGE" ] || fail "Test data yo‘li production storage bilan bir xil."
[ ! -L "$TEST_DATA" ] || fail "VIDORA-test-data symlink bo‘lishi mumkin emas."
if [ -e "$TEST_DATA" ] && [ ! -d "$TEST_DATA" ]; then
    fail "VIDORA-test-data yo‘li katalog emas."
fi
[ ! -L "$TEST_STORAGE" ] || fail "Test storage symlink bo‘lishi mumkin emas."
[ ! -L "$TEST_DB" ] || fail "Test database symlink bo‘lishi mumkin emas."
mkdir -p "$TEST_STORAGE"
chmod 700 "$TEST_DATA" "$TEST_STORAGE"
case "$TEST_DB" in
    "$PRODUCTION"/*|"$PRODUCTION_STORAGE"/*) fail "Test database production papkasida bo‘lishi mumkin emas." ;;
esac
case "$TEST_STORAGE" in
    "$PRODUCTION"/*|"$PRODUCTION_STORAGE"/*) fail "Test storage production papkasida bo‘lishi mumkin emas." ;;
esac
if command -v php >/dev/null 2>&1; then
    php -r 'exit(extension_loaded("pdo_sqlite") && extension_loaded("fileinfo") && extension_loaded("mbstring") ? 0 : 1);' \
        || fail "PHP CLI uchun pdo_sqlite, fileinfo va mbstring kerak."
else
    fail "PHP CLI topilmadi."
fi

printf '\n%s\n' "=== CHECKOUT READY ==="
git -C "$TARGET" status --short --branch
git -C "$TARGET" log -1 --format='Commit: %h%nSubject: %s'
printf '\n%s\n' "Test data: $TEST_DATA"
printf 'ULMOVI_DB_PATH=%s\n' "$TEST_DB"
printf 'ULMOVI_STORAGE_PATH=%s\n' "$TEST_STORAGE"
printf '%s\n' "Bu qiymatlarni VIDORA test saytining alohida Environment variables maydoniga kiriting."
printf '\n%s\n' "Production ULmovi va ULmovi-storage papkalariga o‘zgartirish kiritilmadi."
printf '%s\n' "Eslatma: bu skript faqat test kodini yangilaydi; Alwaysdata website document-root sozlamasini o‘zgartirmaydi."
