import { describe, expect, it } from 'vitest';
import { openDb, type DB } from '../src/db/index.js';
import { createInMemoryFileScanCache, createSqliteFileScanCache } from '../src/services/logFileScanCache.js';

function sharedCases(label: string, makeCache: () => ReturnType<typeof createInMemoryFileScanCache>) {
  describe(label, () => {
    it('miss 時回傳 undefined，set 之後同一個 mtime 會 hit 並回傳原本的 payload', () => {
      const cache = makeCache();
      expect(cache.get('codex-cli', '/a/b.jsonl', 123)).toBeUndefined();

      cache.set('codex-cli', '/a/b.jsonl', 123, { cwd: '/a', candidate: { token_total: 42 } });
      expect(cache.get('codex-cli', '/a/b.jsonl', 123)).toEqual({ payload: { cwd: '/a', candidate: { token_total: 42 } } });
    });

    it('mtime 改變視為 stale，回傳 undefined 而不是舊 payload', () => {
      const cache = makeCache();
      cache.set('codex-cli', '/a/b.jsonl', 123, { ok: true });
      expect(cache.get('codex-cli', '/a/b.jsonl', 456)).toBeUndefined();
    });

    it('null payload 也能被快取（代表「已解析但沒有有效 session」），不等同於 miss', () => {
      const cache = makeCache();
      cache.set('codex-cli', '/a/b.jsonl', 123, null);
      expect(cache.get('codex-cli', '/a/b.jsonl', 123)).toEqual({ payload: null });
    });

    it('agent_name 或 file_path 不同視為不同 key', () => {
      const cache = makeCache();
      cache.set('codex-cli', '/a/b.jsonl', 123, { agent: 'codex' });
      expect(cache.get('claude-code', '/a/b.jsonl', 123)).toBeUndefined();
      expect(cache.get('codex-cli', '/a/c.jsonl', 123)).toBeUndefined();
    });
  });
}

sharedCases('in-memory file scan cache', createInMemoryFileScanCache);

describe('sqlite-backed file scan cache', () => {
  function freshDb(): DB {
    return openDb(':memory:');
  }

  sharedCases('sqlite file scan cache', () => createSqliteFileScanCache(freshDb()));

  it('同一個 db 底下建立的新 cache instance 仍讀得到先前寫入的資料（跨 scan run 持久化）', () => {
    const db = freshDb();
    const first = createSqliteFileScanCache(db);
    first.set('antigravity-cli', '/logs/cli-1.log', 999, { conversationId: 'agy-1' });

    const second = createSqliteFileScanCache(db);
    expect(second.get('antigravity-cli', '/logs/cli-1.log', 999)).toEqual({ payload: { conversationId: 'agy-1' } });
  });
});
