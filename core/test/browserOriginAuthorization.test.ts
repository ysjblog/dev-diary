import { describe, expect, it, vi } from 'vitest';
import { openDb } from '../src/db/index.js';
import { seedDatabase } from '../src/db/seed.js';
import { createServer, type CreateServerOptions } from '../src/server.js';
import type { DailySchedulerRuntime } from '../src/services/dailyScheduler.js';

const FORBIDDEN = {
  error: 'forbidden_origin',
  message: 'Browser origin is not trusted for this local service.',
};

async function closeServer(server: ReturnType<ReturnType<typeof createServer>['listen']>): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

function safeOptions(spies: { scan: ReturnType<typeof vi.fn>; scheduler: ReturnType<typeof vi.fn> }): CreateServerOptions {
  return {
    dbPath: ':memory:',
    projectRoots: [],
    scanProvider: {
      scanProject: spies.scan.mockReturnValue({
        sessions: [], kanban_cards: [], daily_summary: null, warnings: [],
      }),
    },
    agentDetector: async () => ({ agents: [] }) as never,
    dailyScheduler: {
      getStatus: () => ({
        enabled: false, run_time_local: '01:00', timezone: 'Asia/Taipei', running: false,
        last_run_date: null, last_run_at: null, last_status: 'idle', last_error: null, last_project_count: 0,
      }),
      runNow: spies.scheduler.mockResolvedValue({
        status: 'success', date: '2026-07-01', message: 'safe test', project_count: 0,
        daily_log_updated: false, project_drafts_updated: 0, project_summaries_updated: 0,
        daily_diaries_updated: 0, daily_diaries_preserved: 0, daily_diaries_fallback: 0,
        daily_highlight_updated: 0, kanban_cards_updated: 0, error_message: null,
      }),
    } as unknown as DailySchedulerRuntime,
  };
}

