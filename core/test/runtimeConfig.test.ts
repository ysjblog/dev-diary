import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { SCHEMA_VERSION } from '../src/db/schema.js';
import { defaultDbPath, parseProjectRoots, resolveRuntimeConfig } from '../src/runtimeConfig.js';

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'devdiary-runtime-config-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe('Runtime config', () => {
  it('未設定 DEVDIARY_DB 時預設使用 macOS app data SQLite path', () => {
    const homeDir = '/Users/devdiary-test';

    expect(defaultDbPath(homeDir)).toBe('/Users/devdiary-test/Library/Application Support/DevDiary/DevDiary.sqlite');
    expect(resolveRuntimeConfig({}, { homeDir })).toEqual({
      dbPath: '/Users/devdiary-test/Library/Application Support/DevDiary/DevDiary.sqlite',
      projectRoots: [],
    });
  });

  it('persistent runtime 不自動套用本機私人 project roots，必須由 DEVDIARY_PROJECT_ROOTS 明確設定', () => {
    const homeDir = tempRoot();

    expect(resolveRuntimeConfig({}, { homeDir }).projectRoots).toEqual([]);
    expect(
      resolveRuntimeConfig(
        {
          DEVDIARY_PROJECT_ROOTS: '/tmp/projects-a:/tmp/projects-b',
        },
        { homeDir },
      ).projectRoots,
    ).toEqual(['/tmp/projects-a', '/tmp/projects-b']);
  });

  it('in-memory runtime 也必須明確設定 project roots', () => {
    expect(resolveRuntimeConfig({ DEVDIARY_DB: ':memory:' }).projectRoots).toEqual([]);
  });

  it('project root env parser 去除空白與空段落', () => {
    expect(parseProjectRoots(' /tmp/a : :/tmp/b  :')).toEqual(['/tmp/a', '/tmp/b']);
  });

  it('openDb 會建立 persistent DB 父資料夾', () => {
    const root = tempRoot();
    const dbPath = join(root, 'Library', 'Application Support', 'DevDiary', 'DevDiary.sqlite');
    const db = openDb(dbPath);

    try {
      expect(existsSync(dbPath)).toBe(true);
      expect((db.prepare(`SELECT value FROM schema_meta WHERE key = 'schema_version'`).get() as { value: string }).value).toBe(
        SCHEMA_VERSION,
      );
    } finally {
      db.close();
    }
  });
});
