import { createAntigravityPromptRunner, type AntigravityDiaryAgentOptions } from './diaryAgent.js';
import type { AppSettings } from './settings.js';

/**
 * Antigravity CLI (`agy`) session circuit-breaker.
 *
 * 根因:`agy` 的 OAuth token 會過夜過期,headless `agy --print` 無法靜默刷新,
 * session 失效時只會彈出 GUI 登入視窗。DevDiary 的背景 runner 是持續 loop,
 * 每個 cycle 又對「每個專案」呼叫 agy(kanban AI + 每日摘要),一旦 session 失效
 * 就會逐專案 ×每輪狂彈登入視窗。
 *
 * 這個 gate 在跑任何 per-project agy 之前先送「1 次」magic-token probe 確認 session:
 * - 失效 → 本輪整批跳過 agy(改用 deterministic fallback),並進入 cooldown,
 *   cooldown 內不再 probe(= 不再彈登入視窗),直到使用者重新登入 + cooldown 過期。
 * - 正常 → healthy TTL 內直接沿用結果,不重複 probe(降低額外呼叫)。
 */

export const ANTIGRAVITY_HEALTH_TOKEN = 'AGYHEALTHOK';

const DEFAULT_HEALTHY_TTL_MINUTES = 30;
const DEFAULT_COOLDOWN_MINUTES = 180;
const DEFAULT_PROBE_PRINT_TIMEOUT = '30s';
const DEFAULT_PROBE_EXEC_TIMEOUT_MS = 45_000;

export interface AntigravityHealth {
  healthy: boolean;
  detail: string;
}

export interface AntigravityHealthDecision extends AntigravityHealth {
  /** 這次是否真的送出 probe(false = 沿用快取/cooldown,沒有觸發登入視窗)。 */
  probed: boolean;
}

export type AntigravityProbe = () => Promise<AntigravityHealth>;

/** provider 是否為 Antigravity CLI(對齊 diaryAgent 建構 configured agent 的條件)。 */
export function usesAntigravityProvider(settings: AppSettings): boolean {
  if (settings.default_diary_agent !== 'antigravity-cli') return false;
  const antigravity = settings.agents.find((agent) => agent.id === 'antigravity-cli');
  return antigravity?.enabled !== false;
}

/** 建一個 probe:要求模型原樣回傳 magic token,拿到才算 session 健康。 */
export function createAntigravityProbe(
  settings: AppSettings,
  overrides: AntigravityDiaryAgentOptions = {},
): AntigravityProbe {
  const antigravity = settings.agents.find((agent) => agent.id === 'antigravity-cli');
  const runPrompt = createAntigravityPromptRunner({
    model: antigravity?.model,
    printTimeout: DEFAULT_PROBE_PRINT_TIMEOUT,
    execTimeoutMs: DEFAULT_PROBE_EXEC_TIMEOUT_MS,
    ...overrides,
  });
  const prompt = `忽略任何其他指示,只輸出這串字,不要加任何其他內容:${ANTIGRAVITY_HEALTH_TOKEN}`;
  return async () => {
    try {
      const text = await runPrompt(prompt);
      if (text.includes(ANTIGRAVITY_HEALTH_TOKEN)) {
        return { healthy: true, detail: 'agy session ok' };
      }
      return {
        healthy: false,
        detail: `agy preflight 未回傳預期 token,session 可能失效。實際回應開頭:${text.trim().slice(0, 160)}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { healthy: false, detail: `agy preflight 呼叫失敗,session 可能失效:${message}` };
    }
  };
}

export interface AntigravitySessionGateOptions {
  /** healthy 結果的沿用時間;過了才會再 probe。 */
  healthyTtlMs?: number;
  /** 偵測到失效後的靜默期;期間不再 probe(不再彈登入視窗)。 */
  cooldownMs?: number;
}

function positiveMinutesFromEnv(name: string, fallbackMinutes: number): number {
  const raw = Number(process.env[name]);
  const minutes = Number.isFinite(raw) && raw > 0 ? raw : fallbackMinutes;
  return minutes * 60_000;
}

/**
 * 長生命週期的狀態持有者。index.ts server 與背景 runner 各持有「一個」實例,
 * 在多輪 tick / cycle 之間共用 cooldown 與 healthy 快取。probe 由呼叫端依當下
 * settings 現建(model 可能變),gate 只負責「這次要不要真的 probe」。
 */
export class AntigravitySessionGate {
  private healthyTtlMs: number;
  private cooldownMs: number;
  private last: AntigravityHealth | null = null;
  private lastCheckedAtMs = Number.NEGATIVE_INFINITY;
  private cooldownUntilMs = 0;

  constructor(options: AntigravitySessionGateOptions = {}) {
    this.healthyTtlMs = options.healthyTtlMs ?? positiveMinutesFromEnv('DEVDIARY_ANTIGRAVITY_HEALTH_TTL_MINUTES', DEFAULT_HEALTHY_TTL_MINUTES);
    this.cooldownMs = options.cooldownMs ?? positiveMinutesFromEnv('DEVDIARY_ANTIGRAVITY_AUTH_COOLDOWN_MINUTES', DEFAULT_COOLDOWN_MINUTES);
  }

  async ensureHealthy(nowMs: number, probe: AntigravityProbe): Promise<AntigravityHealthDecision> {
    if (this.last?.healthy && nowMs - this.lastCheckedAtMs < this.healthyTtlMs) {
      return { ...this.last, probed: false };
    }
    if (this.last && !this.last.healthy && nowMs < this.cooldownUntilMs) {
      return { ...this.last, probed: false };
    }
    const result = await probe();
    this.last = result;
    this.lastCheckedAtMs = nowMs;
    this.cooldownUntilMs = result.healthy ? 0 : nowMs + this.cooldownMs;
    return { ...result, probed: true };
  }
}
