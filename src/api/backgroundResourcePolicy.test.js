import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

test('shell installer generates Standard resource policy and preserves service identity', { skip: process.platform !== 'darwin' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'devdiary-policy-'))
  try {
    const scripts = join(root, 'scripts'), homeFixture = join(root, 'fixture-home'), bin = join(root, 'bin')
    mkdirSync(scripts); mkdirSync(homeFixture); mkdirSync(bin)
    const source = readFileSync(new URL('../../scripts/devdiary-background-agent.sh', import.meta.url), 'utf8')
    // Redirect only copied-script paths; preserve the invoking process HOME.
    writeFileSync(join(scripts, 'devdiary-background-agent.sh'), source.replaceAll('$HOME', homeFixture))
    writeFileSync(join(scripts, 'devdiary-background-launcher.sh'), '#!/bin/bash\nexit 99\n', { mode: 0o700 })
    writeFileSync(join(bin, 'launchctl'), '#!/bin/bash\nprintf "%s\\n" "$*" >> "$POLICY_TEST_CALLS"\n', { mode: 0o700 })
    const calls = join(root, 'calls')
    execFileSync('/bin/bash', [join(scripts, 'devdiary-background-agent.sh'), 'install'], {
      env: { ...process.env, PATH: `${bin}:/usr/bin:/bin`, POLICY_TEST_CALLS: calls }, stdio: 'pipe',
    })
    const path = join(root, '.launchagents/com.ysjblog.devdiary.background.plist')
    const plist = JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path], { encoding: 'utf8' }))
    assert.equal(plist.ProcessType, 'Standard')
    assert.equal(plist.Label, 'com.ysjblog.devdiary.background')
    assert.equal(plist.RunAtLoad, true); assert.equal(plist.KeepAlive, true)
    assert.deepEqual(plist.ProgramArguments, ['/bin/bash', join(scripts, 'devdiary-background-launcher.sh'), 'run'])
    assert.match(readFileSync(calls, 'utf8'), /bootstrap gui\/\d+ /)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
