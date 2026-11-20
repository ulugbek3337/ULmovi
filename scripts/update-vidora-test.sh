#!/usr/bin/env bash
set -Eeuo pipefail

REPOSITORY="https://github.com/ulugbek3337/ULmovi.git"
BRANCH="${VIDORA_TEST_BRANCH:-feature/vidora-rebrand}"
HOME_DIR="$(cd "$HOME" && pwd -P)"
TARGET="$HOME_DIR/VIDORA-test"
PRODUCTION="$HOME_DIR/ULmovi"
PRODUCTION_STORAGE="$HOME_DIR/ULmovi-storage"

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

printf '\n%s\n' "=== CHECKOUT READY ==="
git -C "$TARGET" status --short --branch
git -C "$TARGET" log -1 --format='Commit: %h%nSubject: %s'
printf '\n%s\n' "Production ULmovi va ULmovi-storage papkalariga o‘zgartirish kiritilmadi."
printf '%s\n' "Eslatma: bu skript faqat test kodini yangilaydi; Alwaysdata website document-root sozlamasini o‘zgartirmaydi."
