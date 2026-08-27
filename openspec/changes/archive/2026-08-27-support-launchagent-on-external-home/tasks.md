---
openspec_level: o2
template_version: owner-workflow/v1
change: support-launchagent-on-external-home
reasons: material_decision
---
# Implementation Tasks: Support LaunchAgent on an external HOME

## 中文摘要

先固定 external-HOME 失敗證據與新契約，再以測試先行恢復 packaged sibling path，最後重建安裝包並在真實 `launchd` 執行路徑驗證。

- [x] 1.1 Record the installed 0.1.4 failure: valid source plist under external-HOME app data, `launchctl` exit 5, missing stable service.
- [x] 1.2 Route the durable storage decision as O2 and resolve the selected packaged/development split.
- [x] 2.1 Update `doc/test/background-launchagent-runner.md` with external-HOME regression and installed-runtime acceptance.
- [x] 2.2 Replace the current opposite Rust assertion with a failing packaged-sibling path test while retaining the development app-data case.
- [x] 3.1 Add the smallest packaged path resolver and keep validation/ownership/failure order unchanged.
- [x] 3.2 Run Rust tests, full relevant suites, Build/Type/Security/Diff verification, and OpenSpec strict/Author Preflight.
- [x] 4.1 Run one focused independent O2 review after Author Preflight and consume all findings.
- [x] 4.2 Rebuild the candidate, verify the DMG and packaged Core, then replace the authorized local App with rollback protection.
- [x] 4.3 On the external-HOME host, prove the App-installed LaunchAgent is registered/running, Core contract 6 is healthy, database integrity/counts are preserved, schedule is 23:40, and Ollama qwen3:8b succeeds without fallback.
- [x] 5.1 Archive the Change without `--skip-specs`, normalize current Feature Spec/MASTER, run all-current preflight, and create the final verified commit without push/release.

## Requirement Traceability

- Removed `Background-runner support files stay in the user data boundary` → 1.1, 1.2, 2.1, 2.2.
- `Background-runner support files use a launchd-compatible local boundary` → 2.1, 2.2, 3.1, 4.3.
- Candidate validation and cleanup preservation: 3.1, 3.2.
- Packaged runtime and external-HOME execution: 4.2, 4.3.

## Verification

- `cargo test packaged_launch_agent_files_use_local_app_sibling_while_development_uses_application_support` and `cargo test` in `src-tauri`.
- `openspec validate support-launchagent-on-external-home --strict --no-interactive` and fresh Author Preflight receipt checks.
- Root/Core tests, typecheck, build, security scan, diff review, fresh `npm run package:mac`, and mounted verifier.
- Installed App startup followed by `launchctl print`, Core health/settings, SQLite integrity/count checks, and Ollama provider-success evidence.

## Open Questions

None.