describe('Core browser-origin authorization', () => {
  it('denies hostile-Origin GET, OPTIONS and malformed JSON before dispatch/parser', async () => {
    const db = openDb(':memory:');
    const scan = vi.fn();
    const scheduler = vi.fn();
    const app = createServer(db, safeOptions({ scan, scheduler }));
    const server = app.listen(0);
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('test server failed to listen');
      const base = `http://127.0.0.1:${address.port}`;
      for (const request of [
        fetch(`${base}/api/health`, { headers: { origin: 'https://attacker.example' } }),
        fetch(`${base}/api/settings`, { method: 'OPTIONS', headers: { origin: 'https://attacker.example' } }),
        fetch(`${base}/api/settings`, {
          method: 'PATCH',
          headers: { origin: 'null', 'content-type': 'application/json' },
          body: '{ malformed',
        }),
      ]) {
        const response = await request;
        expect(response.status).toBe(403);
        expect(response.headers.get('access-control-allow-origin')).toBeNull();
        expect(await response.json()).toEqual(FORBIDDEN);
      }
      expect(scan).not.toHaveBeenCalled();
      expect(scheduler).not.toHaveBeenCalled();
    } finally {
      await closeServer(server);
      db.close();
    }
  });

  it('denies all 21 current mutation routes through one central guard with zero representative effects', async () => {
    const db = openDb(':memory:');
    seedDatabase(db, { today: '2026-07-01' });
    const scan = vi.fn();
    const scheduler = vi.fn();
    const app = createServer(db, safeOptions({ scan, scheduler }));
    const server = app.listen(0);
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('test server failed to listen');
      const base = `http://127.0.0.1:${address.port}`;
      const routes = [
        ['PATCH', '/api/settings'],
        ['POST', '/api/agents/detect'],
        ['PUT', '/api/agents/not-real/executable-source'],
        ['PUT', '/api/agents/not-real/activity-log-source'],
        ['POST', '/api/agents/custom/probe'],
        ['POST', '/api/agents/custom'],
        ['PATCH', '/api/agents/custom/not-real'],
        ['DELETE', '/api/agents/custom/not-real'],
        ['POST', '/api/scheduler/daily/run'],
        ['POST', '/api/scan'],
        ['POST', '/api/projects/999999/scan'],
        ['POST', '/api/projects/999999/kanban/ai-sync'],
        ['POST', '/api/projects/999999/comments'],
        ['PATCH', '/api/projects/999999/comments/999999'],
        ['DELETE', '/api/projects/999999/comments/999999'],
        ['PATCH', '/api/projects/999999/kanban/999999'],
        ['PUT', '/api/projects/999999/summary'],
        ['POST', '/api/projects/999999/summary/regenerate'],
        ['POST', '/api/projects/999999/summary/accept-draft'],
        ['PUT', '/api/projects/999999/diary/2026-07-01'],
        ['POST', '/api/projects/999999/diary/2026-07-01/regenerate'],
      ] as const;
      expect(routes).toHaveLength(21);
      const settingsBefore = db.prepare(`SELECT value FROM app_settings ORDER BY key`).all();
      for (const [method, path] of routes) {
        const response = await fetch(`${base}${path}`, {
          method,
          headers: { origin: 'https://attacker.example', 'content-type': 'application/json' },
          body: method === 'DELETE' ? undefined : '{}',
        });
        expect(response.status, `${method} ${path}`).toBe(403);
        expect(await response.json(), `${method} ${path}`).toEqual(FORBIDDEN);
      }
      expect(scan).not.toHaveBeenCalled();
      expect(scheduler).not.toHaveBeenCalled();
      expect(db.prepare(`SELECT value FROM app_settings ORDER BY key`).all()).toEqual(settingsBefore);
    } finally {
      await closeServer(server);
      db.close();
    }
  });

  it('allows exact configured worktree Origins and deliberate no-Origin CLI methods only', async () => {
    const db = openDb(':memory:');
    const scan = vi.fn();
    const scheduler = vi.fn();
    const opts = {
      ...safeOptions({ scan, scheduler }),
      additionalBrowserOrigins: ['http://localhost:5180', 'http://127.0.0.1:5180'],
    } as CreateServerOptions;
    const app = createServer(db, opts);
    const server = app.listen(0);
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('test server failed to listen');
      const base = `http://127.0.0.1:${address.port}`;
      const trusted = await fetch(`${base}/api/health`, { headers: { origin: 'http://localhost:5180' } });
      expect(trusted.status).toBe(200);
      expect(trusted.headers.get('access-control-allow-origin')).toBe('http://localhost:5180');

      const trustedOptions = await fetch(`${base}/api/settings`, {
        method: 'OPTIONS', headers: { origin: 'http://127.0.0.1:5180' },
      });
      expect(trustedOptions.status).toBe(204);
      expect(trustedOptions.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:5180');

      const cliGet = await fetch(`${base}/api/health`);
      const cliPatch = await fetch(`${base}/api/settings`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ appearance: 'dark' }),
      });
      const cliOptions = await fetch(`${base}/api/settings`, { method: 'OPTIONS' });
      expect([cliGet.status, cliPatch.status, cliOptions.status]).toEqual([200, 200, 204]);
      expect(cliGet.headers.get('access-control-allow-origin')).toBeNull();
      expect(cliPatch.headers.get('access-control-allow-origin')).toBeNull();
      expect(cliOptions.headers.get('access-control-allow-origin')).toBeNull();

      for (const method of ['GET', 'POST'] as const) {
        const crossSite = await fetch(`${base}/api/health`, {
          method,
          headers: { 'sec-fetch-site': 'cross-site' },
        });
        expect(crossSite.status).toBe(403);
        expect(await crossSite.json()).toEqual(FORBIDDEN);
      }
    } finally {
      await closeServer(server);
      db.close();
    }
  });

  it('fails server construction for any invalid or colliding additional Origin', () => {
    const db = openDb(':memory:');
    try {
      for (const additionalBrowserOrigins of [
        [''],
        ['http://localhost:5180', 'http://localhost:5180'],
        ['http://localhost:5173'],
        ['http://localhost:5180/'],
        ['http://localhost.attacker.example:5180'],
      ]) {
        expect(() => createServer(db, { additionalBrowserOrigins } as CreateServerOptions)).toThrow();
      }
    } finally {
      db.close();
    }
  });
});
