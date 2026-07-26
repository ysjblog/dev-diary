# Delta Spec: README Product Guide And Tilde Path Redaction
> PR: main
> Date: 2026-07-08
> Status: merged

## 背景 / 問題

GitHub public `main` uses an orphan branch for a cleaned release history, but its README still described DevDiary as a prototype React UI. The README needed to explain the actual product, macOS DMG usage, AI agent setup, prompts, exports, and developer commands.

During clean verification from the GitHub `main` checkout, `core/test/kanbanSynthesis.test.ts` also exposed an existing redaction bug: `redactSensitiveText()` did not replace shell home paths such as `~/Workspace/side-projects/app` with `[redacted-path]`.

## 新增（Added）

- README now starts with user-facing product capabilities.
- README documents GitHub Releases / DMG installation flow.
- README explains first-run setup for Project Roots, CLI Agents, Default Diary Agent, scan, AI prompt overrides, Custom Agent / Ollama, and exports.
- README keeps developer commands for local install, Core startup, macOS packaging, and validation.

## 修改（Changed）

- README no longer claims the app is only a prototype UI or not connected to Core API.
- `redactSensitiveText()` now treats `~/...` and `~user/...` style paths as path-like sensitive values and replaces them with `[redacted-path]`.
- `docs/specs/MASTER.md` indexes this release-readiness documentation and redaction fix.

## 移除（Removed）

- Removed outdated README sections focused on the original Vite prototype scaffold.

## 影響範圍（Impact）

- User-facing README on GitHub.
- Kanban / scheduler / AI-output sanitization helper that already feeds generated cards and summaries.
- Security boundary: no new shell execution, API endpoint, storage write, credential handling, or remote listener is added.

## 驗收條件

- [x] README explains app features, Mac DMG download/install, AI setup, prompt settings, exports, developer commands, and packaging path.
- [x] README avoids private local project paths and hardcoded secrets.
- [x] `redactSensitiveText()` redacts shell home paths like `~/Workspace/side-projects/app`.
- [x] `npm test -- test/kanbanSynthesis.test.ts` passes in `core/`.
- [x] `npm test` passes in `core/`.
- [x] `npm run typecheck` passes in `core/`.
- [x] `npm test` passes at repo root.
- [x] `npm run build` passes at repo root.
- [x] `git diff --check` passes.
