import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ManualScanWorkerError, runIsolatedManualScan } from '../src/services/manualScanIsolation.js';

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'devdiary-scan-isolation-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('manual scan process isolation', () => {
  it('returns a validated child result without exposing child implementation details', async () => {
    const root = tempRoot();
    const workerPath = join(root, 'success.mjs');
    writeFileSync(workerPath, `process.stdout.write(JSON.stringify({status:'success',scope:'global',project_id:null,started_at:'2026-08-27T00:00:00.000Z',completed_at:'2026-08-27T00:00:01.000Z',scanned_projects:[1],skipped_projects:[],inserted_sessions:0,inserted_kanban_cards:0,updated_kanban_cards:0,updated_daily_logs:0,warnings:[],error_message:null}));\n`);

    const result = await runIsolatedManualScan({
      dbPath: '/tmp/test.sqlite',
      request: { scope: 'global', today: '2026-08-27' },
      workerPath,
      execArgv: [],
      timeoutMs: 1_000,
    });

    expect(result.status).toBe('success');
    expect(result.scanned_projects).toEqual([1]);
  });

  it('terminates a stuck child within the total scan deadline', async () => {
    const root = tempRoot();
    const workerPath = join(root, 'hang.mjs');
    writeFileSync(workerPath, 'setInterval(() => {}, 1_000);\n');
    const startedAt = Date.now();

    await expect(runIsolatedManualScan({
      dbPath: '/tmp/test.sqlite',
      request: { scope: 'global', today: '2026-08-27' },
      workerPath,
      execArgv: [],
      timeoutMs: 75,
    })).rejects.toMatchObject({ code: 'scan_timeout' } satisfies Partial<ManualScanWorkerError>);
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });
});
