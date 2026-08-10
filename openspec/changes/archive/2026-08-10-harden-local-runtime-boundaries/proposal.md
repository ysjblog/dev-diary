---
openspec_level: o3
template_version: owner-workflow/v1
change: harden-local-runtime-boundaries
reasons: auth_authorization
---
# Change Proposal: Harden local runtime boundaries

## 中文摘要

DevDiary 的 Core 雖只監聽本機，但瀏覽器中的惡意網站仍可送出請求；目前的 CORS 只阻止讀取回應，沒有阻止寫入或昂貴的 provider 工作。這個 Change 會在任何 body parsing、資料庫寫入或 provider 呼叫前，以精確 Origin 白名單拒絕不受信瀏覽器請求，同時保留 Tauri、已知開發來源與沒有瀏覽器來源標頭的本機工具。它也統一 runtime manifest 的活程序身分、把 LaunchAgent 支援檔放回使用者可寫的 Application Support，並補齊 session timestamp 的台北日期投影。所有驗證使用記憶體資料庫與 mock，不碰使用者真正資料或系統 LaunchAgent。

## Why

Loopback binding prevents remote-network access but does not stop a browser page on the same Mac from submitting local requests. The current response-only CORS behavior therefore leaves app-owned writes and provider/scanner work reachable without browser-origin authority. Adjacent manifest, generated-file and timezone disagreements can also route clients to the wrong process, fail standard-user background setup, or show a UTC day inside otherwise Taipei-scoped features. These are current integrity and reliability defects, not a request for a new remote security model.

## What Changes

- Authorize browser requests centrally before parsing or effects, using exact trusted origins and cross-site Fetch Metadata denial.
- Make the runtime object plus a live numeric PID the shared JS/Rust manifest-routing authority, with bounded fixed-port fallback.
- Finish `Asia/Taipei` projection for session-derived evidence and reject unsafe SQL identifier fragments.
- Keep background support sources in per-user Application Support and validate them before registration replacement.
- Add test-first regression, safe runtime, UI, independent-QA, security and exact-revision evidence.

## Outcome, Authority, and Data Boundary

### Outcome

- An untrusted web page cannot invoke any DevDiary Core route, including simple-form mutations, JSON writes, scans, scheduler work, exports, or reads.
- Every calendar label, day bucket, and hour bucket derived from `sessions.start_time` uses `Asia/Taipei`, including bounded AI/Kanban evidence labels; complete ISO audit timestamps remain explicit UTC facts.
- JS and Rust clients trust a dynamic Core manifest only when it names the expected loopback service and carries a positive, live integer owner PID.
- Generated background-launcher support files live below the current user's DevDiary Application Support directory; the launchd registration remains in the current user's `~/Library/LaunchAgents`.

### Actors and permissions

- The local desktop user may use the packaged Tauri UI, the repository's exact Vite origins, or native/CLI callers to access the loopback Core.
- A browser document with any other `Origin`, an opaque `null` Origin, or `Sec-Fetch-Site: cross-site` without Origin has no authority and MUST be rejected before downstream work.
- Core remains the only writer of app-owned SQLite state and the only executor of configured provider/scanner work.
- JS dev proxy and Rust/Tauri shell may resolve Core routing metadata, but a manifest without live process ownership is untrusted routing input.
- launchd receives one per-user plist registration. No system-wide install or privilege escalation is introduced.

### Protected data and effects

- App-owned settings, sessions, diary, comments, Kanban, scheduler and scan state.
- Configured local project/log reads and provider execution budget.
- Runtime routing integrity and per-user generated launcher/plist files.
- Private runtime SQLite, real provider credentials, and installed LaunchAgents are outside test access for this Change.

## Current Evidence and Problem Statement

- `createServer` currently applies CORS response headers but calls the next middleware for untrusted non-OPTIONS requests; representative mutation routes can therefore execute even when the browser cannot read the response.
- `src/api/devCoreTarget.js` and `src-tauri/src/lib.rs` currently preserve missing-PID manifest compatibility, while the Core lifecycle already treats a missing owner PID as stale.
- the packaged LaunchAgent path derives `/Applications/.DevDiaryLaunchAgents` beside the app bundle, which is not a reliable standard-user write location.
- the existing Taipei query helpers cover persisted day/hour aggregation, but some session-derived prompt and Kanban labels still use the raw UTC date prefix; the SQL helper also accepts an unconstrained identifier string.
- Baseline automated suites are green when run serially. Concurrent Core and first-time Rust compilation caused resource-contention timeouts; the same failing Core cases passed serially and the complete serial suites passed.

## Scope

