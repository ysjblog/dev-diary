import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const smokeScript = path.join(scriptDir, 'smoke-local-runtime.mjs');
const digestScript = path.join(scriptDir, 'verification-candidate-digest.sh');

function candidateDigest() {
  return execFileSync('bash', [digestScript, path.dirname(scriptDir)], { encoding: 'utf8' }).trim();
}

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [smokeScript, ...args], {
      cwd: path.dirname(scriptDir),
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

test('rejects incomplete arguments without creating evidence', async () => {
  const result = await run([]);
  assert.notEqual(result.code, 0);
  assert.equal(result.signal, null);
  assert.match(result.stderr, /--revision.*--output|usage/i);
});

test('runs the isolated local API smoke, writes revision-bound PASS evidence and exits', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'devdiary-runtime-smoke-test.'));
  const output = path.join(tempDir, 'nested', 'runtime-smoke.json');
  const revision = candidateDigest();
  try {
    const result = await run(['--revision', revision, '--output', output]);
    assert.equal(result.signal, null);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const evidence = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(evidence.revision, revision);
    assert.equal(evidence.status, 'PASS');
    assert.equal(evidence.effects.scan_calls, 0);
    assert.equal(evidence.effects.scheduler_calls, 0);
    assert.equal(evidence.scenarios.every((scenario) => scenario.status === 'PASS'), true);
    assert.match(result.stdout, /PASS/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('rejects a revision that does not identify the loaded worktree and creates no evidence', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'devdiary-runtime-smoke-mismatch.'));
  const output = path.join(tempDir, 'runtime-smoke.json');
  try {
    const result = await run(['--revision', 'a'.repeat(64), '--output', output]);
    assert.equal(result.signal, null);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /revision.*worktree|mismatch/i);
    await assert.rejects(readFile(output, 'utf8'), { code: 'ENOENT' });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
