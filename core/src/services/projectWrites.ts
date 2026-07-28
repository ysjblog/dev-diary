import type { DB } from '../db/index.js';
import type { KanbanStatus, ProjectDetailSnapshot } from '../domain/types.js';
import { buildProjectDiaryFallback, generateProjectDiaryDraft, type ProjectSummaryDraftGenerator } from './diaryAgent.js';
import { getProjectDetail, type ProjectDetailQuery } from './projects.js';

const MAX_COMMENT_LENGTH = 5000;
const MAX_TAG_LENGTH = 32;
const MAX_TAGS = 5;
const MAX_SUMMARY_LENGTH = 20000;
const KANBAN_STATUSES: KanbanStatus[] = ['todo', 'in_progress', 'done'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ProjectWriteValidationError extends Error {
  code = 'invalid_body';
  constructor(message: string) {
    super(message);
    this.name = 'ProjectWriteValidationError';
  }
}

export class ProjectWriteNotFoundError extends Error {
  code = 'not_found';
  constructor(message: string) {
    super(message);
    this.name = 'ProjectWriteNotFoundError';
  }
}

function nowISO(): string {
  return new Date().toISOString();
}

function ensureProject(db: DB, projectId: number): void {
  const row = db.prepare(`SELECT id FROM projects WHERE id = ? AND ignored = 0`).get(projectId);
  if (!row) throw new ProjectWriteNotFoundError(`project ${projectId} not found`);
}

function requireSnapshot(db: DB, projectId: number, today: string, query: ProjectDetailQuery = {}): ProjectDetailSnapshot {
  const snapshot = getProjectDetail(db, projectId, today, query);
  if (!snapshot) throw new ProjectWriteNotFoundError(`project ${projectId} not found`);
  return snapshot;
}

function normalizeContent(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new ProjectWriteValidationError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ProjectWriteValidationError(`${field} cannot be empty`);
  }
  if (trimmed.length > maxLength) {
    throw new ProjectWriteValidationError(`${field} is too long`);
  }
  return trimmed;
}

function normalizeDate(value: unknown): string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) {
    throw new ProjectWriteValidationError('date must be YYYY-MM-DD');
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ProjectWriteValidationError('date must be a valid calendar date');
  }
  return value;
}

function upsertDailyProjectSummary(
  db: DB,
  projectId: number,
  date: string,
  markdown: string,
  status: 'confirmed' | 'ai_generated',
  fallbackReport: string | null = null,
): void {
  const ts = nowISO();
  if (status === 'confirmed') {
    db.prepare(
      `INSERT INTO project_daily_diaries (project_id, date, markdown, status, fallback_report, created_at, updated_at)
       VALUES (?, ?, ?, 'confirmed', NULL, ?, ?)
       ON CONFLICT(project_id, date) DO UPDATE SET markdown = excluded.markdown, status = 'confirmed', fallback_report = NULL, updated_at = excluded.updated_at`,
    ).run(projectId, date, markdown, ts, ts);
    // Confirmation belongs to the project/date diary table. The global daily
    // highlight projection is written later by the scheduler only.
    return;
  } else {
    // The WHERE clause is the final guard: a confirmation made while an agent is
    // generating must win over this AI result.
    db.prepare(
      `INSERT INTO project_daily_diaries (project_id, date, markdown, status, fallback_report, created_at, updated_at)
       VALUES (?, ?, ?, 'ai_generated', ?, ?, ?)
       ON CONFLICT(project_id, date) DO UPDATE SET markdown = excluded.markdown, status = 'ai_generated', fallback_report = excluded.fallback_report, updated_at = excluded.updated_at
       WHERE project_daily_diaries.status != 'confirmed'`,
    ).run(projectId, date, markdown, fallbackReport, ts, ts);
    return;
  }
}

function normalizeTags(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new ProjectWriteValidationError('tags must be an array');
  }
  const tags: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') {
      throw new ProjectWriteValidationError('tags must contain strings only');
    }
    const tag = raw.trim();
    if (!tag) continue;
    if (tag.length > MAX_TAG_LENGTH) {
      throw new ProjectWriteValidationError('tag is too long');
    }
    if (!tags.includes(tag)) tags.push(tag);
    if (tags.length > MAX_TAGS) {
      throw new ProjectWriteValidationError(`tags cannot exceed ${MAX_TAGS}`);
    }
  }
  return tags;
}

