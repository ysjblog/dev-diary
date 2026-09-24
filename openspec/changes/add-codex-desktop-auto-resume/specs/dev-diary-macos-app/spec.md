---
openspec_level: o3
template_version: owner-workflow/v1
change: add-codex-desktop-auto-resume
reasons: external_write,workflow_state,data_migration
---
# Delta Spec: dev-diary-macos-app runtime contract v8

## 中文摘要

Core/UI compatibility 提升到 v8，新增 multi-target resume capability，所有 resume mutation 綁定已驗證的目前 Core runtime，狀態由專用資料表與 route 管理。

## Baseline

- Capability: `dev-diary-macos-app`
- Current Feature Spec: `openspec/specs/dev-diary-macos-app/spec.md`

## MODIFIED Requirements

### Requirement: New local-provider UI rejects an old Core runtime

The system SHALL advertise Core API contract version at least 8 and capability `codex.desktop-resume.multi-target-v2`. Health and the sole-writer manifest SHALL carry matching runtime identity, version and capabilities. Resume controls and mutations SHALL require a `verified_manifest` snapshot with exact current manifest/health parity. Vite/Tauri transport and Core pre-parser SHALL freshly compare that snapshot before forwarding, body parsing or mutation; drift SHALL return `409 runtime_target_changed` with zero mutation. General settings SHALL reject `codex_desktop_resume`; only dedicated routes may mutate dedicated resume tables. Existing non-resume reads remain available under their existing compatibility gates.

#### Scenario: UI reaches version 7 Core

- **WHEN** health reports contract version 7 or lacks the multi-target capability
- **THEN** resume controls are disabled and no legacy or general-settings resume write is sent.

#### Scenario: Runtime changes after health

- **WHEN** the manifest identity/digest changes before a dedicated mutation
- **THEN** transport or Core rejects the request before mutation.

#### Scenario: Version 8 health and manifest agree

- **WHEN** verified runtime identity, origin, contract and capability parity all hold
- **THEN** the UI may call only the dedicated multi-target routes.

#### Scenario: Background LaunchAgent starts before Core is ready

- **WHEN** the database is missing, has an old schema, lacks the completed migration marker, or a live manifest has an incompatible contract
- **THEN** the background runner exits before creating, migrating or writing the database; only Core may initialize or upgrade it.

## Impacted Readers and Writers

Readers: runtime health/client compatibility and settings snapshot. Writers: runtime manifest owner, dedicated resume routes/repository. Rust transports verified identity but does not read resume tables or Codex logs.

## Compatibility and Migration

Version 7 is stale for resume controls. Core refuses a live/unknown previous manifest owner before DB open. The LaunchAgent is installed only after Core spawn succeeds, and its background runner opens only an already-current Core-owned database. v8 startup transaction creates dedicated tables and neutralizes legacy single-target state without automatically resuming it.

## Verification Mapping

Core health/manifest/Origin/API tests, UI coreFetch/settings tests, Rust manifest tests, typecheck/build and runtime smoke.

## Open Questions

None.
