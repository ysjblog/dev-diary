# Legacy OpenSpec Migration Map

> Migration date: 2026-07-23
> Baseline checkout: `~/Projects/dev-diary`
> Baseline HEAD: `7330756` (`chore(release): publish sanitized v0.1.1`)

## Cutover rule

`openspec/specs/` is the only current Feature Spec source. There are no active Changes after reconciliation. New active specs MUST be created under `openspec/`; `docs/specs/legacy/` is read-only provenance, and `docs/specs/deltas/` is no longer an active source.

The legacy main Feature Spec and all Delta/review documents were preserved byte-for-byte while being moved. The implemented behavior was semantically consolidated into [`openspec/specs/dev-diary-macos-app/spec.md`](../../../openspec/specs/dev-diary-macos-app/spec.md); this migration is not a file-only move.

## Classification

- **CURRENT-RECONCILED**: legacy behavior is represented in the current Feature Spec and has source/test or release evidence in the repository.
- **HISTORY-ONLY**: documentation or asset/release provenance that is not a current product behavior contract.
- **DEFERRED-NON-GOAL**: explicitly excluded or hardening work; not declared current or active.
- **NEEDS CONFIRMATION**: none. No legacy item was promoted to current without an evidence-backed classification; unresolved future work remains explicitly deferred.

## Old path → new path