function assertCommentBelongsToProject(db: DB, projectId: number, commentId: number): void {
  const row = db.prepare(`SELECT id FROM comments WHERE id = ? AND project_id = ?`).get(commentId, projectId);
  if (!row) throw new ProjectWriteNotFoundError(`comment ${commentId} not found`);
}

function assertCardBelongsToProject(db: DB, projectId: number, cardId: number): void {
  const row = db.prepare(`SELECT id FROM kanban_cards WHERE id = ? AND project_id = ?`).get(cardId, projectId);
  if (!row) throw new ProjectWriteNotFoundError(`kanban card ${cardId} not found`);
}

export function addProjectComment(
  db: DB,
  projectId: number,
  input: { content?: unknown; tags?: unknown },
  today: string,
  query: ProjectDetailQuery = {},
): ProjectDetailSnapshot {
  const content = normalizeContent(input?.content, 'content', MAX_COMMENT_LENGTH);
  const tags = normalizeTags(input?.tags);
  const ts = nowISO();
  db.transaction(() => {
    ensureProject(db, projectId);
    db.prepare(
      `INSERT INTO comments (project_id, content, tags, pinned, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?)`,
    ).run(projectId, content, JSON.stringify(tags), ts, ts);
  })();
  return requireSnapshot(db, projectId, today, query);
}

export function updateProjectComment(
  db: DB,
  projectId: number,
  commentId: number,
  input: { pinned?: unknown },
  today: string,
  query: ProjectDetailQuery = {},
): ProjectDetailSnapshot {
  if (typeof input?.pinned !== 'boolean') {
    throw new ProjectWriteValidationError('pinned must be a boolean');
  }
  db.transaction(() => {
    ensureProject(db, projectId);
    assertCommentBelongsToProject(db, projectId, commentId);
    db.prepare(`UPDATE comments SET pinned = ?, updated_at = ? WHERE id = ? AND project_id = ?`).run(
      input.pinned ? 1 : 0,
      nowISO(),
      commentId,
      projectId,
    );
  })();
  return requireSnapshot(db, projectId, today, query);
}

export function deleteProjectComment(
  db: DB,
  projectId: number,
  commentId: number,
  today: string,
  query: ProjectDetailQuery = {},
): ProjectDetailSnapshot {
  db.transaction(() => {
    ensureProject(db, projectId);
    assertCommentBelongsToProject(db, projectId, commentId);
    db.prepare(`DELETE FROM comments WHERE id = ? AND project_id = ?`).run(commentId, projectId);
  })();
  return requireSnapshot(db, projectId, today, query);
}

export function updateKanbanCardStatus(
  db: DB,
  projectId: number,
  cardId: number,
  input: { status?: unknown },
  today: string,
  query: ProjectDetailQuery = {},
): ProjectDetailSnapshot {
  if (!KANBAN_STATUSES.includes(input?.status as KanbanStatus)) {
    throw new ProjectWriteValidationError(`status must be one of ${KANBAN_STATUSES.join(', ')}`);
  }
  db.transaction(() => {
    ensureProject(db, projectId);
    assertCardBelongsToProject(db, projectId, cardId);
    db.prepare(`UPDATE kanban_cards SET status = ?, status_locked_by_user = 1, updated_at = ? WHERE id = ? AND project_id = ?`).run(
      input.status,
      nowISO(),
      cardId,
      projectId,
    );
  })();
  return requireSnapshot(db, projectId, today, query);
}

export function saveProjectSummary(
  db: DB,
  projectId: number,
  input: { markdown?: unknown },
  today: string,
  query: ProjectDetailQuery = {},
): ProjectDetailSnapshot {
  const markdown = normalizeContent(input?.markdown, 'markdown', MAX_SUMMARY_LENGTH);
  const ts = nowISO();
  db.transaction(() => {
    ensureProject(db, projectId);
    db.prepare(
      `INSERT INTO project_summaries (project_id, markdown_user, user_updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         markdown_user = excluded.markdown_user,
         user_updated_at = excluded.user_updated_at`,
    ).run(projectId, markdown, ts);
  })();
  return requireSnapshot(db, projectId, today, query);
}

