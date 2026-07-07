import { createServer, type Server } from 'node:http';
import type { Express } from 'express';

export interface ListenWithPortFallbackOptions {
  host?: string;
  preferredPort: number;
  maxAttempts?: number;
}

export interface ListenWithPortFallbackResult {
  server: Server;
  port: number;
  fallbackUsed: boolean;
}

function listenOnce(app: Express, host: string, port: number): Promise<Server> {
  const server = createServer(app);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

export async function listenWithPortFallback(
  app: Express,
  options: ListenWithPortFallbackOptions,
): Promise<ListenWithPortFallbackResult> {
  const host = options.host ?? '127.0.0.1';
  const maxAttempts = Math.max(1, options.maxAttempts ?? 20);
  const preferredPort = Number.isFinite(options.preferredPort) && options.preferredPort >= 0 ? options.preferredPort : 4317;
  if (preferredPort === 0) {
    const server = await listenOnce(app, host, 0);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Core API failed to bind a dynamic port.');
    return { server, port: address.port, fallbackUsed: false };
  }

  let lastError: unknown = null;
  for (let i = 0; i < maxAttempts; i += 1) {
    const port = preferredPort + i;
    try {
      const server = await listenOnce(app, host, port);
      return { server, port, fallbackUsed: i > 0 };
    } catch (err) {
      lastError = err;
      if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Core API failed to bind a local port.');
}
