#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "macOS release packaging blocked: $*" >&2
  exit 1
}

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
marker="$(mktemp "${TMPDIR:-/tmp}/devdiary-macos-release.XXXXXX")"
stage_dir="$(mktemp -d "${TMPDIR:-/tmp}/devdiary-macos-release.XXXXXX")"
rw_dmg="$stage_dir/DevDiary-rw.dmg"
unsigned_dmg="$stage_dir/DevDiary-unsigned.dmg"
mount_dir="$stage_dir/mount"
python_deps="$stage_dir/python-deps"
cleanup() {
  hdiutil detach "$mount_dir" -quiet 2>/dev/null || true
  rm -f "$marker"
  rm -rf "$stage_dir"
}
trap cleanup EXIT

cd "$root_dir"
npx tauri build --bundles dmg --no-sign

dmg_path="$(find "$root_dir/src-tauri/target/release/bundle/dmg" -type f -name '*.dmg' -newer "$marker" -print | head -n 1)"
[[ -n "$dmg_path" ]] || fail "Tauri did not create a fresh DMG artifact."
hdiutil convert "$dmg_path" -format UDRW -o "$rw_dmg" -ov >/dev/null
mkdir -p "$mount_dir"
hdiutil attach "$rw_dmg" -nobrowse -mountpoint "$mount_dir" -quiet
app_path="$mount_dir/DevDiary.app"
main_binary="$app_path/Contents/MacOS/app"
[[ -f "$main_binary" ]] || fail "Tauri DMG is missing DevDiary's main executable."
codesign --force --deep --sign - "$app_path"
codesign --verify --deep --strict --verbose=2 "$app_path"
signature_output="$(codesign --display --verbose=4 "$app_path" 2>&1)"
grep -q '^Signature=adhoc$' <<<"$signature_output" || fail "Unable to confirm the final ad-hoc bundle seal: $signature_output"
grep -q '^Sealed Resources version=2' <<<"$signature_output" || fail "Final ad-hoc bundle seal has no sealed resources: $signature_output"
python3 -m pip install --disable-pip-version-check --quiet --target "$python_deps" 'ds-store==1.3.3' 'mac-alias==2.2.3'
PYTHONPATH="$python_deps" python3 "$root_dir/scripts/configure-dmg-finder-layout.py" "$mount_dir"
hdiutil detach "$mount_dir" -quiet
hdiutil convert "$rw_dmg" -format UDZO -o "$unsigned_dmg" -ov >/dev/null
mv "$unsigned_dmg" "$dmg_path"
"$root_dir/scripts/verify-macos-release.sh" "$dmg_path"
