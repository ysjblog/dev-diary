import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { seedDatabase } from '../src/db/seed.js';
import { getSettings, updateSettings } from '../src/services/settings.js';
import {
  ANTIGRAVITY_HEALTH_TOKEN,
  AntigravitySessionGate,
  createAntigravityProbe,
  usesAntigravityProvider,
  type AntigravityHealth,
} from '../src/services/antigravitySession.js';

const TODAY = '2026-06-30';

function runtime() {
  return { activeDbPath: ':memory:', projectRoots: [] };
}

function settingsWithProvider(provider: 'antigravity-cli' | 'claude-code') {
  const db = openDb(':memory:');
  seedDatabase(db, { today: TODAY, days: 1, seed: 11 });
  return updateSettings(db, { default_diary_agent: provider }, runtime());
}

describe('Antigravity session gate', () => {
  describe('usesAntigravityProvider', () => {
    it('true 只在 default_diary_agent 是 antigravity-cli 且該 agent 未被停用時', () => {
      expect(usesAntigravityProvider(settingsWithProvider('antigravity-cli'))).toBe(true);
      expect(usesAntigravityProvider(settingsWithProvider('claude-code'))).toBe(false);
    });
  });

  describe('AntigravitySessionGate cooldown', () => {
    it('session 失效後在 cooldown 內不再 probe(= 不再彈登入視窗)', async () => {
      const gate = new AntigravitySessionGate({ cooldownMs: 10 * 60_000, healthyTtlMs: 60_000 });
      let probeCalls = 0;
      const failing = async (): Promise<AntigravityHealth> => {
        probeCalls += 1;
        return { healthy: false, detail: 'dead session' };
      };

      const first = await gate.ensureHealthy(0, failing);
      expect(first.healthy).toBe(false);
      expect(first.probed).toBe(true);
      expect(probeCalls).toBe(1);

      // cooldown 內:沿用快取,不觸發 probe
      const second = await gate.ensureHealthy(60_000, failing);
      expect(second.healthy).toBe(false);
      expect(second.probed).toBe(false);
      expect(probeCalls).toBe(1);

      // cooldown 過後:才會再 probe 一次
      const third = await gate.ensureHealthy(11 * 60_000, failing);
      expect(third.probed).toBe(true);
      expect(probeCalls).toBe(2);
    });

    it('healthy 結果在 TTL 內沿用,不重複 probe', async () => {
      const gate = new AntigravitySessionGate({ cooldownMs: 10 * 60_000, healthyTtlMs: 5 * 60_000 });
      let probeCalls = 0;
      const ok = async (): Promise<AntigravityHealth> => {
        probeCalls += 1;
        return { healthy: true, detail: 'ok' };
      };

      expect((await gate.ensureHealthy(0, ok)).probed).toBe(true);
      expect((await gate.ensureHealthy(60_000, ok)).probed).toBe(false);
      expect(probeCalls).toBe(1);
      // TTL 過後重新確認 session 是否還活著
      expect((await gate.ensureHealthy(6 * 60_000, ok)).probed).toBe(true);
      expect(probeCalls).toBe(2);
    });

    it('失效轉健康後清掉 cooldown', async () => {
      const gate = new AntigravitySessionGate({ cooldownMs: 10 * 60_000, healthyTtlMs: 60_000 });
      await gate.ensureHealthy(0, async () => ({ healthy: false, detail: 'dead' }));
      const recovered = await gate.ensureHealthy(11 * 60_000, async () => ({ healthy: true, detail: 'ok' }));
      expect(recovered.healthy).toBe(true);
      // 恢復後應立刻可用,不受先前 cooldown 影響
      const next = await gate.ensureHealthy(11 * 60_000 + 61_000, async () => ({ healthy: true, detail: 'ok' }));
      expect(next.probed).toBe(true);
    });
  });

  describe('createAntigravityProbe', () => {
    const settings = settingsWithProvider('antigravity-cli');

    it('agy 回傳 magic token → healthy', async () => {
      const probe = createAntigravityProbe(settings, {
        execFileImpl: async () => ({ stdout: `${ANTIGRAVITY_HEALTH_TOKEN}\n`, stderr: '' }),
      });
      const health = await probe();
      expect(health.healthy).toBe(true);
    });

    it('agy 回登入頁文字(無 token)→ unhealthy,不丟例外', async () => {
      const probe = createAntigravityProbe(settings, {
        execFileImpl: async () => ({ stdout: 'You are not logged into Antigravity. Please sign in.', stderr: '' }),
      });
      const health = await probe();
      expect(health.healthy).toBe(false);
      expect(health.detail).toContain('session');
    });

    it('agy 呼叫直接失敗 → unhealthy,不丟例外', async () => {
      const probe = createAntigravityProbe(settings, {
        execFileImpl: async () => {
          throw Object.assign(new Error('spawn agy ENOENT'), { code: 'ENOENT' });
        },
      });
      const health = await probe();
      expect(health.healthy).toBe(false);
    });
  });
});
