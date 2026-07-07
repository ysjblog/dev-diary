import { describe, expect, it } from 'vitest';
import express from 'express';
import { listenWithPortFallback } from '../src/services/runtimePort.js';

function close(server: { close: (cb: (err?: Error) => void) => void }): Promise<void> {
  return new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

describe('Runtime port allocator', () => {
  it('binds a dynamic loopback port when requested port is 0', async () => {
    const app = express();
    app.get('/health', (_req, res) => res.json({ ok: true }));

    const result = await listenWithPortFallback(app, { preferredPort: 0 });
    try {
      expect(result.port).toBeGreaterThan(0);
      expect(result.fallbackUsed).toBe(false);
      const response = await fetch(`http://127.0.0.1:${result.port}/health`);
      expect(response.status).toBe(200);
    } finally {
      await close(result.server);
    }
  });

  it('falls forward when the preferred port is already in use', async () => {
    const first = await listenWithPortFallback(express(), { preferredPort: 0 });
    const preferredPort = first.port;
    const secondApp = express();
    secondApp.get('/health', (_req, res) => res.json({ ok: true }));

    const second = await listenWithPortFallback(secondApp, { preferredPort, maxAttempts: 20 });
    try {
      expect(second.port).toBeGreaterThan(preferredPort);
      expect(second.fallbackUsed).toBe(true);
      const response = await fetch(`http://127.0.0.1:${second.port}/health`);
      expect(response.status).toBe(200);
    } finally {
      await close(second.server);
      await close(first.server);
    }
  });
});
