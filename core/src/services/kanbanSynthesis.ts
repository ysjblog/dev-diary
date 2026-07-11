import type { DB } from '../db/index.js';
import { normalizeAgentId } from '../domain/agents.js';
import type { CanonicalAgentId, GitRecentCommit, ProjectDetailSnapshot, ProjectSessionView } from '../domain/types.js';
import { getProjectDetail, type ProjectDetailQuery } from './projects.js';
import type { ScanKanbanCandidate } from './scans.js';

const MAX_CARDS = 6;
const MAX_TITLE = 72;
const MAX_DESCRIPTION = 240;

const SECRET_PATTERNS = [
  /\b(?:api[_-]?key|token|password|passwd|secret|private[_-]?key)\s*[:=]\s*["']?[\w./+=:-]{6,}/gi,
  /\b(?:sk|ghp|gho|github_pat|xoxb|xoxp)_[\w-]{12,}/gi,
];

const ABSOLUTE_PATH_PATTERN = /(?:\/(?:Applications|Users|Volumes|private|tmp|var)\/[^\s`'"，。；,;)]+)|(?:[A-Za-z]:\\[^\s`'"，。；,;)]+)/g;
const TASK_DEBT_PATTERNS = [
  /\b(?:todo|fixme|blocker|blocked|unfinished)\b/i,
  /\b(?:failed|failing)\s+tests?\b/i,
  /\btests?\s+(?:failed|failing)\b/i,
  /(?:待辦|阻塞|卡住|未完成|測試失敗)/i,
];
const LOW_SIGNAL_NEGATIONS = [
  /\b(?:no|without)\s+(?:todo|todos|blocker|blockers|failed tests?|failing tests?|unfinished work)\b/i,
  /(?:目前)?(?:沒有|無)(?:明確)?(?:待辦|阻塞|卡住|測試失敗)/i,
];

function truncate(value: string, max: number): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

export function redactSensitiveText(value: string | null | undefined): string {
  let text = String(value ?? '');
  text = text.replace(ABSOLUTE_PATH_PATTERN, '[redacted-path]');
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, '[redacted-secret]');
  }
  return text.replace(/raw transcript/gi, 'structured summary');
}

function safeTitle(prefix: string, value: string): string {
  const text = redactSensitiveText(value).replace(/^#+\s*/, '').trim();
  return truncate(text ? `${prefix}${text}` : `${prefix}整理開發進度`, MAX_TITLE);
}

function safeDescription(value: string): string {
  return truncate(redactSensitiveText(value), MAX_DESCRIPTION);
}

function cardAssignee(session: ProjectSessionView | null, fallback: CanonicalAgentId | null): CanonicalAgentId | null {
  const normalized = session ? normalizeAgentId(session.agent_name) : null;
  return normalized ?? fallback;
}

function firstAgent(snapshot: ProjectDetailSnapshot): CanonicalAgentId | null {
  return snapshot.project.detected_agents[0] ?? null;
}

function taskDebtText(session: ProjectSessionView): string {
  return [session.command, session.excerpt].filter(Boolean).join(' ');
}

function hasTaskDebtSignal(session: ProjectSessionView): boolean {
  const text = taskDebtText(session);
  if (!text || LOW_SIGNAL_NEGATIONS.some((pattern) => pattern.test(text))) return false;
  return TASK_DEBT_PATTERNS.some((pattern) => pattern.test(text));
}

function todoCard(snapshot: ProjectDetailSnapshot): ScanKanbanCandidate | null {
  const session = snapshot.sessions.find(hasTaskDebtSignal) ?? null;
  if (!session) return null;
  const assignee = cardAssignee(session, firstAgent(snapshot));
  const basis = session.command || session.excerpt || `${session.start_time} todo`;
  return {
    title: safeTitle('待辦：', basis),
    description: safeDescription(
      [
        `Recent session ${session.start_time.slice(0, 10)} 出現明確待辦訊號，請確認是否需要排入下一步。`,
        session.excerpt ? `摘要：${session.excerpt}` : '',
      ].filter(Boolean).join(' '),
    ),
    status: 'todo',
    assignee_agent_id: assignee,
    source_ref: `agent-synth://p${snapshot.project.id}/todo/${assignee ?? 'other'}`,
  };
}

function sessionCard(snapshot: ProjectDetailSnapshot): ScanKanbanCandidate | null {
  const session = snapshot.sessions.find((item) => item.status !== 'failed') ?? snapshot.sessions[0] ?? null;
  if (!session) return null;
  const assignee = cardAssignee(session, firstAgent(snapshot));
  const basis = session.command || session.excerpt || `${session.start_time} session`;
  return {
    title: safeTitle('整理：', basis),
    description: safeDescription(
      [
        `Recent session ${session.start_time.slice(0, 10)} 顯示這個切片仍需要整理成可交付狀態。`,
        session.excerpt ? `摘要：${session.excerpt}` : '',
      ].filter(Boolean).join(' '),
    ),
    status: 'in_progress',
    assignee_agent_id: assignee,
    source_ref: `agent-synth://p${snapshot.project.id}/session/${assignee ?? 'other'}`,
  };
}

function commitCard(snapshot: ProjectDetailSnapshot, commit: GitRecentCommit): ScanKanbanCandidate {
  return {
    title: safeTitle('完成：', commit.title || commit.hash),
    description: safeDescription(`Recent commit ${commit.hash} 已記錄這個完成切片，時間：${commit.time || 'unknown'}。`),
    status: 'done',
    assignee_agent_id: firstAgent(snapshot),
    source_ref: `agent-synth://p${snapshot.project.id}/commit/${commit.hash || commit.title}`,
  };
}

export function buildKanbanSynthesisCandidates(snapshot: ProjectDetailSnapshot): ScanKanbanCandidate[] {
  const cards: ScanKanbanCandidate[] = [];
  const latestTodo = todoCard(snapshot);
  if (latestTodo) cards.push(latestTodo);
  const latestSession = sessionCard(snapshot);
  if (latestSession) cards.push(latestSession);
  for (const commit of snapshot.git_status.recent_commits.slice(0, 3)) {
    cards.push(commitCard(snapshot, commit));
  }

  const seen = new Set<string>();
  return cards.filter((card) => {
    if (!card.source_ref || seen.has(card.source_ref)) return false;
    seen.add(card.source_ref);
    return true;
  }).slice(0, MAX_CARDS);
}

export function synthesizeProjectKanban(
  db: DB,
  projectId: number,
  today: string,
  query: ProjectDetailQuery = { range: '24h' },
): ScanKanbanCandidate[] {
  const snapshot = getProjectDetail(db, projectId, today, query);
  if (!snapshot) return [];
  return buildKanbanSynthesisCandidates(snapshot);
}
