# Delta Spec: Settings AI Prompts And Path Controls
> PR: feature/core-engine
> Date: 2026-07-02
> Status: implemented

## 新增（Added）

- Settings page adds sub-tabs so growing settings are grouped by Core, Projects, Prompts, Automation, Preferences, and Storage.
- CLI Agents page owns AI agent runtime preferences: each agent card can store model and reasoning preferences in Core settings, separate from enable/disable state.
- CLI Agents canonical model lists are refreshed to match the current Claude Code and Codex pickers (`Opus 4.8`, `Sonnet 5`, `Haiku 4.5`, `GPT-5.5`, `GPT-5.4`, `GPT-5.4-Mini`).
- CLI Agents page exposes the default diary agent selector above the agent cards.
- Custom Ollama agents can be selected as the diary agent; supported local Ollama generation uses the configured model, for example `qwen3.6:27b`.
- AI-generated content prompt defaults are visible in Settings and can be overridden by the user:
  - project diary / summary draft prompt
  - single-day diary entry prompt
  - global daily highlight prompt
- Path-like Settings controls use one row per entry with:
  - `+` add row button
  - text input for paste/manual typing
  - folder button as picker entry point when the runtime supports one
  - remove button per row
- Packaged Tauri app uses the native dialog plugin for Project Roots / folder-style Settings rows so the selected macOS absolute folder path can be written back into the row.
- Core marks upgraded AI prompt defaults with a prompt version so legacy custom prompt overrides can be replaced by the upgraded defaults.

## 修改（Changed）

- `GET/PATCH /api/settings` persists default diary agent, agent model/reasoning, custom agent, and prompt override settings in `app_settings`.
- Core reasoning validation accepts the current picker values `light`, `medium`, `high`, `extra_high`, and `speed`, while normalizing legacy `low` / `none` / `thinking` values on read.
- Diary Agent prompt builders use persisted prompt overrides while preserving structured-data safety constraints and treating the structured `date` / `target_date` as the only allowed output date.
- Date-scoped diary prompts omit current-only Git working-tree status and only include Kanban cards whose created / updated / due date matches the selected day.
- Diary Agent provider selection can route to enabled `antigravity-cli` or a configured local Ollama custom agent.
- Project roots, excluded paths, and project docs allowlist are edited as arrays in the UI instead of textarea-only controls.
- Project Docs filename allowlist remains relative and does not show a folder picker; Project Docs folder full-scan rows can use the folder picker, then convert selected folders under Project Roots into relative settings values.
- Daily diary save/regenerate responses for a selected historical date return a single-day snapshot for that same selected date instead of falling back to server today.
- Workspace UI reloads the full current-range ProjectDetail after single-day daily diary save/regenerate, so clearing the date filter restores the complete diary list.
- Workspace date-scoped snapshots filter `git_status.recent_commits` to the selected date range, so historical daily diary material does not include newer commit titles.
- Core CORS preflight allows `PUT` so packaged WebView saves can call summary and daily diary save endpoints.
- Workspace project header folder button invokes a native Tauri command to open the selected absolute project folder in Finder; Web dev runtime shows a truthful unsupported message.
- Daily Scheduler preserves manually confirmed per-project daily diary text when updating the global daily log for the same date.
- Packaged macOS window uses dark transparent native titlebar chrome so the traffic-light row follows the dark app surface.
- Dashboard token trend axis labels render as normal HTML text outside the stretch-scaled SVG chart layer.

## 移除（Removed）

- No user-facing setting is removed.

## 影響範圍（Impact）

- Core settings validation/persistence, diary prompt construction, Core CORS preflight, daily diary write snapshots, Workspace daily diary UI state, Tauri macOS shell config, native folder dialog wiring, Ollama custom diary provider, daily scheduler global highlight prompt, React Settings UI, CLI Agents UI, Dashboard chart typography, UI settings form mapping, docs, tests, and browser/RWD verification.
- Security boundary: custom prompts and paths are stored as settings only; they must not become shell strings, secrets, raw transcript dumps, or direct client-side filesystem access.

## 驗收條件

- [x] Settings has sub-tabs and remains usable on desktop and mobile.
- [x] CLI Agents exposes model and reasoning selectors and persists through `GET/PATCH /api/settings`.
- [x] CLI Agents canonical model and reasoning options match the current Claude Code / Codex picker labels.
- [x] CLI Agents exposes the default diary agent selector and accepts configured custom agent ids.
- [x] Custom Ollama diary provider can call the local Ollama generate API with the selected model and fallback safely on failure.
- [x] Prompt defaults are visible, editable, and persisted; blank prompt overrides fall back to defaults.
- [x] Project roots, excluded paths, and project docs controls support add/remove row behavior and still send structured arrays.
- [x] Project Docs filename scan has no folder picker and adds relative filenames only; folder full-scan rows expose a folder picker that writes relative folder values.
- [x] Packaged Tauri folder picker returns selected absolute folder paths for folder-style Settings rows.
- [x] Daily diary save/regenerate for a non-today date refreshes that selected date and does not fall back to server today.
- [x] Historical daily diary material excludes newer Git commits and current-only Git/Kanban state from date-scoped prompts.
- [x] Daily diary save/regenerate no longer leaves the Workspace detail stuck on a single-day snapshot after clearing the date filter.
- [x] Packaged WebView CORS preflight allows `PUT` saves for summary and daily diary endpoints.
- [x] Workspace folder button uses the native Tauri Finder command instead of a fake success toast.
- [x] Daily Scheduler does not overwrite manually confirmed per-project daily diary text for the same date.
- [x] Legacy prompt overrides without the current prompt version are replaced by upgraded default prompts.
- [x] Dashboard token trend axis labels are not distorted by SVG stretch scaling.
- [x] Default prompts are structured enough to prevent non-today diary/highlight output from being labeled as today.
- [x] macOS packaged window titlebar uses dark native chrome.
- [x] Core rejects malformed/overlong prompt and model/reasoning settings without partial writes.
- [x] Diary prompt construction applies user prompt overrides while still excluding raw project paths/source refs.
- [x] Runtime smoke and black-box QA confirm the Settings UI has no horizontal overflow or broken interactions.
