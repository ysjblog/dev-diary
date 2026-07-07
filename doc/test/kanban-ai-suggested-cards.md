# Kanban AI Auto-added Cards Test Plan

## Test Depth Route

- Level: 3
- Reason: Cross-module contract across AI JSON parsing, Core settings, SQLite Kanban writes, scan/project scan/scheduler/background runner integration, Local HTTP API, and Workspace UI.
- Required verification: Core unit/API/settings/background tests, UI API mapper/app-shell tests, Core typecheck, Vite build, localhost smoke, desktop/mobile RWD, black-box QA.
- Allowed skips: Real external AI provider calls may use injected fake generators; no production data or mutating project folder actions.

## Bug Pattern Coverage

- [x] Input normalization / aliases / format variants
- [x] Boundary values / empty / null / malformed input
- [x] Rule priority conflicts
- [x] Negation / exclusion / opt-out / unlimited
- [x] Contract generated and execution applied
- [x] Operation order invariants
- [x] Production-like dirty data
- [x] Multi-condition combinations
- [x] Security bypass mixed with normal input
- [x] State/history/retry/refresh behavior
- [x] Externally observable result, not only implementation detail

## Runtime Verification Route

- Runtime smoke: REQUIRED after automated tests; use localhost UI and Core API.
- Black-box QA: REQUIRED for the Workspace Kanban AI auto-add flow and RWD visibility.
- Safe environment or localhost command: `npm run dev` / Core dev server, seeded or local test DB only.
- Safe test account / mock access: injected fake AI generator or disabled provider warnings.
- Forbidden or destructive actions: no project folder mutation, no Git mutating commands, no raw transcript/path/secrets in prompts or persisted cards.

## [x] 【function 邏輯】AI prompt input uses redacted allowlist only
**範例輸入**：Project snapshot containing root path, source_log_ref, docs.content, comments, sessions, commits, and existing Kanban cards.
**期待輸出**：`KanbanAiPromptInput` contains only safe short fields and excludes root path, source_log_ref, docs.content, comments raw content, raw transcript, and secret-like values.

## [x] 【資料邊界】strict JSON parser rejects malformed or unsafe AI output
**範例輸入**：markdown fenced JSON, missing fields, unknown status, overlong values, low confidence, and secret/path-like text.
**期待輸出**：unsafe candidates are skipped with warnings, no crash, and no DB write.

## [x] 【狀態回歸】stable source_ref dedupes repeated AI auto-add across status changes
**範例輸入**：same dedupe key first suggested as `todo`, then `in_progress`.
**期待輸出**：Core uses the same `ai-suggest://...` source_ref, updates the existing unlocked card, and does not create duplicate cards.

## [x] 【狀態回歸】manual status lock remains authoritative
**範例輸入**：user manually moves an AI card to `done`, then AI suggests the same dedupe key as `in_progress`.
**期待輸出**：title/description may update, but status remains `done` and `status_locked_by_user = 1`.

## [x] 【錯誤處理】provider failure is non-throwing for scan/scheduler/background runner
**範例輸入**：AI generator throws, times out, or returns invalid JSON while scan is otherwise successful.
**期待輸出**：scan/scheduler/background runner remain successful or skipped according to their normal flow, and `ai_sync.warnings` explains skipped AI cards.

## [x] 【Mock API】manual `POST /api/projects/:id/kanban/ai-sync` auto-adds gated cards
**範例輸入**：fake generator returns one valid `todo` and one invalid candidate.
**期待輸出**：response includes `ai_sync.inserted`, `skipped`, `warnings`, and refreshed `project_detail` containing an `ai-suggest://` card.

## [x] 【整合流程】scan/project rescan/scheduler/background runner use Core-owned AI auto-add gates
**範例輸入**：stored settings or UI patch tries to override `kanban_ai_auto_add`; `daily_scheduler.enabled = false` for background runner.
**期待輸出**：Core keeps built-in auto-add defaults. Background runner scan/AI auto-add is independent from daily diary scheduler enablement.

## [x] 【function 邏輯】settings migration preserves diary prompts and keeps Kanban prompt Core-owned
**範例輸入**：persisted settings with `ai_prompts_version = 2` and existing diary prompt overrides.
**期待輸出**：settings upgrade to current prompt contract, preserve diary prompts, keep `ai_prompts.kanban_cards` and `kanban_ai_auto_add` on Core defaults.

## [x] 【前端元素】Workspace Kanban shows AI source, sync summary, and manual-lock badge
**範例輸入**：project detail with `ai-suggest://` card and locked card; sync response with inserted/updated/skipped/warnings.
**期待輸出**：UI shows `AI 自動加入`, latest sync summary, `重新整理卡片`, and `手動調整` badge without implying AI can override manual progress.

## [x] 【RWD】Workspace Kanban AI labels fit desktop and mobile
**範例輸入**：desktop and mobile viewport with long AI title/description/source summary.
**期待輸出**：no horizontal overflow, clipping, or overlapping controls.
