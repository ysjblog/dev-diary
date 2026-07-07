# Settings AI Prompts And Path Controls Test Plan

## Test Depth Route

- Level: 3
- Reason: Cross-module Settings contract, persistence, user input, UI workflow, and prompt construction.
- Required verification: Core tests, UI API tests, build, typecheck, desktop/mobile browser smoke, black-box QA, security review, diff review, local Ollama tags probe.
- Allowed skips: No production account or real external AI generation; folder picker native dialog may be unavailable in Web dev runtime.

## Bug Pattern Coverage

- [x] Input normalization / aliases / format variants
- [x] Boundary values / empty / null / malformed input
- [ ] Rule priority conflicts
- [ ] Negation / exclusion / opt-out / unlimited
- [x] Contract generated and execution applied
- [ ] Operation order invariants
- [x] Production-like dirty data
- [ ] Multi-condition combinations
- [x] Security bypass mixed with normal input
- [x] State/history/retry/refresh behavior
- [x] Externally observable result, not only implementation detail

## Runtime Verification Route

- Runtime smoke: REQUIRED
- Black-box QA: REQUIRED
- Safe environment or localhost command: `npm run dev` with Core on loopback.
- Safe test account / mock access: local app only; no external account required.
- Forbidden or destructive actions: no production data mutation, no deleting files, no raw secret/log dump.

## [x] 【function 邏輯】Core settings persists diary agent, model/reasoning, and prompt overrides
**範例輸入**：`PATCH /api/settings` with canonical/custom diary agent id, agent model/reasoning and `ai_prompts`.
**期待輸出**：`GET /api/settings` returns normalized values after reload.

## [x] 【function 邏輯】Custom Ollama diary provider generates through local Ollama API
**範例輸入**：configured `custom-ollama` with model `qwen3.6:27b`, then generate a project diary draft.
**期待輸出**：Core posts to local `/api/generate`, receives Markdown, and never includes project root paths in the prompt.

## [x] 【資料邊界】Core rejects malformed prompt/model/path settings without partial writes
**範例輸入**：overlong prompt, invalid reasoning, non-array path list, path with control character.
**期待輸出**：Core throws validation error and previous settings remain unchanged.

## [x] 【function 邏輯】Diary prompt builder applies user prompt override safely
**範例輸入**：custom project diary prompt plus project snapshot.
**期待輸出**：prompt includes custom instruction and structured data, but excludes project root paths/source refs.

## [x] 【Mock API】Frontend form maps path rows and prompts to structured Settings patch
**範例輸入**：form arrays with duplicates/blank rows, selected model/reasoning, edited prompt.
**期待輸出**：patch sends deduped arrays plus `agents` and `ai_prompts` objects.

## [x] 【前端元素】Settings sub-tabs expose Projects, Prompts, Automation, Preferences, Storage
**範例輸入**：open Settings and switch tabs.
**期待輸出**：each tab shows only relevant controls and save/reload actions remain available.

## [x] 【前端元素】CLI Agents owns diary agent, model, and reasoning controls
**範例輸入**：open CLI Agents.
**期待輸出**：top selector chooses default diary agent; each agent card exposes model and reasoning controls.

## [x] 【前端元素】Path list rows support add, manual edit, folder button fallback, and remove
**範例輸入**：click `+`, type a path, click folder button in Web dev runtime, remove a row.
**期待輸出**：row count and visible values update without layout shift; fallback explains picker unavailability.

## [x] 【RWD】Settings remains usable at desktop and mobile widths
**範例輸入**：desktop 1440px and mobile 390px screenshots.
**期待輸出**：no horizontal overflow, no overlapping text, controls remain reachable.

## [x] 【安全繞過】Prompt/path inputs do not become shell execution or raw secret display
**範例輸入**：prompt/path text containing shell-looking content or secret-like words.
**期待輸出**：Settings stores text only through Core validation; generated fallback/error messages do not dump raw command lines or secrets.

## [x] 【狀態回歸】Legacy custom prompt overrides are replaced by upgraded defaults
**範例輸入**：`app_settings.value` contains `ai_prompts` without the current prompt version marker.
**期待輸出**：`GET /api/settings` returns the upgraded default prompts instead of the stale custom prompt text.

## [x] 【前端元素】Workspace folder button opens the selected project in Finder
**範例輸入**：In the packaged macOS app, click the Workspace project header folder icon for a project root.
**期待輸出**：UI invokes the native Tauri Finder command with the selected root path; Web dev runtime shows a truthful unavailable message instead of a fake success toast.

## [x] 【狀態回歸】Historical daily diary inputs only include commits from the selected date range
**範例輸入**：A Git repo has one commit on `2026-06-28` and a newer commit on `2026-07-02`; load a Workspace detail snapshot for `2026-06-28`.
**期待輸出**：`git_status.recent_commits` contains the `2026-06-28` commit and excludes the newer `2026-07-02` commit.

## [x] 【Mock API】CLI Agents model and reasoning options match current Claude Code / Codex menus
**範例輸入**：Open CLI Agents model/reasoning selectors and persist `Opus 4.8`, `Sonnet 5`, `GPT-5.4-Mini`, or `extra_high`.
**期待輸出**：Frontend exposes the new labels and Core accepts/persists the new reasoning values while normalizing legacy stored values safely.
