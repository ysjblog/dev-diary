import { describe, expect, it } from 'vitest';
import { appendFileSync, chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/db/index.js';
import { createServer } from '../src/server.js';
import { encodeExpectedCoreTargetHeader, type VerifiedCoreTargetSnapshot } from '../src/services/codexDesktopResumeContracts.js';
import { createCodexCliResumeDispatcher, createCodexDesktopResumeEngine } from '../src/services/codexDesktopResumeEngine.js';
import { resolveCodexDesktopRegistration } from '../src/services/codexDesktopSessionLookup.js';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const snapshot: VerifiedCoreTargetSnapshot = {
  origin: 'http://127.0.0.1:4317', source: 'verified_manifest', manifest_digest: 'a'.repeat(64),
  runtime: { host: '127.0.0.1', port: 4317, pid: 1, started_at: '2026-09-09T00:00:00.000Z' },
  api_contract_version: 8, capabilities: ['codex.desktop-resume.multi-target-v2'],
};

async function withApi(run: (base: string, db: ReturnType<typeof openDb>) => Promise<void>) {
  const db = openDb(':memory:');
  const app = createServer(db, {
    dbPath: ':memory:',
    verifyCodexResumeMutationTarget: (value) =>
      value.manifest_digest === snapshot.manifest_digest
      && value.origin === snapshot.origin
      && value.runtime.host === snapshot.runtime.host
      && value.runtime.port === snapshot.runtime.port
      && value.runtime.pid === snapshot.runtime.pid
      && value.runtime.started_at === snapshot.runtime.started_at
      && value.api_contract_version === snapshot.api_contract_version
      && value.capabilities.join('\0') === snapshot.capabilities.join('\0'),
    resolveCodexResumeRegistration: (threadId, displayName) => ({
      thread_id: threadId, display_name: displayName, session_locator: `root:${threadId}.jsonl`,
      timezone_id: 'Asia/Taipei', timezone_authority: 'node=22;icu=75;tz=2024a',
      registration_file_dev: '1', registration_file_ino: '2', registration_end_offset: '100',
      registration_prefix_digest: 'b'.repeat(64),
    }),
  });
  const server = app.listen(0);
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('listen failed');
    await run(`http://127.0.0.1:${address.port}`, db);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  }
}

function mutationHeaders() {
  return {
    origin: 'tauri://localhost', 'content-type': 'application/json',
    'x-devdiary-expected-core-target': encodeExpectedCoreTargetHeader(snapshot),
  };
}

