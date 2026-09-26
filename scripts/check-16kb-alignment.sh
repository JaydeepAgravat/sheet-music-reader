#!/usr/bin/env bash
# Verify that native libraries in an APK/AAB are compatible with 16 KB page-size devices.
#
# Usage: scripts/check-16kb-alignment.sh <path-to.apk|.aab>
#
# Checks every lib/{arm64-v8a,x86_64}/*.so (base/lib/... inside an AAB):
#   (a) ZIP alignment: `zipalign -c -P 16 -v 4` (build-tools 35+). APK only; for an AAB the
#       ZIP layout is produced later by bundletool/Play, so this check is skipped.
#   (b) ELF alignment: every PT_LOAD segment must have p_align >= 16384 (2**14).
#
# Exits non-zero if any library fails either check, or if a required tool is missing.
set -euo pipefail

ABIS_REGEX='(arm64-v8a|x86_64)'
MIN_ALIGN=16384

die() { echo "error: $*" >&2; exit 2; }

[[ $# -eq 1 ]] || die "usage: $0 <apk-or-aab>"
ARCHIVE="$1"
[[ -f "$ARCHIVE" ]] || die "file not found: $ARCHIVE"
command -v unzip >/dev/null || die "unzip is required"

case "$ARCHIVE" in
  *.aab) KIND=aab; LIB_PREFIX='base/lib' ;;
  *.apk) KIND=apk; LIB_PREFIX='lib' ;;
  *) die "expected an .apk or .aab file: $ARCHIVE" ;;
esac

# Sort version-like directory names ascending (portable: no `sort -V` on older macOS).
sort_versions() { sort -t. -k1,1n -k2,2n -k3,3n -k4,4n; }

# ---- Locate the Android SDK -------------------------------------------------------------
SDK=""
for c in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "$HOME/Library/Android/sdk" "$HOME/Android/Sdk"; do
  if [[ -n "$c" && -d "$c" ]]; then SDK="$c"; break; fi
done
[[ -n "$SDK" ]] || die "Android SDK not found (set ANDROID_HOME)"

# ---- zipalign from the newest build-tools that supports -P (35+) -------------------------
ZIPALIGN=""
if [[ -d "$SDK/build-tools" ]]; then
  newest=$(ls "$SDK/build-tools" | sort_versions | tail -n 1)
  major=${newest%%.*}
  if [[ -n "$newest" && "$major" =~ ^[0-9]+$ && "$major" -ge 35 && -x "$SDK/build-tools/$newest/zipalign" ]]; then
    ZIPALIGN="$SDK/build-tools/$newest/zipalign"
  fi
fi

# ---- ELF inspector from the NDK LLVM toolchain ------------------------------------------
case "$(uname -s)" in
  Darwin) HOST_TAG=darwin-x86_64 ;;
  Linux) HOST_TAG=linux-x86_64 ;;
  *) HOST_TAG="" ;;
esac

NDK_CANDIDATES=()
for c in "${ANDROID_NDK_HOME:-}" "${ANDROID_NDK_ROOT:-}" "${ANDROID_NDK_LATEST_HOME:-}"; do
  [[ -n "$c" && -d "$c" ]] && NDK_CANDIDATES+=("$c")
done
if [[ -d "$SDK/ndk" ]]; then
  for v in $(ls "$SDK/ndk" | sort_versions | awk '{a[NR]=$0} END {for (i=NR;i>0;i--) print a[i]}'); do
    NDK_CANDIDATES+=("$SDK/ndk/$v")
  done
fi

READELF=""
OBJDUMP=""
if [[ -n "$HOST_TAG" ]]; then
  for ndk in ${NDK_CANDIDATES[@]+"${NDK_CANDIDATES[@]}"}; do
    bin="$ndk/toolchains/llvm/prebuilt/$HOST_TAG/bin"
    if [[ -x "$bin/llvm-readelf" ]]; then READELF="$bin/llvm-readelf"; break; fi
    if [[ -x "$bin/llvm-objdump" ]]; then OBJDUMP="$bin/llvm-objdump"; break; fi
  done
fi
if [[ -z "$READELF" && -z "$OBJDUMP" ]]; then
  if command -v llvm-readelf >/dev/null; then READELF=$(command -v llvm-readelf)
  elif command -v readelf >/dev/null; then READELF=$(command -v readelf)
  elif command -v llvm-objdump >/dev/null; then OBJDUMP=$(command -v llvm-objdump)
  else die "no llvm-readelf/readelf/llvm-objdump found (install the NDK)"; fi
fi

# ---- Collect target libraries ------------------------------------------------------------
LIBS=$(unzip -Z1 "$ARCHIVE" | grep -E "^${LIB_PREFIX}/${ABIS_REGEX}/[^/]+\.so$" || true)

echo "Archive:  $ARCHIVE"
echo "zipalign: ${ZIPALIGN:-<not found>}"
echo "ELF tool: ${READELF:-$OBJDUMP}"
echo

