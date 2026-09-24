import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { createServer } from '../src/server.js';
import { CORE_API_CONTRACT_VERSION } from '../src/services/runtimeHealth.js';

describe('Runtime health', () => {
  describe('Mock API', () => {
    it('GET /api/health reports local runtime identity and capabilities', async () => {
      const db = openDb(':memory:');
      const app = createServer(db, {
        dbPath: ':memory:',
        projectRoots: ['/tmp/projects'],
        runtime: {
          port: 4317,
          startedAt: '2026-06-30T00:00:00.000Z',
          pid: 12345,
        },
      });
      const server = app.listen(0);
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('test server failed to listen');
        const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
        const body = (await response.json()) as {
          ok: boolean;
          service: string;
          api_contract_version: number;
          runtime: { host: string; port: number; pid: number; started_at: string };
          capabilities: string[];
          project_roots_count: number;
        };

        expect(response.status).toBe(200);
        expect(body.ok).toBe(true);
        expect(body.service).toBe('devdiary-core');
        expect(body.api_contract_version).toBe(CORE_API_CONTRACT_VERSION);
        expect(body.runtime).toEqual({
          host: '127.0.0.1',
          port: 4317,
          pid: 12345,
          started_at: '2026-06-30T00:00:00.000Z',
        });
        expect(body.capabilities).toContain('scheduler.daily.run');
        expect(body.capabilities).toContain('scheduler.daily.preflight');
        expect(body.capabilities).toContain('agents.detect');
        expect(body.capabilities).toContain('exports.backup');
        expect(body.project_roots_count).toBe(1);
        expect(JSON.stringify(body)).not.toContain('/tmp/projects');
        expect(JSON.stringify(body)).not.toContain('DEVDIARY');
      } finally {
        await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      }
    });

    it('allows the packaged Tauri webview origin to read local Core responses', async () => {
      const db = openDb(':memory:');
      const app = createServer(db, { dbPath: ':memory:' });
      const server = app.listen(0);
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('test server failed to listen');

        const response = await fetch(`http://127.0.0.1:${address.port}/api/health`, {
          headers: { origin: 'tauri://localhost' },
        });
        const preflight = await fetch(`http://127.0.0.1:${address.port}/api/settings`, {
          method: 'OPTIONS',
          headers: {
            origin: 'tauri://localhost',
            'access-control-request-method': 'PATCH',
            'access-control-request-headers': 'content-type',
          },
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('access-control-allow-origin')).toBe('tauri://localhost');
        expect(response.headers.get('vary')).toContain('Origin');
        expect(preflight.status).toBe(204);
        expect(preflight.headers.get('access-control-allow-origin')).toBe('tauri://localhost');
        expect(preflight.headers.get('access-control-allow-methods')).toContain('PATCH');
        const allowedHeaders = preflight.headers.get('access-control-allow-headers')?.toLowerCase();
        expect(allowedHeaders).toContain('content-type');
        expect(allowedHeaders).toContain('x-devdiary-expected-core-target');
      } finally {
        await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      }
    });

    it('rejects untrusted web origins instead of merely hiding the response with CORS', async () => {
      const db = openDb(':memory:');
      const app = createServer(db, { dbPath: ':memory:' });
      const server = app.listen(0);
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('test server failed to listen');

        const response = await fetch(`http://127.0.0.1:${address.port}/api/health`, {
          headers: { origin: 'https://example.com' },
        });

        expect(response.status).toBe(403);
        expect(response.headers.get('access-control-allow-origin')).toBeNull();
        expect(await response.json()).toEqual({
          error: 'forbidden_origin',
          message: 'Browser origin is not trusted for this local service.',
        });
      } finally {
        await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      }
    });
  });
});
