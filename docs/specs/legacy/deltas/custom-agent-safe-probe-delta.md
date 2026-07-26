# Delta Spec: Custom Agent Safe Probe And Persistence
> PR: feature/core-engine
> Date: 2026-07-01
> Status: implemented

## 新增（Added）

- Core-backed custom agent safe probe flow:
  - `POST /api/agents/custom/probe`
  - `POST /api/agents/custom`
  - `PATCH /api/agents/custom/:id`
  - `DELETE /api/agents/custom/:id`
- Persisted `custom_agents` settings payload in app-owned `app_settings`.
- Custom agent probe validation:
  - accepts a display name and executable path or PATH command.
  - uses structured safe probe args only (`--version`, `version`, `--help`, `help`).
  - runs with `execFile`, `shell:false`, timeout, scrubbed env, and non-project cwd.
  - returns sanitized failure states and does not persist failed or inconclusive probes.
- CLI Agents UI wizard uses the Core probe/save/remove endpoints instead of timer-based local success.

## 修改（Changed）

- Canonical agents remain built-in and removable only by disabling; custom agents can be added, disabled, and removed.
- Agent cards combine canonical detection state with persisted custom agent state.
- Runtime health capabilities include custom agent management routes.
- `MASTER.md` and base spec acceptance state must reflect that the v1 custom-agent path is Core-backed and safe-probed.

## 移除（Removed）

- Removes the prototype-only "wait 1.5 seconds and mark connected" custom agent wizard behavior.

## 影響範圍（Impact）

- Core settings persistence, agent probe security boundary, Express local API, React Settings/Agents UI, UI API helpers, tests, specs.
- Security boundary: no shell strings, no project cwd, no raw stderr/stdout persistence beyond short sanitized version/error summary, no project file or Git mutation.

## 驗收條件

- [x] A valid executable can be probed through Core and saved as a custom agent.
- [x] Failed, missing, overlong, control-character, or shell-looking custom agent inputs return 400/failed and are not persisted.
- [x] Custom agent save validates and probes before writing to `app_settings`.
- [x] Custom agents persist across reload, can be disabled/enabled, and can be removed.
- [x] Canonical agents cannot be deleted from Settings; they can only be disabled.
- [x] Probe execution uses `execFile` with `shell:false`, allowed args only, timeout, scrubbed env, and a non-project cwd.
- [x] Core tests, UI API tests, typecheck, build, runtime smoke, and browser/RWD checks pass.