| Old path | New path | Status | Evidence / reason |
|---|---|---|---|
| `docs/specs/dev-diary-macos-app.md` | [`openspec/specs/dev-diary-macos-app/spec.md`](../../../openspec/specs/dev-diary-macos-app/spec.md) | CURRENT-RECONCILED | Legacy `Status: implemented`; current source/test inventory and release history reconciled into one Feature Spec. |
| `docs/specs/MASTER.md` | [`docs/specs/MASTER.md`](../MASTER.md) | REBUILT | Rewritten as a Traditional-Chinese index; old copy preserved at `legacy/MASTER-legacy-2026-07-23.md`. |
| `docs/specs/deltas/agent-runtime-reliability-ui-delta.md` | `docs/specs/legacy/deltas/agent-runtime-reliability-ui-delta.md` | CURRENT-RECONCILED | `core/test/diaryAgent.test.ts`, `core/test/backgroundRunner.test.ts`, `src/api/appShell.test.js`; current MASTER states implemented/verified. |
| `docs/specs/deltas/agent-source-path-settings-delta.md` | `docs/specs/legacy/deltas/agent-source-path-settings-delta.md` | CURRENT-RECONCILED | `core/test/agentDetection.test.ts`, `core/src/services/agentDetection.ts`, recent source-settings commits. |
| `docs/specs/deltas/ai-diary-agent-delta.md` | `docs/specs/legacy/deltas/ai-diary-agent-delta.md` | CURRENT-RECONCILED | `core/test/diaryAgent.test.ts`, `core/src/services/diaryAgent.ts`, commit `8bfc683`. |
| `docs/specs/deltas/antigravity-project-scan-delta.md` | `docs/specs/legacy/deltas/antigravity-project-scan-delta.md` | CURRENT-RECONCILED | `core/test/antigravitySession.test.ts`, `core/test/projectDiscovery.test.ts`, parser source. |
| `docs/specs/deltas/antigravity-session-storm-delta.md` | `docs/specs/legacy/deltas/antigravity-session-storm-delta.md` | CURRENT-RECONCILED | `core/test/antigravitySession.test.ts`; safe session gate retained. |
| `docs/specs/deltas/app-icon-refresh-delta.md` | `docs/specs/legacy/deltas/app-icon-refresh-delta.md` | CURRENT-RECONCILED | Packaged-app assets and release history; represented under packaging boundary, not a separate capability. |
| `docs/specs/deltas/app-startup-auto-scan-delta.md` | `docs/specs/legacy/deltas/app-startup-auto-scan-delta.md` | CURRENT-RECONCILED | `src/api/autoScanPolicy.test.js`, Core startup scan source. |
| `docs/specs/deltas/background-kanban-ai-quota-fix-delta.md` | `docs/specs/legacy/deltas/background-kanban-ai-quota-fix-delta.md` | CURRENT-RECONCILED | `core/test/backgroundRunner.test.ts`, scheduler/kanban source; background AI is daily-gated. |
| `docs/specs/deltas/background-launchagent-runner-delta.md` | `docs/specs/legacy/deltas/background-launchagent-runner-delta.md` | CURRENT-RECONCILED | `core/test/backgroundRunner.test.ts`, `scripts/devdiary-background-launcher.sh`. |
| `docs/specs/deltas/brag-video-polish-delta.md` | `docs/specs/legacy/deltas/brag-video-polish-delta.md` | HISTORY-ONLY | Video asset polish; no durable runtime contract. |
| `docs/specs/deltas/cli-log-parser-delta.md` | `docs/specs/legacy/deltas/cli-log-parser-delta.md` | CURRENT-RECONCILED | `core/test/cliLogParser.test.ts`, `core/src/services/cliLogParser.ts`. |
| `docs/specs/deltas/codex-scan-heatmap-fix-delta.md` | `docs/specs/legacy/deltas/codex-scan-heatmap-fix-delta.md` | CURRENT-RECONCILED | `core/test/scans.test.ts`, `src/api/dashboard.test.js`, dashboard parser/heatmap source. |
| `docs/specs/deltas/core-engine-dashboard-delta.md` | `docs/specs/legacy/deltas/core-engine-dashboard-delta.md` | CURRENT-RECONCILED | `core/test/dashboard.test.ts`, `src/api/dashboard.test.js`; later UI wiring commits supersede old partial status. |
| `docs/specs/deltas/core-runtime-lifecycle-hardening-delta.md` | `docs/specs/legacy/deltas/core-runtime-lifecycle-hardening-delta.md` | CURRENT-RECONCILED | `core/test/runtimeManifest.test.ts`, `core/src/services/runtimeManifest.ts`. |
| `docs/specs/deltas/custom-agent-safe-probe-delta.md` | `docs/specs/legacy/deltas/custom-agent-safe-probe-delta.md` | CURRENT-RECONCILED | `core/test/customAgents.test.ts`, `src/api/settings.test.js`. |
| `docs/specs/deltas/daily-ai-highlight-plain-language-delta.md` | `docs/specs/legacy/deltas/daily-ai-highlight-plain-language-delta.md` | CURRENT-RECONCILED | `core/test/dailyScheduler.test.ts`, `src/api/dashboard.test.js`. |
| `docs/specs/deltas/dashboard-24h-hourly-trend-delta.md` | `docs/specs/legacy/deltas/dashboard-24h-hourly-trend-delta.md` | CURRENT-RECONCILED | `src/api/dashboard.test.js`; commit `992ec92`. |
| `docs/specs/deltas/dashboard-wiring-delta.md` | `docs/specs/legacy/deltas/dashboard-wiring-delta.md` | CURRENT-RECONCILED | `src/api/dashboard.test.js`, current Dashboard wiring. |
| `docs/specs/deltas/dynamic-core-port-discovery-delta.md` | `docs/specs/legacy/deltas/dynamic-core-port-discovery-delta.md` | CURRENT-RECONCILED | `core/test/runtimePort.test.ts`, `src/api/devCoreTarget.test.js`. |
| `docs/specs/deltas/export-backup-delta.md` | `docs/specs/legacy/deltas/export-backup-delta.md` | CURRENT-RECONCILED | `core/test/exports.test.ts`, `src/api/settings.test.js`. |
| `docs/specs/deltas/git-status-wiring-delta.md` | `docs/specs/legacy/deltas/git-status-wiring-delta.md` | CURRENT-RECONCILED | `core/test/gitStatus.test.ts`; old “後續 delta” section is superseded by later wiring commit. |
| `docs/specs/deltas/kanban-ai-suggested-cards-delta.md` | `docs/specs/legacy/deltas/kanban-ai-suggested-cards-delta.md` | CURRENT-RECONCILED | `core/test/kanbanAiSuggestions.test.ts`, `src/api/appShell.test.js`. |
| `docs/specs/deltas/kanban-auto-synthesis-delta.md` | `docs/specs/legacy/deltas/kanban-auto-synthesis-delta.md` | CURRENT-RECONCILED | `core/test/kanbanSynthesis.test.ts`; deterministic v1 wording remains current. |
| `docs/specs/deltas/kanban-doc-folder-settings-regression-delta.md` | `docs/specs/legacy/deltas/kanban-doc-folder-settings-regression-delta.md` | CURRENT-RECONCILED | `src/api/appShell.test.js`, `src/api/settings.test.js`. |
| `docs/specs/deltas/kanban-hybrid-status-lock-delta.md` | `docs/specs/legacy/deltas/kanban-hybrid-status-lock-delta.md` | CURRENT-RECONCILED | `core/test/kanbanSynthesis.test.ts`, `core/test/projectWrites.test.ts`, UI shell tests. |
| `docs/specs/deltas/local-api-runtime-discovery-delta.md` | `docs/specs/legacy/deltas/local-api-runtime-discovery-delta.md` | CURRENT-RECONCILED | `core/test/runtimeHealth.test.ts`, `src/api/settings.test.js`. |
| `docs/specs/deltas/log-scan-unlimited-history-delta.md` | `docs/specs/legacy/deltas/log-scan-unlimited-history-delta.md` | CURRENT-RECONCILED | `core/test/logFileScanCache.test.ts`; commit `02279a4` and recorded 129-session smoke. |
| `docs/specs/deltas/macos-signed-release-distribution-delta.md` | `docs/specs/legacy/deltas/macos-signed-release-distribution-delta.md` | CURRENT-RECONCILED | Packaging scripts and release/Finder QA history; future Developer ID remains deferred. |
| `docs/specs/deltas/onboarding-core-backed-delta.md` | `docs/specs/legacy/deltas/onboarding-core-backed-delta.md` | CURRENT-RECONCILED | `src/api/autoScanPolicy.test.js`, `src/api/appShell.test.js`, current onboarding source. |
| `docs/specs/deltas/persistent-db-runtime-delta.md` | `docs/specs/legacy/deltas/persistent-db-runtime-delta.md` | CURRENT-RECONCILED | `core/src/db/index.ts`, runtime config tests and current MASTER. |
| `docs/specs/deltas/project-discovery-rescan-fix-delta.md` | `docs/specs/legacy/deltas/project-discovery-rescan-fix-delta.md` | CURRENT-RECONCILED | `core/test/projectDiscovery.test.ts`; commit `363c045` / `1948a04`. |
| `docs/specs/deltas/public-repository-privacy-scrub-delta.md` | `docs/specs/legacy/deltas/public-repository-privacy-scrub-delta.md` | HISTORY-ONLY | Release/repository hygiene change; provenance retained, not a current user workflow. |
| `docs/specs/deltas/readme-product-guide-redaction-delta.md` | `docs/specs/legacy/deltas/readme-product-guide-redaction-delta.md` | HISTORY-ONLY | README/documentation redaction; README is outside this migration write scope. |
| `docs/specs/deltas/revised-brag-video-asset-delta.md` | `docs/specs/legacy/deltas/revised-brag-video-asset-delta.md` | HISTORY-ONLY | Video asset provenance; no current behavior contract. |
| `docs/specs/deltas/scan-diary-docs-usability-delta.md` | `docs/specs/legacy/deltas/scan-diary-docs-usability-delta.md` | CURRENT-RECONCILED | `core/test/scans.test.ts`, `core/test/diaryAgent.test.ts`, `src/api/appShell.test.js`. |
| `docs/specs/deltas/scan-now-project-rescan-delta.md` | `docs/specs/legacy/deltas/scan-now-project-rescan-delta.md` | CURRENT-RECONCILED | `core/test/scans.test.ts`, `src/api/projects.test.js`. |
| `docs/specs/deltas/scan-provider-runtime-delta.md` | `docs/specs/legacy/deltas/scan-provider-runtime-delta.md` | CURRENT-RECONCILED | `core/test/scans.test.ts`, `core/src/services/scans.ts`. |
| `docs/specs/deltas/scheduler-preflight-recovery-delta.md` | `docs/specs/legacy/deltas/scheduler-preflight-recovery-delta.md` | CURRENT-RECONCILED | `core/test/dailyScheduler.test.ts`, `src/api/settings.test.js`. |
| `docs/specs/deltas/settings-agent-detection-daily-scheduler-delta.md` | `docs/specs/legacy/deltas/settings-agent-detection-daily-scheduler-delta.md` | CURRENT-RECONCILED | `core/test/agentDetection.test.ts`, `core/test/dailyScheduler.test.ts`. |
| `docs/specs/deltas/settings-ai-prompts-path-controls-delta.md` | `docs/specs/legacy/deltas/settings-ai-prompts-path-controls-delta.md` | CURRENT-RECONCILED | `src/api/settings.test.js`, current Settings UI source. |
| `docs/specs/deltas/settings-backend-delta.md` | `docs/specs/legacy/deltas/settings-backend-delta.md` | CURRENT-RECONCILED | `core/test/settings.test.ts`, Core settings routes. |
| `docs/specs/deltas/settings-daily-diary-usability-delta.md` | `docs/specs/legacy/deltas/settings-daily-diary-usability-delta.md` | CURRENT-RECONCILED | `src/api/projects.test.js`, `src/api/appShell.test.js`. |
| `docs/specs/deltas/settings-dashboard-polish-delta.md` | `docs/specs/legacy/deltas/settings-dashboard-polish-delta.md` | CURRENT-RECONCILED | `src/api/dashboard.test.js`, `src/api/appShell.test.js`. |
| `docs/specs/deltas/settings-ui-delta.md` | `docs/specs/legacy/deltas/settings-ui-delta.md` | CURRENT-RECONCILED | `src/api/settings.test.js`, Settings UI source. |
| `docs/specs/deltas/tauri-packaging-delta.md` | `docs/specs/legacy/deltas/tauri-packaging-delta.md` | CURRENT-RECONCILED | `scripts/package-mac-release.sh`, Tauri shell, release evidence. |
| `docs/specs/deltas/ui-scaffold-delta.md` | `docs/specs/legacy/deltas/ui-scaffold-delta.md` | CURRENT-RECONCILED | `src/api/appShell.test.js`, current React/Tauri shell; old mock-only status is historical. |
| `docs/specs/deltas/workspace-active-idle-session-window-delta.md` | `docs/specs/legacy/deltas/workspace-active-idle-session-window-delta.md` | CURRENT-RECONCILED | `core/test/projects.test.ts`, `src/api/projects.test.js`. |
| `docs/specs/deltas/workspace-diary-docs-token-hardening-delta.md` | `docs/specs/legacy/deltas/workspace-diary-docs-token-hardening-delta.md` | CURRENT-RECONCILED | `core/test/projectWrites.test.ts`, `src/api/appShell.test.js`. |
| `docs/specs/deltas/workspace-kanban-comments-docs-scan-delta.md` | `docs/specs/legacy/deltas/workspace-kanban-comments-docs-scan-delta.md` | CURRENT-RECONCILED | `core/test/projectWrites.test.ts`, `src/api/appShell.test.js`. |
| `docs/specs/deltas/workspace-range-state-delta.md` | `docs/specs/legacy/deltas/workspace-range-state-delta.md` | CURRENT-RECONCILED | `core/test/projects.test.ts`, `src/api/projects.test.js`. |
| `docs/specs/deltas/workspace-wiring-delta.md` | `docs/specs/legacy/deltas/workspace-wiring-delta.md` | CURRENT-RECONCILED | `core/test/projects.test.ts`, `core/test/gitStatus.test.ts`, UI API tests; old delayed sections are superseded. |
| `docs/specs/deltas/workspace-write-paths-delta.md` | `docs/specs/legacy/deltas/workspace-write-paths-delta.md` | CURRENT-RECONCILED | `core/test/projectWrites.test.ts`, `src/api/projects.test.js`. |
| `docs/specs/reviews/agent-source-path-settings-review-state.md` | `docs/specs/legacy/reviews/agent-source-path-settings-review-state.md` | PROVENANCE-REVIEW | Review authority retained; current behavior mapped above. |
| `docs/specs/reviews/dev-diary-macos-app-review-state.md` | `docs/specs/legacy/reviews/dev-diary-macos-app-review-state.md` | PROVENANCE-REVIEW | Historical Level 3 review and follow-up audit retained. |
| `docs/specs/reviews/kanban-ai-suggested-cards-review-state.md` | `docs/specs/legacy/reviews/kanban-ai-suggested-cards-review-state.md` | PROVENANCE-REVIEW | Review facts retained; implementation evidence now in current tests. |
| `docs/specs/reviews/kanban-doc-folder-settings-regression-review-state.md` | `docs/specs/legacy/reviews/kanban-doc-folder-settings-regression-review-state.md` | PROVENANCE-REVIEW | Runtime regression review retained. |
| `docs/specs/reviews/kanban-hybrid-status-lock-review-state.md` | `docs/specs/legacy/reviews/kanban-hybrid-status-lock-review-state.md` | PROVENANCE-REVIEW | Cross-module review retained; current lock behavior mapped above. |
| `docs/specs/reviews/macos-signed-release-distribution-review-state.md` | `docs/specs/legacy/reviews/macos-signed-release-distribution-review-state.md` | PROVENANCE-REVIEW | Release review and manual approval boundary retained. |
| `docs/specs/reviews/readme-product-guide-redaction-review-state.md` | `docs/specs/legacy/reviews/readme-product-guide-redaction-review-state.md` | PROVENANCE-REVIEW | Documentation/security review retained as history. |
| `docs/specs/reviews/scan-diary-docs-usability-review-state.md` | `docs/specs/legacy/reviews/scan-diary-docs-usability-review-state.md` | PROVENANCE-REVIEW | Scan/diary/docs review retained as history. |

## Evidence and limits

The repository was clean at bootstrap and at migration start; baseline branch was `main` at `7330756`. Source and test paths above were inspected locally. The migration does not claim a fresh browser, packaged-app, real provider, OAuth, or long-duration runtime run. Those claims remain limited to the historical evidence explicitly identified above; any future change must obtain fresh evidence in its own Execute and Verify-QA phases.
