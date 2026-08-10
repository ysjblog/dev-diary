---
openspec_level: o3
template_version: owner-workflow/v1
change: harden-local-runtime-boundaries
reasons: auth_authorization
---
# Technical Design: Harden local runtime boundaries

## 中文摘要

本設計把四個相鄰但不同的可靠性缺口收斂成明確契約：Core 在解析請求內容前先以精確清單決定瀏覽器來源能否進入；JS 與 Rust 只接受由活程序擁有的 loopback runtime manifest；LaunchAgent 的 launcher 與來源 plist 固定存於使用者 Application Support；所有 session 日期標籤都透過同一個台北時區 helper。拒絕路徑不反射攻擊者輸入、不執行 route/provider/DB，invalid manifest 只回到驗證過的固定埠。沒有資料 migration，也不會在測試中安裝 LaunchAgent。

## Context

- `core/src/server.ts` currently builds an Express app, applies `applyLocalCors`, returns 204 for every OPTIONS request, and only then installs `express.json()`. A non-allowlisted regular request still reaches the parser and routes.
- The server has 21 POST/PUT/PATCH/DELETE routes spanning settings, agent configuration, scheduler, scan, Kanban, comments, summary and diary behavior. A central guard is less drift-prone than route-local checks.
- Core writes a mode-0600 manifest with `service`, `url`, and `runtime.host/port/pid/started_at`. Core considers missing PID stale; JS and Rust clients currently do not.
- JS prefers a valid top-level manifest URL over runtime host/port; Rust derives from runtime only. Both preserve a fixed-port fallback.
- Packaged LaunchAgent support files currently resolve beside `/Applications`, while development uses Application Support; package and development installation also differ between symlink and rename.
- Existing SQL readers use `sqliteTaipeiDate`/`sqliteTaipeiHour`, and the scanner's `token_usage` writer already calls `taipeiDate(new Date(start_time))`. Remaining raw session date labels exist in diary/Kanban prompt synthesis.

## Goals / Non-Goals

- Goals: stop unauthorized browser requests before all effects; make dynamic runtime routing owner-bound and consistent; finish safe Taipei session projection; keep generated background support in the current user's writable boundary; provide revision-bound reproducible proof.
- Non-goals: remote/account authentication, arbitrary same-user process sandboxing, database migration, provider spend, real LaunchAgent mutation, packaged installation/soak, mobile layout, merge/push/deploy/release.

## Threat, Actors, Assets, and Authority

### Threat actor and path

1. The local user has DevDiary Core running on loopback.
2. The user visits an attacker-controlled browser page.
3. The page sends a simple POST, or another request, to a guessed DevDiary loopback port.
4. Browser CORS prevents the page from reading the response but does not prevent the request or its effects.
5. Without an authorization guard, scan/provider/database work can execute under the user's local authority.

### Protected assets

- Integrity of app-owned settings, diary, comments, Kanban, scheduler and scan state.
- Confidentiality of route responses and private local metadata.
- Provider/scanner execution budget and local machine work.
- Correct routing to the Core process that wrote the manifest.
- Per-user launcher/plist state without writes beside `/Applications`.

### Authorized callers

- Exact built-ins: `tauri://localhost`, `http://localhost:5173`, `http://127.0.0.1:5173`.
- Explicit additional development origins accepted by a planned validator: HTTP only; host exactly `localhost` or `127.0.0.1`; explicit valid port; input exactly equals the URL origin; no credentials, path, query, fragment, wildcard, userinfo, alternate hostname or non-loopback address.
- Native/CLI requests without Origin and without `Sec-Fetch-Site: cross-site`.
- This worktree's smoke explicitly supplies only `http://localhost:5180` and `http://127.0.0.1:5180`.

## Contract Inventory

| Area | Existing identifiers / facts | Planned NEW or modified contract |
|---|---|---|
| HTTP server | `createServer`, `CreateServerOptions`, `applyLocalCors`, built-in origin set | NEW `browserOriginPolicy` helpers; NEW optional exact development origins in `CreateServerOptions`; central deny/allow middleware before `express.json()` |
| Error response | route-specific JSON envelopes | NEW stable `403 {"error":"forbidden_origin","message":"Browser origin is not trusted for this local service."}`; never echo request Origin |
| Runtime manifest | `resolveCoreApiTarget`, `resolve_core_api_origin_from_manifest`, `isRuntimeManifestStale`, fixed-port fallbacks | Runtime object is canonical; PID must be a numeric positive live integer; host loopback; port integer 1..65535; top-level URL, when present, must match runtime origin |
| Date projection | `taipeiDate`, `sqliteTaipeiDate`, `sqliteTaipeiHour` | SQL helper accepts only a verified qualified identifier; session prompt/Kanban labels call `taipeiDate(new Date(timestamp))` |
| LaunchAgent | `launch_agent_storage_dir`, `packaged_launch_agent_storage_dir`, `install_background_launch_agent` | Remove packaged beside-app storage; source launcher/plist always under app data; per-user registration always links to source; lint source before replacing registration |
| Verification | existing Vitest/node:test/Rust suites | NEW deterministic candidate-digest and in-memory runtime-smoke scripts plus self-tests; external revision-scoped receipts |