- Add one central browser-origin authorization policy before `express.json()` and all routes.
- Keep exact built-in origins `tauri://localhost`, `http://localhost:5173`, and `http://127.0.0.1:5173`; accept only explicitly configured exact loopback development origins with an explicit port and origin-only syntax.
- Reject untrusted Origin values and absent-Origin cross-site Fetch Metadata with a stable, non-reflective 403 JSON envelope and zero downstream calls.
- Require numeric positive live PIDs in JS and Rust runtime-manifest consumers; preserve the existing fixed-port fallback when the manifest is invalid.
- Store generated launcher and source plist below `<Application Support>/DevDiary/LaunchAgents` and register it through a per-user `~/Library/LaunchAgents` link.
- Convert the remaining `sessions.start_time` calendar labels through the shared `Asia/Taipei` helper, preserve complete `Z`-suffixed audit timestamps as UTC, and constrain the internal SQLite identifier helper.
- Add test-first boundary, authorization, identity, path, smoke, UI, independent-QA, security and revision-binding evidence.

## Non-Goals

- No authentication server, account model, remote authorization, cloud access, or CSRF token system.
- No change from loopback binding and no arbitrary localhost-port wildcard.
- No destructive database migration or rewrite of stored UTC session timestamps or historical derived rows.
- No inspection or modification of the user's runtime SQLite database, provider credentials, real provider services, installed app, or active LaunchAgent.
- No mobile/responsive redesign; DevDiary remains desktop-only.
- No packaged-app/notarization/long-duration sleep soak claim.
- No merge, push, deployment, release, installation, publication, or branch deletion.

## Capabilities

### Modified Capabilities

- `dev-diary-macos-app`: adds fail-closed browser-origin authorization, live runtime-manifest ownership, complete Taipei session projection and per-user LaunchAgent support-file behavior.

## Human Gates

- Local worktree edits, safe tests, one exact verified commit, and temporary local verification artifacts are authorized by the current request and Owner workflow.
- Merge into `main`, push, deploy/release, packaged installation, launchctl mutation, provider spend, private-runtime-data access, or branch deletion each requires separate explicit authority and is not performed by this Change.

## Impact

- Capability modified: `dev-diary-macos-app`.
- Public HTTP route shapes remain compatible for authorized clients, except unauthorized browser origins now receive the planned `forbidden_origin` response before route-specific behavior.
- Runtime manifest shape does not change; validation intentionally drops backward compatibility for missing/non-positive/non-numeric/dead owner PIDs.
- Stored data schemas and source timestamps do not change.
- LaunchAgent registration label remains `com.ysjblog.devdiary.background`; only per-user generated-file location/link behavior changes.

## Risks

- Risk: a valid developer UI origin is rejected. Mitigation: exact built-in origins, validated explicit worktree origins, trusted preflight tests, and localhost runtime smoke at port 5180.
- Risk: permissive parsing recreates a browser bypass. Mitigation: compare exact strings against a prevalidated set, reject `null`, credentials, paths, queries, fragments, wildcards and non-loopback hosts, and authorize before parsing.
- Risk: no-Origin browser traffic could bypass Origin checks. Mitigation: reject `Sec-Fetch-Site: cross-site`; retain no-Origin only for required native/CLI compatibility and document host/process boundaries as residual risk.
- Risk: strict PID validation sends older clients to the fixed port. Mitigation: this is the intended fail-safe fallback; live current manifests already carry a PID.
- Risk: moving LaunchAgent source files breaks registration. Mitigation: keep the stable label and per-user registration path, use pure path/plist tests, and do not claim installed-app proof in this Change.
- Risk: timezone cleanup changes evidence text. Mitigation: boundary tests around Taipei midnight and no raw timestamp mutation.

## Open Questions

- Trusted worktree origin: exact `http://localhost:5180` and `http://127.0.0.1:5180`, supplied explicitly for verification; never a wildcard.
- No-Origin callers: supported only when Fetch Metadata does not identify a cross-site browser request.
- Invalid development-origin configuration: fail before route construction rather than silently broaden or partially accept the list.
- Historical token rows: no migration; timestamped sessions remain the authoritative date-scoped source under the current Feature Spec.
- LaunchAgent layout: source launcher/plist in DevDiary Application Support, per-user registration link in `~/Library/LaunchAgents`.
- No unresolved question remains for implementation.

## Completion Evidence

- Strict OpenSpec validation, fresh Author Preflight, O3 Contract Matrix (including the load-bearing `doc/test` plan), independent initial review, one consolidated Owner fix if findings exist, and a fresh Sol closer over all required lenses plus security/authorization concerns.
- Because the global router cannot union its standard and trigger-mapped sets, its official receipt gate validates all five standard lenses while the same canonical receipt also carries fail-closed `security` and `authorization` results that the Owner verifies before either review round is accepted; no global skill file is modified by this project.
- Test-first Core integration tests proving denial happens before parser, route, database and provider effects; JS/Rust manifest matrices; Taipei boundary tests; Rust path/link tests.
- Full Core, UI/API and Rust suites, typecheck, UI build, script self-tests, diff/security/secret scans.
- Safe in-memory localhost runtime smoke and supported 1280x820 desktop UI capture.
- Independent no-fork black-box QA and fresh security/authorization closer, first bound to the deterministic candidate digest and then rerun against the final commit SHA in external revision-scoped evidence directories.
- Clean committed feature worktree and unchanged clean primary `main`; no remote or installed-system mutation.
