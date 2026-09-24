# QA Black-Box Report

- Environment: macOS arm64, Node 22.23.1, Codex CLI 0.153.4; temporary stores only.
- Revision: cbd02a4f70eec01fc98b00dfce4cde68826313e8b2edd361d1e9de6cab9eabb6; HEAD 6d55c34224518e1fdfc4748851808ee77acc2ae8 (dirty candidate hashes separately verified).
- Timestamp: 2026-09-20
- Public entry: createCodexCliResumeDispatcher; localhost 5173 with memory-only Core 4399.
- Test depth: 4
- Owner / QA Worker: /root / /root/queue_runtime_qa
- Independence: no-fork Worker, public behavior; no implementation diff.
- Bounded lens: real CLI queue and adverse subprocess outcomes; desktop text.
- Result: BLOCKED (independent browser gate only; no product failure found).

## Scenarios
- PASS: independent actual bundled CLI queue, isolated store, one queued row, no auth file, no real task message.
- PASS: 10/10 independent subprocess cases, fixed argv/store, malformed receipt, nonzero/signal/timeout rejection, descendant cleanup and unknown group quarantine.
- PASS: Owner runtime UI screenshot, independent screenshot review; text distinguishes accepted request from execution/completion and pause from cancellation.
- BLOCKED: independent live browser, console/network inspection; browser navigation and existing-tab read were denied by Worker safety hook as external_write. No workaround or permission changes attempted.
- PASS: packaged runtime public dispatcher isolated CLI smoke, 1 queued row; 3 runtime modules match source hashes.
- NOT RUN: replacing installed app, repairing live registration and real automatic dispatch, pending required independent browser gate.

## Evidence
- codex-resume-queue-independent-results.json (10 scenario counts mechanically verified).
- .codex/screenshots/queue-resume-20260920.png (1280x720, Owner CUA actual isolated UI).
- /tmp/devdiary-queue-final-core.log: 376 tests passed; /tmp/devdiary-queue-final-ui.log: 82 passed.
- /tmp/devdiary-queue-final-type.log and /tmp/devdiary-queue-final-build.log passed.
- /tmp/devdiary-queue-runtime-smoke-result.json and /tmp/devdiary-queue-packaged-smoke-result.json passed.
- Package SHA256: 736e5f592513dea07c95829f8e0c4a73cc80d846b2e395dc6bdb20ca2b831115.

## Findings
P1 evidence gap: required independent live browser access denied. No product patch indicated; must obtain permitted independent UI evidence before full completion. Existing registration remains needs_attention; no live state was changed.

## Residual Risk
No fresh installed-app or automatic real-target proof. Queue acceptance is not work completion. Unknown outcomes stay quarantined and consumed events never replay. Existing dirty feature scope is inseparable, so no commit/push/merge.

## SECURITY REVIEW RESULT
Surface: verified session → fixed public queue argv, bounded diagnostics → allowlisted enums, parameterized SQLite recovery.
Protected asset: exact target/store identity, no duplicate request, no private diagnostic disclosure.
Controls: canonical UUID/root, shell:false, exact receipt+exit+deadline, group ESRCH, consumed cursor, known-only manual recovery.
Validation: 376 Core tests plus independent 10/10 public process cases; source-to-sink review and no new raw diagnostic/credential logging.
Residual: same-user malicious executable/config is outside boundary; no automatic quarantine unlock without termination proof.

## VERIFICATION REPORT
Revision: cbd02a4f70eec01fc98b00dfce4cde68826313e8b2edd361d1e9de6cab9eabb6
Target: source and packaged macOS arm64 runtime, isolated fixtures
TestDepth: PASS for automated coverage; complete gate blocked below
Build: PASS (Vite and Tauri release/DMG)
Types: PASS
Lint: SKIPPED (no configured lint script); diff whitespace check PASS
Security: PASS (bounded changed-surface review and adversarial probes)
Smoke: PASS (source and packaged dispatcher, actual bundled CLI, isolated DB)
BlackBoxQA: BLOCKED (CLI PASS, independent screenshot PASS; independent browser denied)
Diff: REVIEWED (unrelated dirty WIP retained; no commit)
Overall: NOT READY for complete installed workflow

Owner browser console at final read: no error/warn entries; this is Owner evidence only.
