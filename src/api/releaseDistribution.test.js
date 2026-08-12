import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  findPrivateIdentity,
  listPublicCandidateFiles,
  privateIdentityMatchers,
  scanPublicFiles,
} from '../../scripts/check-public-release-hygiene.mjs'

const root = new URL('../..', import.meta.url)
const rootPath = fileURLToPath(root)
const readText = (path) => readFile(new URL(path, root), 'utf8')

describe('release distribution safeguards', () => {
  it('keeps every public version declaration and documentation example aligned', async () => {
    const [packageJson, packageLock, tauriConfig, cargoManifest, cargoLock, readme] = await Promise.all([
      readText('package.json'),
      readText('package-lock.json'),
      readText('src-tauri/tauri.conf.json'),
      readText('src-tauri/Cargo.toml'),
      readText('src-tauri/Cargo.lock'),
      readText('README.md'),
    ])
    const version = JSON.parse(packageJson).version

    assert.equal(version, '0.1.3')
    const parsedPackageLock = JSON.parse(packageLock)
    assert.equal(parsedPackageLock.version, version)
    assert.equal(parsedPackageLock.packages[''].version, version)
    assert.match(tauriConfig, new RegExp(`"version": "${version}"`))
    assert.match(cargoManifest, new RegExp(`^version = "${version}"$`, 'm'))
    const appEntries = [...cargoLock.matchAll(/^name = "app"\nversion = "([^"]+)"$/gm)]
    assert.equal(appEntries.length, 1)
    assert.equal(appEntries[0][1], version)
    assert.match(readme, new RegExp(`DevDiary_${version}_aarch64\\.dmg`))
    assert.doesNotMatch(readme, /DevDiary_0\.1\.1_aarch64\.dmg/)
  })

  it('keeps public source free of machine-specific checkout and production demo home paths', async () => {
    const violations = await scanPublicFiles(listPublicCandidateFiles(rootPath), { root: rootPath })
    assert.deepEqual(violations, [])

    const [appSource, seedSource] = await Promise.all([
      readText('src/App.jsx'),
      readText('core/src/db/seed.ts'),
    ])
    assert.doesNotMatch(appSource, /\/Users\/[A-Za-z0-9._-]+\//)
    assert.doesNotMatch(seedSource, /\/Users\/[A-Za-z0-9._-]+\//)
  })

  it('uses the same derived privacy boundary for release notes without embedding a maintainer identity', () => {
    const matchers = privateIdentityMatchers({
      root: rootPath,
      home: '/Users/release-owner',
      worktrees: ['/private/build/devdiary'],
    })
    assert.equal(findPrivateIdentity('DevDiary v0.1.3 fixes Taipei dates.', matchers), null)
    assert.notEqual(findPrivateIdentity('Built from /private/build/devdiary', matchers), null)
    assert.notEqual(findPrivateIdentity('Owner path /Users/release-owner/project', matchers), null)
    assert.notEqual(findPrivateIdentity('Volume /Volumes/Build/release-owner/project', matchers), null)
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