export function saveProjectDiaryEntry(
  db: DB,
  projectId: number,
  dateInput: unknown,
  input: { markdown?: unknown },
  today: string,
  query: ProjectDetailQuery = {},
): ProjectDetailSnapshot {
  const date = normalizeDate(dateInput);
  const markdown = normalizeContent(input?.markdown, 'markdown', MAX_SUMMARY_LENGTH);
  db.transaction(() => {
    ensureProject(db, projectId);
    upsertDailyProjectSummary(db, projectId, date, markdown, 'confirmed');
  })();
  return requireSnapshot(db, projectId, date, { range: 'custom', customStart: date, customEnd: date });
}

export function regenerateProjectSummary(
  db: DB,
  projectId: number,
  today: string,
  query: ProjectDetailQuery = {},
): ProjectDetailSnapshot {
  const before = requireSnapshot(db, projectId, today, query);
  const markdown = buildProjectDiaryFallback(before, today).markdown;
  const ts = nowISO();
  db.transaction(() => {
    ensureProject(db, projectId);
    db.prepare(
      `INSERT INTO project_summaries (project_id, markdown_ai, ai_updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         markdown_ai = excluded.markdown_ai,
         ai_updated_at = excluded.ai_updated_at`,
    ).run(projectId, markdown, ts);
  })();
  return requireSnapshot(db, projectId, today, query);
}

export async function regenerateProjectSummaryWithAgent(
  db: DB,
  projectId: number,
  today: string,
  query: ProjectDetailQuery = {},
  generator?: ProjectSummaryDraftGenerator | null,
): Promise<ProjectDetailSnapshot> {
  const before = requireSnapshot(db, projectId, today, query);
  const draft = await generateProjectDiaryDraft(before, today, generator);
  const markdown = draft.markdown;
  const ts = nowISO();
  db.transaction(() => {
    ensureProject(db, projectId);
    db.prepare(
      `INSERT INTO project_summaries (project_id, markdown_ai, ai_updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         markdown_ai = excluded.markdown_ai,
         ai_updated_at = excluded.ai_updated_at`,
    ).run(projectId, markdown, ts);
  })();
  return requireSnapshot(db, projectId, today, query);
}

export async function regenerateProjectDiaryEntryWithAgent(
  db: DB,
  projectId: number,
  dateInput: unknown,
  today: string,
  query: ProjectDetailQuery = {},
  generator?: ProjectSummaryDraftGenerator | null,
): Promise<ProjectDetailSnapshot> {
  const date = normalizeDate(dateInput);
  const diaryQuery: ProjectDetailQuery = {
    range: 'custom',
    customStart: date,
    customEnd: date,
    includeDiary: query.includeDiary,
  };
  const before = requireSnapshot(db, projectId, date, diaryQuery);
  const draftSnapshot: ProjectDetailSnapshot = {
    ...before,
    metric_strip: {
      ...before.metric_strip,
      token_today: before.metric_strip.range_token_total,
    },
  };
  const draft = await generateProjectDiaryDraft(draftSnapshot, date, generator);
  db.transaction(() => {
    ensureProject(db, projectId);
    upsertDailyProjectSummary(db, projectId, date, draft.markdown, 'ai_generated', draft.fallback_report);
  })();
  return requireSnapshot(db, projectId, date, diaryQuery);
}

export function acceptProjectSummaryDraft(
  db: DB,
  projectId: number,
  today: string,
  query: ProjectDetailQuery = {},
): ProjectDetailSnapshot {
  db.transaction(() => {
    ensureProject(db, projectId);
    const row = db.prepare(`SELECT markdown_ai FROM project_summaries WHERE project_id = ?`).get(projectId) as
      | { markdown_ai: string | null }
      | undefined;
    const draft = typeof row?.markdown_ai === 'string' ? row.markdown_ai.trim() : '';
    if (!draft) throw new ProjectWriteValidationError('summary AI draft does not exist');
    db.prepare(`UPDATE project_summaries SET markdown_user = NULL, user_updated_at = NULL WHERE project_id = ?`).run(projectId);
  })();
  return requireSnapshot(db, projectId, today, query);
}
