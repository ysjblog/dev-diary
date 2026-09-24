import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BoundedFileReadError, boundedReadTailUtf8, boundedReadUtf8 } from '../src/services/boundedFileRead.js';

const roots: string[] = [];
const tempRoot = () => {
  const root = mkdtempSync(join(tmpdir(), 'devdiary-bounded-read-'));
  roots.push(root);
  return root;
};
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

describe('bounded filesystem reads', () => {
  it('returns UTF-8 through the fixed worker without a shell', () => {
    const root = tempRoot();
    const file = join(root, 'session.jsonl');
    writeFileSync(file, '{"ok":true}\n');
    expect(boundedReadUtf8(file)).toBe('{"ok":true}\n');
  });

  it('stops a filesystem worker that never returns', () => {
    const root = tempRoot();
    const worker = join(root, 'hang.mjs');
    const file = join(root, 'session.jsonl');
    writeFileSync(worker, 'setInterval(() => {}, 1_000);\n');
    writeFileSync(file, '{}\n');
    const startedAt = Date.now();
    expect(() => boundedReadUtf8(file, { workerPath: worker, timeoutMs: 50 })).toThrowError(BoundedFileReadError);
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });

  it('can read only a bounded tail for append-only session logs', () => {
    const root = tempRoot();
    const file = join(root, 'session.jsonl');
    writeFileSync(file, 'head\n' + 'x'.repeat(2_000) + '\ntail\n');
    expect(boundedReadTailUtf8(file, { maxBytes: 1_024 })).toContain('tail');
    expect(() => boundedReadUtf8(file, { maxBytes: 1_024 })).toThrowError(BoundedFileReadError);
  });
});