if [[ -z "$LIBS" ]]; then
  echo "No arm64-v8a / x86_64 native libraries found. Nothing to check."
  exit 0
fi

WORK=$(mktemp -d "${TMPDIR:-/tmp}/check16kb.XXXXXX")
trap 'rm -rf "$WORK"' EXIT

# ---- (a) ZIP alignment -------------------------------------------------------------------
ZIP_STATUS_FILE="$WORK/zip.txt"   # "<entry>\t<status>"
: >"$ZIP_STATUS_FILE"
ZIP_RESULT="skipped"
if [[ "$KIND" == apk ]]; then
  [[ -n "$ZIPALIGN" ]] || die "zipalign from build-tools >= 35 not found under $SDK/build-tools"
  set +e
  "$ZIPALIGN" -c -P 16 -v 4 "$ARCHIVE" >"$WORK/zipalign.log" 2>&1
  ZIP_RC=$?
  set -e
  # Lines look like: "   12345 lib/arm64-v8a/libfoo.so (OK - compressed)" or "(BAD - 4096)".
  sed -nE 's/^[[:space:]]*[0-9]+[[:space:]]+([^ ].*) \((.*)\)[[:space:]]*$/\1	\2/p' \
    "$WORK/zipalign.log" >"$ZIP_STATUS_FILE"
  ZIP_RESULT=$([[ $ZIP_RC -eq 0 ]] && echo pass || echo fail)
fi

# ---- (b) ELF LOAD segment alignment ------------------------------------------------------
min_load_align() {
  # Prints the smallest PT_LOAD alignment (decimal) of the ELF file $1, or "none".
  local f="$1"
  if [[ -n "$READELF" ]]; then
    "$READELF" -lW "$f" 2>/dev/null | awk '$1=="LOAD" {print $NF}'
  else
    "$OBJDUMP" -p "$f" 2>/dev/null | awk '$1=="LOAD" { for (i=1;i<=NF;i++) if ($i=="align") print $(i+1) }'
  fi | while read -r a; do
    case "$a" in
      2\*\*[0-9]*) echo $((1 << ${a#"2**"})) ;;
      0x* | 0X*) printf '%d\n' "$a" ;;
      *) echo "$a" ;;
    esac
  done | sort -n | head -n 1
}

FAIL=0
ROWS="$WORK/rows.txt"
: >"$ROWS"
while IFS= read -r entry; do
  [[ -n "$entry" ]] || continue
  out="$WORK/so/$entry"
  mkdir -p "$(dirname "$out")"
  unzip -p "$ARCHIVE" "$entry" >"$out"

  elf_align=$(min_load_align "$out")
  if [[ -z "$elf_align" ]]; then
    elf_col="no LOAD?"; elf_ok=0
  elif [[ "$elf_align" -ge $MIN_ALIGN ]]; then
    elf_col="OK ($elf_align)"; elf_ok=1
  else
    elf_col="BAD ($elf_align)"; elf_ok=0
  fi

  if [[ "$KIND" == apk ]]; then
    zs=$(awk -F'\t' -v e="$entry" '$1==e {print $2; exit}' "$ZIP_STATUS_FILE")
    zs=${zs:-not reported}
    case "$zs" in OK*) zip_ok=1 ;; *) zip_ok=0 ;; esac
    zip_col="$zs"
  else
    zip_col="n/a (aab)"; zip_ok=1
  fi

  if [[ $elf_ok -eq 1 && $zip_ok -eq 1 ]]; then
    status=PASS
  else
    status=FAIL; FAIL=1
  fi
  printf '%s\t%s\t%s\t%s\n' "$status" "$entry" "$zip_col" "$elf_col" >>"$ROWS"
done <<<"$LIBS"

total=$(wc -l <"$ROWS" | tr -d ' ')
bad=$(grep -c '^FAIL' "$ROWS" || true)

print_table() {
  awk -F'\t' 'BEGIN { printf "%-6s  %-55s  %-24s  %s\n", "STATUS", "LIBRARY", "ZIP (zipalign -P 16)", "ELF min LOAD align" }
              { printf "%-6s  %-55s  %-24s  %s\n", $1, $2, $3, $4 }'
}

echo "All checked libraries:"
print_table <"$ROWS"
echo

if [[ "$KIND" == apk && "$ZIP_RESULT" == fail ]]; then
  other=$(grep -vE "^${LIB_PREFIX}/${ABIS_REGEX}/" "$ZIP_STATUS_FILE" | grep -v $'\tOK' || true)
  if [[ -n "$other" ]]; then
    echo "Note: zipalign also flagged entries outside the checked ABIs:"
    echo "$other" | sed 's/^/  /'
    echo
  fi
fi

if [[ $FAIL -ne 0 ]]; then
  echo "FAIL: $bad of $total libraries are not 16 KB compatible:"
  grep '^FAIL' "$ROWS" | print_table
  exit 1
fi

echo "PASS: all $total arm64-v8a/x86_64 libraries are 16 KB aligned (zip: $ZIP_RESULT, ELF: pass)."
