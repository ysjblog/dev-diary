# Spec Review State: Canonical Agent Source Path Settings

Spec: `docs/specs/deltas/agent-source-path-settings-delta.md`
Status: converged
Updated: 2026-07-12

## Route

SPEC REVIEW ROUTE

- Level: 3
- Reason: persisted settings contract、Local HTTP API、filesystem traversal、executable code-execution boundary、React/Tauri UI，且跨 detection/parser/scheduler/background consumers。
- Required lenses: data-and-facts、naming-and-types、blast-radius、execution-order、logic-and-design。
- Deferred lenses: none。
- Subagents attempted/used: `luna_spec_facts` inventory；fresh `sol_spec_round1`、`sol_spec_closer`、`sol_spec_closer2` all-five-lens reviewers。
- Trust policy: 只有 fresh all-five-lens round 全部無 blocking findings 才可 converged。
- Budget mode: bounded；review packet 以 live code `rg`/line evidence 建立。

## Fact Inventory

verifiedFacts:

- claim: Canonical `SettingsAgent` 目前只有 id/display_name/enabled/model/reasoning；persisted shape 與 normalizer 尚無 sources。
  status: confirmed
  evidence: `core/src/services/settings.ts:27-33,117-123,486-508,773-778`
- claim: Settings 存在單一 `app_settings` key `core` JSON；現有五個 mutation functions 都是 read-modify-write。
  status: confirmed
  evidence: `core/src/services/settings.ts:722-727,786-880`
- claim: Detection GET/POST 目前都直接 fresh 呼叫 `detectCliAgents()`，未讀 persisted settings。
  status: confirmed
  evidence: `core/src/server.ts:242-258`
- claim: Detection executable precedence、probe argv 與 `execFile`/`shell:false` safety pattern 已存在。
  status: confirmed
  evidence: `core/src/services/agentDetection.ts:60-105,129-197`
- claim: Claude current/legacy encoded directory 是 project root 的 Core-derived value。
  status: confirmed
  evidence: `core/src/services/cliLogParser.ts:58-69,217-219`
- claim: Product data layouts 是 Claude `.claude/projects`、Codex `.codex/sessions|archived_sessions`、Antigravity `antigravity-cli/log|brain`。
  status: confirmed
  evidence: `core/src/services/cliLogParser.ts:66-69,293-295,396-412`
- claim: Production scan provider consumers只有 global endpoint、selected-project endpoint、background cycle；onboarding/startup重用 global endpoint，daily scheduler 本身不 scan。
  status: confirmed
  evidence: `core/src/server.ts:373-421`, `core/src/services/backgroundRunner.ts:61-90`, `core/src/services/dailyScheduler.ts:248-315`, `src/App.jsx:797-801,995-1044`
- claim: Antigravity executable readers涵蓋 health probe、project/daily diary、Kanban AI 與 daily/background gates。
  status: confirmed
  evidence: `core/src/services/antigravitySession.ts:45-55`, `core/src/services/diaryAgent.ts:323-337,389-417`, `core/src/services/dailyScheduler.ts:275-305`, `core/src/services/backgroundRunner.ts:116-137`
- claim: Tauri folder picker與 Project Roots row controls可作為 UI pattern，dialog open capability已存在。
  status: confirmed
  evidence: `src/App.jsx:3014-3079,3170-3175`, `src-tauri/capabilities/default.json:8-11`

alreadyWrongClaims:

- `scheduler scan`：已修成 daily scheduler 不直接 scan。
- 無角色 Antigravity `log/brain` roots：已改成 product data root + Core-derived locations。

## Review Rounds

### Round 1 — rejected

- naming/types: draft executable 沒有 Core-enforced probe-and-save API。
- naming/types: string roots 無法表達 Antigravity log/brain roles。
- blast-radius: 漏掉 Antigravity health probe 與衍生 execution readers。
- execution-order: probe 後 PATCH 沒有 concurrency precondition/atomicity。
- logic/design: recursive walker 缺 symlink containment/cycle contract；Claude encoded-child 判定不 deterministic。

Accepted fixes:

- 新增 targeted executable/activity source endpoints、server-side probe-before-persist 與 revision conflict。
- 使用 product data roots，Core 固定衍生 parser locations。
- 明列所有 Antigravity readers與真正 scan entry points。
- 明定 lstat/realpath containment、visited set、symlink warnings與 deterministic known-project mapping。

### Round 2 — rejected

- naming/types: top-level detection compatibility mapping不完整；filesystem warning enum未定義。
- blast-radius: revision未涵蓋五個既有 settings writers。
- execution-order: 未保證 transaction內 fresh-read/check/increment/write。
- logic/design: Claude derived locations缺 project/encoding association。

Accepted fixes:

- 固定 connected/failed/not_found 到 connected/offline compatibility mapping。
- 擴充 `ParserWarningKind` 與 sanitized shape。
- 新增 common `BEGIN IMMEDIATE` mutation primitive，涵蓋五個既有 + 兩個新 writers。
- `derived_scan_locations` 新增 project_id/project_root/encoding_variant。

### Round 3 — rejected

- naming/types: detection與 targeted update response envelope未固定 JSON key。
- logic/design: 未持久化 executable identity卻承諾日後 replacement一定 failed。
- data/facts: review-state尚未建立，MASTER提前標 ready。

Accepted fixes:

- 固定 detection `source_status` key與共用 `CanonicalAgentSourceUpdateResponse`。
- 撤回不可能的 provenance承諾；同一路徑正常升級以每次 fresh validation/probe為準，明列能力邊界。
- 建立本 review-state，MASTER在 clean round前維持 planned/under review。

### Round 4 — clean closer

- Reviewer: fresh `sol_spec_closer3` read-only all-five-lens pass。
- data-and-facts: `findings: []`
- naming-and-types: `findings: []`
- blast-radius: `findings: []`
- execution-order: `findings: []`
- logic-and-design: `findings: []`
- Verdict: `CLEAN`；blocking findings `0`，inconclusive lenses `0`。

## Final Lens State

data-and-facts:
findings: []

naming-and-types:
findings: []

blast-radius:
findings: []

execution-order:
findings: []

logic-and-design:
findings: []

## Convergence

- trustedRounds: 4
- inconclusiveRounds: 0
- finalCleanRound: passed（fresh `sol_spec_closer3`）
- converged: true
- unresolvedRisk: 無 spec-blocking finding；implementation仍需依 delta 執行 security review、test-depth routing、black-box QA、desktop/mobile RWD 與 packaged Tauri smoke。
