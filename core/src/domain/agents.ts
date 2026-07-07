import type { CanonicalAgentId } from './types.js';

// Canonical agent metadata (spec §7.9). Display names and color keys are the
// single source of truth; the UI derives styling from `color_key`.
export interface AgentMeta {
  id: CanonicalAgentId;
  display_name: string;
  color_key: string;
}

export const CANONICAL_AGENTS: Record<CanonicalAgentId, AgentMeta> = {
  'claude-code': { id: 'claude-code', display_name: 'Claude Code', color_key: 'claude' },
  'codex-cli': { id: 'codex-cli', display_name: 'Codex CLI', color_key: 'codex' },
  'antigravity-cli': { id: 'antigravity-cli', display_name: 'Antigravity CLI', color_key: 'antigravity' },
};

export const OTHER_AGENT_META = { id: 'other' as const, display_name: '其他', color_key: 'other' };

// Prototype id aliases must be normalized before persistence (spec §7.9).
const ALIAS_MAP: Record<string, CanonicalAgentId> = {
  'claude': 'claude-code',
  'claude-code': 'claude-code',
  'codex': 'codex-cli',
  'codex-cli': 'codex-cli',
  'agy': 'antigravity-cli',
  'antigravity': 'antigravity-cli',
  'antigravity-cli': 'antigravity-cli',
};

/**
 * Normalize a raw agent id/alias to a canonical id.
 * Returns null for unknown agents (callers may bucket those as `other`).
 */
export function normalizeAgentId(raw: string): CanonicalAgentId | null {
  return ALIAS_MAP[raw.trim().toLowerCase()] ?? null;
}

export function agentDisplayName(id: CanonicalAgentId): string {
  return CANONICAL_AGENTS[id].display_name;
}

export function agentColorKey(id: CanonicalAgentId | 'other'): string {
  return id === 'other' ? OTHER_AGENT_META.color_key : CANONICAL_AGENTS[id].color_key;
}
