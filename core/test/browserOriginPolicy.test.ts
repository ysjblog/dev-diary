import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import {
  BUILTIN_BROWSER_ORIGINS,
  BrowserOriginConfigurationError,
  buildTrustedBrowserOrigins,
  createBrowserOriginMiddleware,
  parseAdditionalBrowserOrigins,
} from '../src/services/browserOriginPolicy.js';

function request(headers: Record<string, string> = {}, method = 'GET'): Request {
  const normalized = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    method,
    get(name: string) {
      return normalized[name.toLowerCase()];
    },
  } as Request;
}

function response() {
  const res = {
    setHeader: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
    end: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res as unknown as Response & {
    setHeader: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };
}

describe('browser origin policy', () => {
  it('rejects an untrusted Origin without invoking the parser/route next boundary', () => {
    const middleware = createBrowserOriginMiddleware(buildTrustedBrowserOrigins());
    const req = request({ origin: 'https://attacker.example' });
    const res = response();
    const next = vi.fn() as unknown as NextFunction;

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'forbidden_origin',
      message: 'Browser origin is not trusted for this local service.',
    });
    expect(res.setHeader).not.toHaveBeenCalledWith('Access-Control-Allow-Origin', expect.anything());
  });

  it('rejects absent-Origin cross-site Fetch Metadata but allows a native request to continue', () => {
    const middleware = createBrowserOriginMiddleware(buildTrustedBrowserOrigins());
    const deniedRes = response();
    const deniedNext = vi.fn() as unknown as NextFunction;
    middleware(request({ 'sec-fetch-site': 'CrOsS-SiTe' }), deniedRes, deniedNext);

    expect(deniedNext).not.toHaveBeenCalled();
    expect(deniedRes.status).toHaveBeenCalledWith(403);

    const allowedRes = response();
    const allowedNext = vi.fn() as unknown as NextFunction;
    middleware(request(), allowedRes, allowedNext);

    expect(allowedNext).toHaveBeenCalledOnce();
    expect(allowedRes.setHeader).not.toHaveBeenCalledWith('Access-Control-Allow-Origin', expect.anything());
  });

  it('allows exact trusted Origins and ends trusted preflight before the parser/route', () => {
    const trusted = buildTrustedBrowserOrigins(['http://localhost:5180']);
    const middleware = createBrowserOriginMiddleware(trusted);
    const getRes = response();
    const getNext = vi.fn() as unknown as NextFunction;
    middleware(request({ origin: 'http://localhost:5180' }), getRes, getNext);

    expect(getNext).toHaveBeenCalledOnce();
    expect(getRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'http://localhost:5180');

    const optionsRes = response();
    const optionsNext = vi.fn() as unknown as NextFunction;
    middleware(request({ origin: 'tauri://localhost' }, 'OPTIONS'), optionsRes, optionsNext);

    expect(optionsNext).not.toHaveBeenCalled();
    expect(optionsRes.status).toHaveBeenCalledWith(204);
    expect(optionsRes.end).toHaveBeenCalledOnce();
  });

  it('parses comma transport whitespace but rejects empty, duplicate, built-in-collision and non-origin inputs', () => {
    expect(parseAdditionalBrowserOrigins(' http://localhost:5180, http://127.0.0.1:5180 ')).toEqual([
      'http://localhost:5180',
      'http://127.0.0.1:5180',
    ]);
    expect(parseAdditionalBrowserOrigins(undefined)).toEqual([]);

    const invalid = [
      [''],
      ['http://localhost:5180', 'http://localhost:5180'],
      ['tauri://localhost'],
      ['http://localhost:5173'],
      ['http://localhost'],
      ['http://localhost:0'],
      ['http://localhost:65536'],
      ['http://localhost:5180/'],
      ['http://localhost:5180/path'],
      ['http://localhost:5180?x=1'],
      ['http://user@localhost:5180'],
      ['http://localhost.attacker.example:5180'],
      ['https://localhost:5180'],
      ['http://*:5180'],
    ];
    for (const origins of invalid) {
      expect(() => buildTrustedBrowserOrigins(origins), JSON.stringify(origins)).toThrow(BrowserOriginConfigurationError);
    }
    expect(() => parseAdditionalBrowserOrigins('http://localhost:5180,,http://127.0.0.1:5180')).toThrow(
      BrowserOriginConfigurationError,
    );
    expect(buildTrustedBrowserOrigins(['http://localhost:5180'])).toEqual(
      new Set([...BUILTIN_BROWSER_ORIGINS, 'http://localhost:5180']),
    );
  });
});
