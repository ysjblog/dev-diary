#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 /absolute/or/relative/path/to/DevDiary.dmg" >&2
  exit 64
}

[[ $# -eq 1 ]] || usage
dmg_path="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
[[ -f "$dmg_path" ]] || { echo "DMG not found: $dmg_path" >&2; exit 1; }
dmg_name="$(basename "$dmg_path")"
[[ "$dmg_name" =~ ^DevDiary_([0-9]+\.[0-9]+\.[0-9]+)_aarch64\.dmg$ ]] || {
  echo "DMG name must be DevDiary_<semantic-version>_aarch64.dmg: $dmg_name" >&2
  exit 1
}
expected_version="${BASH_REMATCH[1]}"
expected_name="DevDiary_${expected_version}_aarch64.dmg"
[[ "$dmg_name" == "$expected_name" ]] || { echo "DMG name does not match its parsed version." >&2; exit 1; }

mount_dir="$(mktemp -d "${TMPDIR:-/tmp}/devdiary-release-verify.XXXXXX")"
cleanup() {
  hdiutil detach "$mount_dir" -quiet 2>/dev/null || true
  rmdir "$mount_dir" 2>/dev/null || true
}
trap cleanup EXIT

hdiutil verify "$dmg_path"
hdiutil attach "$dmg_path" -nobrowse -readonly -mountpoint "$mount_dir" -quiet

app_path="$mount_dir/DevDiary.app"
[[ -d "$app_path" ]] || { echo "Release DMG is missing DevDiary.app." >&2; exit 1; }
bundle_version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app_path/Contents/Info.plist")"
bundle_build="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$app_path/Contents/Info.plist")"
[[ "$bundle_version" == "$expected_version" ]] || {
  echo "DMG filename version $expected_version does not match app version $bundle_version." >&2
  exit 1
}
[[ "$bundle_build" == "$expected_version" ]] || {
  echo "DMG filename version $expected_version does not match app build version $bundle_build." >&2
  exit 1
}
[[ -L "$mount_dir/Applications" ]] || { echo "Release DMG is missing the Applications drag-install shortcut." >&2; exit 1; }
[[ "$(readlink "$mount_dir/Applications")" == "/Applications" ]] || { echo "Release DMG Applications shortcut does not point to /Applications." >&2; exit 1; }
[[ -f "$mount_dir/.background/dmg-background.png" ]] || { echo "Release DMG is missing the drag-install background." >&2; exit 1; }
strings "$mount_dir/.DS_Store" | grep -q 'dmg-background.png' || {
  echo "Release DMG includes the background file but Finder is not configured to use it." >&2
  exit 1
}

codesign --verify --deep --strict --verbose=4 "$app_path"
signature_output="$(codesign --display --verbose=4 "$app_path" 2>&1)"
grep -q '^Signature=adhoc$' <<<"$signature_output" || {
  echo "Release DMG app is not sealed with the expected final ad-hoc signature:" >&2
  echo "$signature_output" >&2
  exit 1
}
grep -q '^Sealed Resources version=2' <<<"$signature_output" || {
  echo "Release DMG app has no sealed resources:" >&2
  echo "$signature_output" >&2
  exit 1
}

while IFS= read -r executable; do
  if /usr/bin/file -b "$executable" | grep -q 'Mach-O'; then
    codesign --verify --strict --verbose=2 "$executable"
  fi
done < <(find "$app_path" -type f -perm -111 -print)

quarantine_app="$(mktemp -d "${TMPDIR:-/tmp}/devdiary-quarantine-check.XXXXXX")/DevDiary.app"
cleanup_quarantine() {
  rm -rf "${quarantine_app%/DevDiary.app}"
}
trap 'cleanup_quarantine; cleanup' EXIT

ditto "$app_path" "$quarantine_app"
codesign --verify --deep --strict --verbose=2 "$quarantine_app"
xattr -w com.apple.quarantine '0081;6f2d6b00;Safari;F00DBAAD-0000-0000-0000-000000000000' "$quarantine_app"

gatekeeper_output="$(spctl --assess --type execute --verbose=4 "$quarantine_app" 2>&1)" && {
  echo "Gatekeeper unexpectedly accepted the non-Developer-ID diagnostic copy:" >&2
  echo "$gatekeeper_output" >&2
  exit 1
}
echo "$gatekeeper_output"
if grep -Eqi 'sealed resource|code signature.*not valid|bundle format unrecognized|invalid signature' <<<"$gatekeeper_output"; then
  echo "Gatekeeper reported a bundle-integrity or signature failure instead of a manual-approval assessment." >&2
  exit 1
fi

echo "Verified valid ad-hoc manual-approval DevDiary release DMG: $dmg_path"
