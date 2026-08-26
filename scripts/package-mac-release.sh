#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "macOS release packaging blocked: $*" >&2
  exit 1
}

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node_version="22.23.1"
node_archive="node-v${node_version}-darwin-arm64.tar.gz"
node_sha256="ef28d8fab2c0e4314522d4bb1b7173270aa3937e93b92cb7de79c112ac1fa953"
marker="$(mktemp "${TMPDIR:-/tmp}/devdiary-macos-release.XXXXXX")"
stage_dir="$(mktemp -d "${TMPDIR:-/tmp}/devdiary-macos-release.XXXXXX")"
rw_dmg="$stage_dir/DevDiary-rw.dmg"
unsigned_dmg="$stage_dir/DevDiary-unsigned.dmg"
mount_dir="$stage_dir/mount"
python_deps="$stage_dir/python-deps"
node_archive_path="$stage_dir/$node_archive"
cleanup() {
  hdiutil detach "$mount_dir" -quiet 2>/dev/null || true
  rm -f "$marker"
  rm -rf "$stage_dir"
}
trap cleanup EXIT

cd "$root_dir"
app_version="$(node -p "require('./package.json').version")"
[[ "$app_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "package.json has an invalid release version: $app_version"
expected_dmg="$root_dir/src-tauri/target/release/bundle/dmg/DevDiary_${app_version}_aarch64.dmg"
npx tauri build --bundles dmg --no-sign

dmg_path="$expected_dmg"
[[ -f "$dmg_path" && "$dmg_path" -nt "$marker" ]] || fail "Tauri did not create the expected fresh DMG: $expected_dmg"
hdiutil convert "$dmg_path" -format UDRW -o "$rw_dmg" -ov >/dev/null
read -r minimum_sectors _ < <(hdiutil resize -limits "$rw_dmg")
[[ "$minimum_sectors" =~ ^[0-9]+$ ]] || fail "Unable to determine the writable DMG minimum size."
# hdiutil reports 512-byte sectors. Keep 256 MiB above the filesystem's
# current minimum so the bundled Node runtime and final Finder metadata fit
# even when Core dependencies make the base App larger than an older release.
target_mib=$(( (minimum_sectors + 2047) / 2048 + 256 ))
hdiutil resize -size "${target_mib}m" "$rw_dmg" >/dev/null
mkdir -p "$mount_dir"
hdiutil attach "$rw_dmg" -nobrowse -mountpoint "$mount_dir" -quiet
app_path="$mount_dir/DevDiary.app"
main_binary="$app_path/Contents/MacOS/app"
[[ -f "$main_binary" ]] || fail "Tauri DMG is missing DevDiary's main executable."
[[ "$(uname -m)" == "arm64" ]] || fail "The public DevDiary DMG currently targets Apple Silicon only."
if [[ -n "${DEVDIARY_NODE_ARCHIVE:-}" ]]; then
  [[ -f "$DEVDIARY_NODE_ARCHIVE" ]] || fail "DEVDIARY_NODE_ARCHIVE does not exist."
  cp "$DEVDIARY_NODE_ARCHIVE" "$node_archive_path"
else
  curl --fail --location --retry 3 --output "$node_archive_path" "https://nodejs.org/dist/v${node_version}/${node_archive}"
fi
printf '%s  %s\n' "$node_sha256" "$node_archive_path" | shasum -a 256 -c - >/dev/null
mkdir -p "$app_path/Contents/Resources/core/node/bin"
tar -xzf "$node_archive_path" -C "$app_path/Contents/Resources/core/node/bin" --strip-components=2 "node-v${node_version}-darwin-arm64/bin/node"
"$app_path/Contents/Resources/core/node/bin/node" --version | grep -qx "v${node_version}" || fail "Bundled Node runtime version check failed."
while IFS= read -r -d '' executable; do
  if /usr/bin/file -b "$executable" | grep -q 'Mach-O'; then
    codesign --force --sign - "$executable"
  fi
done < <(find "$app_path" -type f -print0)
codesign --force --sign - "$app_path"
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