## Runtime Path and Data Flow

1. Core bootstrap validates its optional additional development-origin list and constructs one trusted set before it can serve.
2. Every incoming request passes the origin/fetch-metadata guard before JSON parsing and all route effects.
3. Core binds loopback and writes the current runtime manifest with numeric PID; JS/Rust readers either validate that exact owner-bound runtime or use a bounded fixed-port fallback.
4. Scans keep UTC timestamp facts and write already-Taipei token deltas; date-scoped query/prompt consumers project through shared helpers.
5. A later explicitly authorized background install writes/lints support files in app data before linking/bootstrap under the current user.
6. Tests and smoke use memory/temporary state; evidence is written only after the candidate digest into its external revision directory.

## Decisions

- D1 below chooses a central exact-origin middleware, not route-local CORS checks or a wildcard.
- D2 makes `runtime` canonical and intentionally removes missing-PID compatibility.
- D3 keeps UTC source facts and converts at read/evidence boundaries rather than migrating data.
- D4 unifies packaged/development support storage and registration-link behavior.
- D5 keeps evidence outside the delivery digest after the revision is frozen.

## D1 — Browser-Origin Authorization

### Configuration

- Build the trusted set once when `createServer` is called.
- Always include the three built-in origins.
- `CreateServerOptions` receives an optional list of additional development origins. The bootstrap may parse `DEVDIARY_DEV_BROWSER_ORIGINS` as a comma-separated exact list; absent means no additions.
- Validation is all-or-nothing. Split the configured list, trim only comma-transport whitespace, reject empty tokens, parse and verify each input is exactly its URL origin, then compare canonical origins against the growing set. Any duplicate additional token or collision with a built-in trusted origin, invalid URL, disallowed scheme/host, missing or out-of-range port, credential, path, query, fragment, wildcard, or non-origin spelling throws before the Express app is returned. Duplicates include collisions with built-in trusted origins. The validator never converts an invalid value into a broader value.
- The packaged launcher does not set the development-origin variable. There is no `localhost:*` behavior.

### Request execution order

1. `express()` creates the app without body middleware.
2. The central origin middleware reads `Origin` and `Sec-Fetch-Site` only.
3. If Origin exists and is not an exact member, return the stable 403 envelope, do not set `Access-Control-Allow-Origin`, and stop.
4. If Origin is absent and Fetch Metadata equals `cross-site` case-insensitively, return the same 403 and stop.
5. If Origin is trusted, set exact CORS response headers and `Vary: Origin`.
6. If the authorized request is OPTIONS, return 204 before parsing or route dispatch.
7. Otherwise call the next middleware; only now may `express.json()` parse a body and routes run.
8. An absent-Origin request without cross-site Fetch Metadata continues without CORS response headers for native/CLI compatibility.

The order applies to every method and every current/future route. A malformed JSON body from an untrusted source therefore returns 403 rather than a parser error. Read endpoints are also denied to prevent a future no-CORS/non-browser client from accidentally treating CORS as the sole confidentiality boundary.

### Failure and observability

- Authorization denial is deterministic and contains no raw Origin, URL, body, path, credential, or private state.
- A planned pure `browserOriginPolicy` middleware factory exposes the Express `next` boundary for a direct next-call spy. Untrusted unit cases assert `next === 0`; because `express.json()` and every route are installed only after that middleware, this independently proves parser/dispatch cannot begin.
- HTTP integration combines malformed JSON (403 rather than parser error), an injected scan/provider spy, database before/after queries around representative settings/app-owned writes, and a table covering every current mutation route. This observes next, parser, provider, and database outcomes independently instead of treating a 403 alone as proof.
- The authorization test seam observes next, parser, provider, and database counters independently. Untrusted Origin GET and OPTIONS both return forbidden_origin before dispatch; trusted OPTIONS and no-Origin CLI GET/mutation/OPTIONS have explicit assertions.
- No request audit table or new sensitive logging is added.

