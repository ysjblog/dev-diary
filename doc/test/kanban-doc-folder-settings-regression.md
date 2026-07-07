# Kanban and Project Docs Settings Regression

## Test Depth Route

- Level: 3
- Reason: Bug fix crosses Settings user input normalization, Core runtime capability detection, Kanban API helper error handling, and Workspace UI workflow.
- Required verification: UI API helper tests, Core targeted tests for the live route/capability, frontend build, runtime smoke against localhost.
- Allowed skips: New OpenSpec is skipped because this is a regression fix for existing Settings/Kanban behavior, not a new API or user flow.

## Bug Pattern Coverage

- [x] Input normalization / aliases / format variants: folder picker strips detected project root so `/project/docs/specs` becomes `docs/specs`.
- [x] Boundary values / empty / null / malformed input: existing settings validators still reject absolute `/tmp/docs` and traversal.
- [x] Contract generated and execution applied: health capabilities include `kanban.ai-sync`, and frontend required capabilities check for it.
- [x] State/history/retry/refresh behavior: stale Core 404 is translated into restart guidance instead of generic HTTP 404.
- [x] Externally observable result, not only implementation detail: localhost route probes verify status patch and AI sync routes.

## Runtime Verification Route

- Runtime smoke: REQUIRED
- Black-box QA: REQUIRED
- Safe environment or localhost command: `npm run dev`, `cd core && npm start`, localhost Core/UI only.
- Safe test account / mock access: local SQLite/runtime; no external account.
- Forbidden or destructive actions: do not scan/write outside configured project roots; do not print secrets or raw private env values.

## [x] 【function 邏輯】Project Docs folder picker strips detected project root
**範例輸入**：selected folder `/Users/me/projects/app/docs/specs`, project root `/Users/me/projects`, detected project path `/Users/me/projects/app`。
**期待輸出**：settings value is `docs/specs`, not `app/docs/specs`, so each project scans its own `docs/specs` folder.

## [x] 【錯誤處理】Kanban helpers translate stale route 404
**範例輸入**：Core returns a non-JSON HTTP 404 for Kanban helper calls.
**期待輸出**：UI error tells the user the Core runtime may be stale and should be restarted, instead of showing only `Core API error (HTTP 404)`.

## [x] 【整合流程】Live Core route and Docs tab smoke
**範例輸入**：localhost Core contract 5, `project_doc_folders=["docs/specs"]`, project `Development log`.
**期待輸出**：`POST /api/projects/999999/kanban/ai-sync?range=all` reaches the route without token-generating AI work; project 3 docs include `docs/specs/*`; Workspace Docs tab shows folder-scan cards.

## [x] 【RWD】Workspace Docs desktop and mobile check
**範例輸入**：Desktop viewport and 390x844 mobile viewport on `http://127.0.0.1:5173`.
**期待輸出**：Docs cards render without incoherent text overlap; mobile keeps the existing horizontal Workspace layout while Docs cards remain readable.

## Verification Results

- `npm test`: passed, 53/53.
- `cd core && npm test`: passed, 175/175.
- `cd core && npm run typecheck`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- Runtime route smoke: `/api/health` reports `kanban.ai-sync`; stale `/api/projects/:id/kanban/ai-sync` 404 is gone.
- Persisted setting: `project_doc_folders=["docs/specs"]`.
- Docs-only scan result for project 3: 44 docs; samples include `docs/specs/MASTER.md` and `docs/specs/deltas/ai-diary-agent-delta.md`.
- Browser smoke: Workspace Kanban move button returned 200 and displayed success toast; test card statuses were restored after the smoke.
- Browser Docs smoke: `docs/specs/dev-diary-macos-app.md` visible; 43 folder-scan badges visible in DOM.
- Screenshots: `output/playwright/kanban-docs-regression-desktop.png`, `output/playwright/kanban-docs-regression-mobile.png`, `output/playwright/kanban-docs-regression-mobile-docs.png`.

## Security Review Result

- Surface: Settings path input and Core docs scan.
- Protected asset: local project filesystem and persisted SQLite content.
- Boundary: browser/Tauri UI to local Core API, then Core read-only filesystem scan.
- Input: selected folder path, manually typed `project_doc_folders`, project paths loaded from Core.
- Sink: SQLite settings persistence and docs file reads under project root.
- Controls present: UI now converts absolute selected folders to relative values using detected project paths first; Core still rejects absolute paths, traversal, null/control characters, unsupported characters, hidden/vendor folders, and oversized docs before reads.
- Validation performed: regression tests plus live `project_doc_folders=["docs/specs"]` scan.
- Verdict: no reportable traversal or shell/security issue introduced.
- Residual risk / proof gap: folder picker conversion depends on the detected project list being loaded; manual entry remains supported and Core validation is the final enforcement layer.