describe('Codex Desktop v8 dedicated API', () => {
  it('registers, renames, pauses and deletes a target through runtime-bound routes', async () => {
    await withApi(async (base) => {
      const created = await fetch(`${base}/api/codex/desktop-resume/targets`, {
        method: 'POST', headers: mutationHeaders(),
        body: JSON.stringify({ deep_link: `codex://threads/${id}`, display_name: '目前任務' }),
      });
      expect(created.status).toBe(200);
      expect((await created.json() as any).codex_desktop_resume.targets[0]).toMatchObject({ thread_id: id, display_name: '目前任務' });

      const patched = await fetch(`${base}/api/codex/desktop-resume/targets/${id}`, {
        method: 'PATCH', headers: mutationHeaders(), body: JSON.stringify({ display_name: '新名稱', enabled: false }),
      });
      expect(patched.status).toBe(200);
      expect((await patched.json() as any).codex_desktop_resume.targets[0]).toMatchObject({ display_name: '新名稱', enabled: false });

      const removed = await fetch(`${base}/api/codex/desktop-resume/targets/${id}`, { method: 'DELETE', headers: mutationHeaders() });
      expect(removed.status).toBe(200);
      expect((await removed.json() as any).codex_desktop_resume.targets).toEqual([]);
    });
  });

  it('rejects missing, malformed or stale runtime authority before parsing the body', async () => {
    await withApi(async (base, db) => {
      for (const header of [undefined, '***', encodeExpectedCoreTargetHeader({ ...snapshot, manifest_digest: 'c'.repeat(64) })]) {
        const response = await fetch(`${base}/api/codex/desktop-resume/targets`, {
          method: 'POST', headers: { origin: 'tauri://localhost', ...(header ? { 'x-devdiary-expected-core-target': header } : {}) },
          body: '{ malformed',
        });
        expect(response.status).toBe(409);
        expect((await response.json() as any).error).toBe('runtime_target_changed');
      }
      expect((db.prepare(`SELECT COUNT(*) AS count FROM codex_desktop_resume_targets`).get() as any).count).toBe(0);
    });
  });

  it('retires old single-target mutation routes without effects', async () => {
    await withApi(async (base, db) => {
      for (const path of ['register', 'stop']) {
        const response = await fetch(`${base}/api/codex/desktop-resume/${path}`, { method: 'POST', headers: { origin: 'tauri://localhost' } });
        expect(response.status).toBe(410);
      }
      expect((db.prepare(`SELECT COUNT(*) AS count FROM codex_desktop_resume_targets`).get() as any).count).toBe(0);
    });
  });

  it('runs the API-to-session-to-fake-CLI path without contacting a real Codex task', async () => {
    const root = mkdtempSync(join(tmpdir(), 'codex-v8-runtime-'));
    const sessionDir = join(root, 'sessions'); mkdirSync(sessionDir);
    const sessionPath = join(sessionDir, 'target.jsonl');
    const binary = join(root, 'fake-codex'); const receipt = join(root, 'argv-receipt.txt');
    writeFileSync(sessionPath, `${JSON.stringify({ type: 'session_meta', payload: { id } })}\n`);
    writeFileSync(binary, `#!/bin/sh\nprintf '%s\\n' "$@" > '${receipt}'\nprintf '%s\\n' 'Queued message aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa for thread ${id}.'\n`);
    chmodSync(binary, 0o700);
    const db = openDb(':memory:');
    const app = createServer(db, {
      dbPath: ':memory:',
      verifyCodexResumeMutationTarget: () => true,
      resolveCodexResumeRegistration: (threadId, displayName) => resolveCodexDesktopRegistration(threadId, displayName, [root]),
    });
    const server = app.listen(0);
    try {
      const address = server.address(); if (!address || typeof address === 'string') throw new Error('listen failed');
      const base = `http://127.0.0.1:${address.port}`;
      const registered = await fetch(`${base}/api/codex/desktop-resume/targets`, {
        method: 'POST', headers: mutationHeaders(), body: JSON.stringify({ deep_link: `codex://threads/${id}`, display_name: '目前任務' }),
      });
      expect(registered.status).toBe(200);
      await fetch(`${base}/api/codex/desktop-resume`, { method: 'PATCH', headers: mutationHeaders(), body: JSON.stringify({ enabled: true }) });
      appendFileSync(sessionPath, `${JSON.stringify({ type: 'event_msg', timestamp: '2026-09-09T00:00:00.000Z', payload: { type: 'task_complete', error: { codex_error_info: 'usage_limit_exceeded', message: "You've hit your usage limit. Upgrade to Pro or try again at 9:30 AM." } } })}\n`);
      const engine = createCodexDesktopResumeEngine(db, () => [root], createCodexCliResumeDispatcher(binary), () => Date.parse('2026-09-09T02:00:00.000Z'));
      expect(await engine.tick()).toBe('resumed');
      expect(await engine.tick()).toBe('watching');
      expect(readFileSync(receipt, 'utf8').split('\n').filter(Boolean)).toEqual(['queue', '--thread', id, '--message', '繼續']);
      const state = await fetch(`${base}/api/codex/desktop-resume`, { headers: { origin: 'tauri://localhost' } });
      expect((await state.json() as any).codex_desktop_resume.targets[0]).toMatchObject({ state: 'resumed', reset_at_ms: Date.parse('2026-09-09T01:30:00.000Z') });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      db.close(); rmSync(root, { recursive: true, force: true });
    }
  });
});