## D2 — Runtime Manifest Identity

### Canonical validity

A client trusts a manifest only when all conditions hold:

1. JSON is an object and `service === "devdiary-core"`.
2. `runtime.host` is exactly `127.0.0.1` or `localhost`.
3. `runtime.port` is a JSON number, safe integer, and in 1..65535.
4. `runtime.pid` is a JSON number, positive integer within the consumer's supported range, and the process liveness check succeeds.
5. If top-level `url` exists, it parses as the same exact HTTP origin derived from runtime; disagreement invalidates the manifest instead of letting consumers choose different ports.

The runtime object, not the redundant top-level URL, is canonical. Missing, string, zero, negative, dead or malformed PID fails closed. The Core writer already produces the accepted current shape, so no manifest migration is needed.

### Resolution order and fallback

- JS retains an explicitly configured, validated loopback `DEVDIARY_CORE_URL` as the first developer override.
- Otherwise JS and Rust apply the same strict manifest contract.
- Invalid or absent manifest uses an explicitly configured port only if it is an integer in 1..65535; otherwise both use `http://127.0.0.1:4317`.
- Consumers do not delete or rewrite invalid manifests; Core remains the lifecycle owner.

### Compatibility decision

Backward compatibility for missing PID is intentionally removed because ownership is the trust property. A stale legacy manifest may cause one safe fixed-port fallback attempt, which is preferable to dialing an unrelated process at an unowned dynamic port.

## D3 — Asia/Taipei Session Projection

- Stored session timestamps remain UTC ISO facts. Complete `Z`-suffixed timestamps in detailed/audit exports stay unchanged; only their date selection/grouping and separate calendar labels use Taipei.
- `taipeiDate(new Date(session.start_time))` is the only session-to-calendar-label conversion in diary and Kanban evidence.
- `sqliteTaipeiDate` and `sqliteTaipeiHour` accept only a trusted qualified identifier matching `^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$`; they throw for leading digits, consecutive/trailing dots, SQL fragments, quoting, whitespace, punctuation or user input.
- Date-only canonical arithmetic/validation (`YYYY-MM-DD` ranges, seeds, browser calendar arrays) is not a session timestamp projection and is not changed.
- Card `created_at`/`updated_at` date filtering is reviewed separately in tests; if it represents a user-visible local calendar day, it uses the same helper, but no unrelated date-only arithmetic is broadly rewritten.
- No session or token row is migrated. Timestamped sessions remain authoritative for historical date-scoped reads, while new token deltas retain the already-correct Taipei date writer.

## D4 — Per-User LaunchAgent Support Files

### File layout

- `app_data_dir` remains `~/Library/Application Support/DevDiary`.
- Source support directory is always `<app_data_dir>/LaunchAgents`, independent of whether Core lives in a development tree or `/Applications/DevDiary.app`.
- Launcher: `<app_data_dir>/LaunchAgents/bin/devdiary-background-launcher.sh`.
- Source plist: `<app_data_dir>/LaunchAgents/com.ysjblog.devdiary.background.plist`.
- Registration: `~/Library/LaunchAgents/com.ysjblog.devdiary.background.plist`, as a symlink to the source plist.
- Logs remain below `<app_data_dir>/logs`.

### Installation order and failure behavior

1. Resolve per-user app data, HOME, uid/domain and paths; fail before writes if any authority fact is missing.
2. Create app-data/log/support directories and write private launcher/source plist.
3. Run `plutil -lint` on the source plist before replacing the registration path.
4. Clean only legacy registrations that pass the existing DevDiary ownership markers.
5. Replace the current per-user registration with the new link, then run per-user bootout/bootstrap/enable/kickstart.
6. If link creation or bootstrap fails, remove only a registration that still points to the source from this attempt and return/log failure; never delete unrelated files. Generated app-data support files may remain for diagnosis and retry.

Unit tests cover pure paths, ownership-limited cleanup decisions, link-target checks and manifest parsing. They do not invoke real launchctl, modify HOME, or write outside temporary directories. Packaged installation and lifecycle soak remain deferred proof.

## D5 — Verification and Revision Binding

