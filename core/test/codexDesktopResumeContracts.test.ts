import { describe, expect, it } from 'vitest';
import {
  CODEX_PROCESS_TITLE_PREFIX,
  codexTargetKeyDigest,
  decodeExpectedCoreTargetHeader,
  encodeExpectedCoreTargetHeader,
  normalizeCodexDisplayName,
  parseCodexThreadDeepLink,
  parseProcessTitleOutput,
  type VerifiedCoreTargetSnapshot,
} from '../src/services/codexDesktopResumeContracts.js';

const threadId = '00000000-0000-4000-8000-000000000001';

function verifiedSnapshot(): VerifiedCoreTargetSnapshot {
  return {
    origin: 'http://127.0.0.1:4317',
    source: 'verified_manifest',
    manifest_digest: 'a'.repeat(64),
    runtime: {
      host: '127.0.0.1',
      port: 4317,
      pid: 321,
      started_at: '2026-09-08T00:00:00.000Z',
    },
    api_contract_version: 8,
    capabilities: ['agents.custom.ollama-settings', 'codex.desktop-resume.multi-target-v2'],
  };
}

describe('Codex Desktop v8 contract primitives', () => {
  describe('input normalization', () => {
    it('accepts only an exact canonical Codex thread deep link', () => {
      expect(parseCodexThreadDeepLink(`codex://threads/${threadId}`)).toBe(threadId);
      for (const value of [
        `codex://threads/${threadId}?x=1`,
        `codex://threads/${threadId}#x`,
        `codex://user@threads/${threadId}`,
        `codex://threads:44/${threadId}`,
        `codex://threads/${threadId}/extra`,
        `codex://threads/${threadId}%2fextra`,
        'codex://threads/AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
        ` https://threads/${threadId}`,
      ]) expect(() => parseCodexThreadDeepLink(value)).toThrow('invalid_codex_thread_deep_link');
    });

    it('normalizes the display label but rejects empty, controls and overlong values', () => {
      expect(normalizeCodexDisplayName('  Ａ任務  ')).toBe('Ａ任務');
      expect(normalizeCodexDisplayName('e\u0301')).toBe('é');
      for (const value of ['', ' \n ', `ok\u0085bad`, 'x'.repeat(161)]) {
        expect(() => normalizeCodexDisplayName(value)).toThrow('invalid_codex_display_name');
      }
    });
  });

  describe('identity and process boundaries', () => {
    it('matches the normative domain-separated target digest vector', () => {
      expect(codexTargetKeyDigest(threadId)).toBe('d27497bfc896ee9a077a4e2f1c39a01366433443178969f1cef69b338cd2c5c8');
    });

    it('parses exactly 48 title bytes plus zero to 207 ASCII spaces and one LF', () => {
      const token = 'b'.repeat(32);
      const title = `${CODEX_PROCESS_TITLE_PREFIX}${token}`;
      expect(Buffer.byteLength(title)).toBe(48);
      for (const spaces of [0, 2, 3, 207]) {
        expect(parseProcessTitleOutput(`${title}${' '.repeat(spaces)}\n`)).toBe(title);
      }
      for (const output of [
        `${title}${' '.repeat(208)}\n`, `${title}\t\n`, `${title}\r\n`, `${title}\nextra\n`,
        ` ${title}\n`, `${CODEX_PROCESS_TITLE_PREFIX}${'B'.repeat(32)}\n`,
      ]) expect(parseProcessTitleOutput(output)).toBeNull();
    });
  });

  describe('runtime mutation binding', () => {
    it('round-trips one canonical verified snapshot through an unpadded bounded header', () => {
      const snapshot = verifiedSnapshot();
      const header = encodeExpectedCoreTargetHeader(snapshot);
      expect(header).not.toContain('=');
      expect(Buffer.byteLength(header)).toBeLessThanOrEqual(8 * 1024);
      expect(decodeExpectedCoreTargetHeader(header)).toEqual(snapshot);
    });

    it('rejects unverified, unsorted, extra-key and malformed snapshot headers', () => {
      const valid = verifiedSnapshot();
      expect(() => encodeExpectedCoreTargetHeader({ ...valid, source: 'fallback' } as never)).toThrow('invalid_verified_core_target');
      expect(() => encodeExpectedCoreTargetHeader({ ...valid, capabilities: [...valid.capabilities].reverse() })).toThrow('invalid_verified_core_target');
      const extra = { ...valid, unexpected: true };
      const encoded = Buffer.from(JSON.stringify(extra)).toString('base64url');
      expect(() => decodeExpectedCoreTargetHeader(encoded)).toThrow('invalid_verified_core_target');
      for (const value of ['', '***', 'a'.repeat(8193)]) {
        expect(() => decodeExpectedCoreTargetHeader(value)).toThrow();
      }
    });
  });
});
