#!/usr/bin/env bash
# Push the generated PDF test corpus (test-assets/pdfs/*) to a device/emulator:
#   1. /data/local/tmp/test-pdfs/                       (readable by instrumentation tests)
#   2. <app private dir>/files/test-pdfs/ via run-as   (debug build of the app)
#
# Usage: scripts/push-test-pdfs.sh [-s SERIAL] [-p PACKAGE]
#   Generate the corpus first: python3 scripts/gen-test-pdfs.py
#   ANDROID_SERIAL is honoured if -s is not given.
set -euo pipefail

PKG="com.alphastack.scorereader"
SERIAL="${ANDROID_SERIAL:-}"
while getopts "s:p:h" opt; do
  case "$opt" in
    s) SERIAL="$OPTARG" ;;
    p) PKG="$OPTARG" ;;
    *) sed -n '2,9p' "$0"; exit 0 ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/test-assets/pdfs"
TMP_DIR="/data/local/tmp/test-pdfs"
APP_DIR="files/test-pdfs"

# Locate adb: ANDROID_HOME / ANDROID_SDK_ROOT, then PATH, then the default macOS/Linux SDK paths.
ADB=""
for cand in \
  "${ANDROID_HOME:+$ANDROID_HOME/platform-tools/adb}" \
  "${ANDROID_SDK_ROOT:+$ANDROID_SDK_ROOT/platform-tools/adb}" \
  "$(command -v adb 2>/dev/null || true)" \
  "$HOME/Library/Android/sdk/platform-tools/adb" \
  "$HOME/Android/Sdk/platform-tools/adb"; do
  if [ -n "$cand" ] && [ -x "$cand" ]; then ADB="$cand"; break; fi
done
[ -n "$ADB" ] || { echo "error: adb not found (set ANDROID_HOME or add adb to PATH)" >&2; exit 1; }

shopt -s nullglob
FILES=("$SRC"/*)
[ ${#FILES[@]} -gt 0 ] || { echo "error: no files in $SRC — run: python3 scripts/gen-test-pdfs.py" >&2; exit 1; }

adb_() { if [ -n "$SERIAL" ]; then "$ADB" -s "$SERIAL" "$@"; else "$ADB" "$@"; fi; }

if [ -z "$SERIAL" ]; then
  n=$("$ADB" devices | awk 'NR>1 && $2=="device"' | wc -l | tr -d ' ')
  [ "$n" -ge 1 ] || { echo "error: no device/emulator connected" >&2; exit 1; }
  [ "$n" -eq 1 ] || { echo "error: $n devices connected; pass -s SERIAL" >&2; exit 1; }
fi

adb_ shell pm path "$PKG" >/dev/null 2>&1 || { echo "error: package $PKG not installed" >&2; exit 1; }

echo "adb: $ADB  device: ${SERIAL:-default}  package: $PKG"
echo "pushing ${#FILES[@]} files to $TMP_DIR ..."
adb_ shell "mkdir -p $TMP_DIR && chmod 755 $TMP_DIR"
adb_ push "${FILES[@]}" "$TMP_DIR/"
adb_ shell "chmod 644 $TMP_DIR/*"

echo "copying into $PKG:$APP_DIR (run-as) ..."
adb_ shell "run-as $PKG sh -c 'mkdir -p $APP_DIR && chmod 700 $APP_DIR && cp $TMP_DIR/* $APP_DIR/'"

# Verify sizes match on both destinations.
fail=0
for f in "${FILES[@]}"; do
  name="$(basename "$f")"
  local_size=$(wc -c < "$f" | tr -d ' ')
  tmp_size=$(adb_ shell "stat -c %s $TMP_DIR/$name" | tr -d '\r')
  app_size=$(adb_ shell "run-as $PKG stat -c %s $APP_DIR/$name" | tr -d '\r')
  if [ "$local_size" = "$tmp_size" ] && [ "$local_size" = "$app_size" ]; then
    printf '  ok   %-16s %12s bytes\n' "$name" "$local_size"
  else
    printf '  FAIL %-16s local=%s tmp=%s app=%s\n' "$name" "$local_size" "$tmp_size" "$app_size"; fail=1
  fi
done
[ $fail -eq 0 ] && echo "done." || { echo "size mismatch" >&2; exit 1; }