- Product tests are authored and observed failing before each product fix.
- `scripts/verification-candidate-digest.sh` hashes the current HEAD identity, tracked diff bytes, and every non-ignored untracked delivery file/path in stable byte order.
- Digest and smoke tools have their own temporary-repository/in-memory self-tests.
- `Tasks`, Delta and the Contract Matrix carry every load-bearing test case. The execution worksheet `doc/test/reliability-security-hardening.md` is additionally inventoried by the Contract Matrix; Author Preflight continues to cover its standard Proposal/Design/Tasks/Delta/baseline set, so neither authority is silently substituted for the other.
- Preliminary automated/runtime/UI/QA/security checks may run before reconciliation to discover failures. Their output is provisional and never accepted as candidate completion evidence.
- After preliminary checks pass, update task status, sync/archive the Change, reconcile the current Feature Spec and `MASTER.md`, and make every other delivery-file edit. Complete all delivery-file reconciliation before freezing the candidate digest.
- Only then compute the candidate digest and rerun the full automated/runtime/UI/independent/security gates. Candidate evidence goes only to `/tmp/devdiary-reliability-security-hardening/<candidate-digest>/`; no delivery file changes after that freeze are allowed without discarding evidence, reconciling again, recomputing the digest and rerunning every candidate gate.
- After the exact verified allowlist is committed, all automated, runtime, UI, independent-QA and security evidence is rerun into `/tmp/devdiary-reliability-security-hardening/<final-HEAD>/`.
- No post-commit receipt is written to a tracked or non-ignored worktree path; evidence cannot change the revision it claims to verify.

### O3 review receipt compatibility

- The project does not modify the global Codex review skill. Its current router validates either five standard lenses or trigger-mapped lenses rather than their union.
- This Change leaves `routing_signals` empty for the official five-lens receipt validation, records `auth_authorization` separately as the routing reason, and requires the same canonical receipt to carry `trigger_lens_results` with exactly `security` and `authorization`.
- Before either review round is accepted, the Owner runs the official router and a fail-closed structured assertion over those two trigger fields. Missing, non-pass/non-findings or inconclusive trigger results block progress. The final closer must pass all seven recorded results.

## Execution Order and Failure Recovery

- Authorization always precedes parser/route/provider/DB work; denial terminates once with no compensating mutation needed.
- Manifest validation completes before any dynamic origin is selected; a failed invariant selects only the validated fixed-port fallback and never rewrites the manifest.
- Taipei conversion occurs at query/evidence boundaries; failure in identifier validation occurs before SQL preparation and never alters stored UTC facts.
- LaunchAgent source lint precedes registration replacement. Failure cleanup may unlink only the exact registration created by the current attempt and never unrelated state; actual lifecycle proof remains deferred because this Change does not run launchctl.
- Candidate evidence is invalid after any delivery-file change; final evidence is rerun against commit `HEAD`. A failed gate stops commit/closeout and leaves merge/push/install unavailable.

## Security and Privacy

- No new persistent table, secret, credential, raw transcript or account identifier.
- Origin errors and manifests never expose request bodies or private paths.
- Runtime verification uses `:memory:` SQLite, mock providers and synthetic boundary timestamps.
- Local filesystem tests use isolated temporary directories; no private runtime DB, real provider, launchctl mutation, install, release or remote operation.
- Residual boundary: a non-browser local process can omit Origin and Fetch Metadata. DevDiary is a single-user local app, so OS process/user trust plus loopback binding remains the native/CLI control; this Change does not claim sandboxing against malicious same-user processes.

## Migration and Rollback

- No database migration. Existing UTC session facts and current manifest writer shape remain.
- On upgrade, legacy manifests without live PIDs stop being dynamic routing authority and fall back safely.
- On LaunchAgent reinstall, support files move to Application Support; existing legacy cleanup remains ownership-marker limited. This task does not run that reinstall.
- Authorized clients keep route schemas. Unauthorized origins receive a deliberate new 403 behavior.
- Before commit, each contract can be reversed as a targeted patch with its tests. After commit, rollback is a normal revert commit by a later authorized integrator; history is not rewritten.
- Downgrade may again trust missing-PID manifests or use the old packaged support path; therefore release notes must keep this hardening atomic if later publication is authorized.

## Risks / Trade-offs

- Exact origin matching may reject an unlisted developer port; explicit validated worktree configuration is the deliberate recovery, not wildcard broadening.
- No-Origin native compatibility leaves same-user non-browser processes inside the local trust boundary; this is documented residual risk, while cross-site browser metadata is denied.
- Legacy missing-PID manifests lose dynamic routing compatibility; bounded fallback is safer than trusting an unowned port.
- Per-user source links improve write safety but full launchd upgrade/rollback behavior still needs a separately authorized installed-app proof layer.
- Taipei label correction may change historical display text around midnight without changing persisted facts; boundary tests make the intended behavior explicit.

## Open Questions

None. Exact origins, no-Origin compatibility, canonical manifest fields, valid port range, per-user file layout, failure order, test data and authority boundaries are resolved above.
