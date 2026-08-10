import type { NextFunction, Request, Response } from 'express';

export const BUILTIN_BROWSER_ORIGINS = [
  'tauri://localhost',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
] as const;

const FORBIDDEN_ORIGIN = {
  error: 'forbidden_origin',
  message: 'Browser origin is not trusted for this local service.',
} as const;

export class BrowserOriginConfigurationError extends Error {
  constructor() {
    super('Additional browser origins must be unique, exact loopback HTTP origins with an explicit valid port.');
    this.name = 'BrowserOriginConfigurationError';
  }
}

export function parseAdditionalBrowserOrigins(raw: string | undefined): string[] {
  if (raw === undefined || raw.trim() === '') return [];
  const origins = raw.split(',').map((value) => value.trim());
  if (origins.some((value) => value === '')) throw new BrowserOriginConfigurationError();
  return origins;
}

function validateAdditionalBrowserOrigin(value: string): string {
  if (typeof value !== 'string' || value === '') throw new BrowserOriginConfigurationError();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BrowserOriginConfigurationError();
  }
  const port = Number(url.port);
  if (
    url.protocol !== 'http:'
    || (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1')
    || !url.port
    || !Number.isInteger(port)
    || port < 1
    || port > 65_535
    || url.username !== ''
    || url.password !== ''
    || value !== url.origin
  ) {
    throw new BrowserOriginConfigurationError();
  }
  return url.origin;
}

export function buildTrustedBrowserOrigins(additionalOrigins: readonly string[] = []): Set<string> {
  const trusted = new Set<string>(BUILTIN_BROWSER_ORIGINS);
  for (const value of additionalOrigins) {
    const origin = validateAdditionalBrowserOrigin(value);
    if (trusted.has(origin)) throw new BrowserOriginConfigurationError();
    trusted.add(origin);
  }
  return trusted;
}

export function createBrowserOriginMiddleware(trustedOrigins: ReadonlySet<string>) {
  return (req: Request, res: Response, next: NextFunction): Response | void => {
    const origin = req.get('origin');
    const fetchSite = req.get('sec-fetch-site');
    if ((origin !== undefined && !trustedOrigins.has(origin)) || (!origin && fetchSite?.toLowerCase() === 'cross-site')) {
      return res.status(403).json(FORBIDDEN_ORIGIN);
    }

    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'content-type');
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  };
}
