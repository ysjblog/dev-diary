import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

const root = new URL('../..', import.meta.url)
const readText = (path) => readFile(new URL(path, root), 'utf8')

describe('release distribution safeguards', () => {
  it('keeps every public version declaration and documentation example aligned', async () => {
    const [packageJson, packageLock, tauriConfig, cargoManifest, readme] = await Promise.all([
      readText('package.json'),
      readText('package-lock.json'),
      readText('src-tauri/tauri.conf.json'),
      readText('src-tauri/Cargo.toml'),
      readText('README.md'),
    ])
    const version = JSON.parse(packageJson).version

    assert.equal(version, '0.1.2')
    assert.equal(JSON.parse(packageLock).version, version)
    assert.match(tauriConfig, new RegExp(`"version": "${version}"`))
    assert.match(cargoManifest, new RegExp(`^version = "${version}"$`, 'm'))
    assert.match(readme, new RegExp(`DevDiary_${version}_aarch64\\.dmg`))
    assert.doesNotMatch(readme, /DevDiary_0\.1\.1_aarch64\.dmg/)
  })

  it('selects and verifies only the exact versioned DMG', async () => {
    const [packager, verifier] = await Promise.all([
      readText('scripts/package-mac-release.sh'),
      readText('scripts/verify-macos-release.sh'),
    ])

    assert.match(packager, /expected_dmg=/)
    assert.doesNotMatch(packager, /find .*\.dmg.*head -n 1/)
    assert.match(verifier, /CFBundleShortVersionString/)
    assert.match(verifier, /DevDiary_\$\{expected_version\}_aarch64\.dmg/)
  })

  it('keeps GitHub Actions verification-only and unable to publish or overwrite a release', async () => {
    const workflow = await readText('.github/workflows/macos-release.yml')

    assert.match(workflow, /workflow_dispatch:/)
    assert.doesNotMatch(workflow, /^\s*push:/m)
    assert.match(workflow, /contents: read/)
    assert.doesNotMatch(workflow, /contents: write/)
    assert.doesNotMatch(workflow, /gh release (?:create|upload)/)
    assert.doesNotMatch(workflow, /--clobber/)
  })
})
