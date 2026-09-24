---
openspec_level: o3
template_version: owner-workflow/v1
change: add-codex-desktop-auto-resume
reasons: external_write,workflow_state,data_migration
---
# Delta Spec: Codex Desktop 多任務額度恢復續跑

## 中文摘要

新增以 canonical deep link 註冊多個任務、精確解析 quota evidence，並以 exact UUID 呼叫 Codex CLI 接續固定「繼續」的本機自動化。

## Baseline

- Capability: `add-codex-desktop-auto-resume`
- New capability; no current Feature Spec.

## ADDED Requirements

### Requirement: Bounded background session verification
Foreground registration SHALL retain its 5-second scan deadline. Background monitoring and safe recovery SHALL use a 30-second scan deadline to tolerate slower LaunchAgent filesystem scans. A supplied scan budget MUST be a safe integer from 1 to 30,000 milliseconds. Synchronous I/O cannot be interrupted; deadline checks SHALL run at each visit, after scan completion and after full snapshot validation/hash/timezone resolution. When control returns, overdue results SHALL be rejected without claiming evidence or dispatching; all uniqueness, file identity, checkpoint and safe-recovery checks SHALL remain unchanged.

#### Scenario: Background verification completes beyond foreground budget
- **GIVEN** an enabled target needs attention only because session uniqueness could not be proved, and it has no claimed evidence, attempt or action phase
- **WHEN** a complete scan takes more than 5 seconds but less than 30 seconds and proves the exact registered locator and file identity
- **THEN** monitoring returns to watching without dispatching unless separate fresh quota evidence independently permits it

#### Scenario: Background scan remains incomplete
- **WHEN** a scan exceeds 30 seconds or encounters duplicate, symlink or identity ambiguity
- **THEN** the target remains stopped and no evidence is claimed or replayed

### Requirement: Deep link registration establishes one exact task identity

The system SHALL accept only canonical `codex://threads/<lowercase UUID>` links and a validated display label. It SHALL use the UUID, never the label, as identity. It SHALL accept one complete matching local session, or multiple timestamped sequential segments only when every match belongs to the same configured root and the same active/archive store, selecting the uniquely newest segment. It SHALL persist only a safe locator, file identity, registration EOF/prefix digest, timezone authority and target state. It MUST reject malformed links, cross-root or active/archive duplicates, ambiguous or incomplete segment timestamps, incomplete scans, symlink/identity drift, or zero matches without creating a target.

#### Scenario: Two tasks have the same display name

- **WHEN** two valid deep links contain different UUIDs but the same display name
- **THEN** both targets may be registered and are independently identified by UUID.

#### Scenario: The UUID exists in two roots

- **WHEN** complete lookup finds the same UUID in more than one session file
- **THEN** registration fails with zero target write.

#### Scenario: Codex rotates one thread into sequential active segments

- **WHEN** the same UUID appears in multiple files under one active session store and each has a distinct valid start timestamp
- **THEN** registration uses only the uniquely newest segment while cross-root, active/archive and timestamp ambiguity still fail closed.

### Requirement: Only post-registration quota exhaustion may trigger continuation

The runner SHALL consider only complete JSONL lines after the registration checkpoint that exactly identify an `event_msg` / `task_complete` error with `codex_error_info=usage_limit_exceeded`, the accepted fixed message prefix, one parseable reset clause and the registered timezone authority. It SHALL wait until reset time, ignore ordinary text and incomplete/old lines, and MUST re-prove cross-root uniqueness, file identity and prefix integrity before claim.

#### Scenario: A conversation merely mentions quota text

- **WHEN** a normal message contains “usage limit exceeded” but is not the exact structured error
- **THEN** the target remains watching and no command runs.

#### Scenario: Reset time has not arrived

- **WHEN** valid evidence has a future reset time
- **THEN** the target reports waiting with that time and sends nothing.

### Requirement: Continuation uses fixed exact UUID CLI dispatch

After valid evidence reaches reset time, the runner SHALL globally serialize one claim and execute only a verified regular Codex executable, preferring the Desktop bundled CLI, with shell:false, safe environment and exact arguments `queue --thread <UUID> --message 繼續`. The verified locator's canonical root SHALL be passed as `codexHome` and child CODEX_HOME; queue writes MUST target the same store whose session was verified. UUIDs MUST be canonical RFC 9562 v1-v8. Labels and quota messages MUST NOT enter argv. Success SHALL require exit code 0 without signal and exactly one newline-terminated receipt `Queued message <canonical UUID> for thread <exact target UUID>.` within 15 seconds and bounded stdout/stderr. The legacy internal state resumed SHALL indicate accepted continuation request only; UI SHALL display 已送出續跑要求 and SHALL NOT claim execution started or work completed. No private sockets, raw app-server, queue DB edits, GUI injection or exec-resume fallback are permitted. All outcomes after claim consume evidence; failed, uncertain, timed-out or crash outcomes SHALL require attention without automatic replay. Only sanitized allowlisted error codes may persist; raw diagnostics MUST remain bounded in memory. Timeout/overflow SHALL terminate the detached process group and release lease only after confirmed direct-child close and process-group absence (ESRCH on group signal-0 probe), otherwise quarantine it. Direct-child close alone MUST NOT establish process-group termination; an unproven live descendant keeps the lease quarantined. TERM then KILL and bounded polling SHALL apply even when the parent exits before descendants; EPERM and unknown probe errors are not absence proof. A valid receipt plus normal exit zero within the original deadline MAY be accepted after bounded descendant cleanup only if group absence is confirmed; otherwise quarantine. This does not turn a timeout, signal or nonzero exit into success.

#### Scenario: CLI durably queues the exact task
- **WHEN** the claimed target's store receives the fixed prompt and CLI exits 0 with one complete receipt naming exactly that UUID
- **THEN** the target records the accepted request, consumes evidence, and a second tick does not enqueue again; a queue receipt alone never proves a new turn began.

#### Scenario: Receipt cannot prove acceptance
- **WHEN** stdout has the wrong target, invalid message UUID, extra lines, missing newline or legacy turn.started JSON, or the process exits nonzero or by signal
- **THEN** the target requires attention with sanitized diagnostics and the consumed evidence is not replayed.

#### Scenario: Product queue root differs from Desktop store
- **WHEN** the verified session belongs to a canonical root different from the local Desktop store
- **THEN** the foreground-assisted product dispatcher rejects it before queue or open; alternate-store tests of the lower-level queue helper do not authorize production dispatch.

#### Scenario: Runner dies after claim

- **WHEN** the lease expires without a durable dispatch outcome
- **THEN** recovery atomically marks manual attention and lock_quarantine_required=1, consumes the evidence, preserves lease identity with maximum safe deadline and performs no dispatch for any target on this or later ticks/restarts. Runner restart or lease expiry MUST NOT release an unknown dispatch lease without process termination proof; otherwise the global lease remains quarantined. The current schema cannot prove old process-group identity across restart, so no automatic unlock is provided; manual release needs independently established termination proof. Pause, target mutation, a new queue success and elapsed time are not such proof.

#### Scenario: Timed-out process cannot be proven stopped

- **WHEN** the dispatcher cannot confirm that the detached process group closed after bounded termination attempts
- **THEN** the evidence is consumed, the target requires attention and the global lease remains quarantined so another target cannot dispatch.

### Requirement: Users can safely manage multiple targets

The dedicated API/UI SHALL list display name, enabled state, status, reset time and sanitized error; SHALL support global pause plus target register, pause/resume monitoring, rename and unregister; and SHALL reject mutation while an action lease is active. Removing a target MUST NOT remove or edit Codex session files. It SHALL disclose that window size and position do not determine identity, and that accepted queue requests automatically navigate Codex to the registered task without Accessibility or text injection.

#### Scenario: One target is paused

- **WHEN** the user pauses one of several registered targets
- **THEN** other enabled targets remain eligible and the paused target receives no dispatch.

#### Scenario: User explicitly resumes monitoring after a consumed transport failure
- **WHEN** an explicit enabled false-to-true patch targets only codex_resume_active_writer, codex_resume_queue_unsupported, codex_resume_session_not_found or codex_resume_auth_required with completed evidence and action high-watermark, no current evidence/cursor/attempt/action phase, lock_quarantine_required=0 and a clean global lease
- **THEN** only monitoring/error state may reset; consumed evidence and high-watermark MUST remain unchanged, next tick MUST revalidate session identity and old quota evidence MUST NOT replay; unknown outcome/quarantine/integrity failures remain stopped.

Legacy codex_resume_not_acknowledged is outcome-unknown and MUST NOT enter the generic monitoring-recovery allowlist. Generic command failures, invalid receipts, timeouts, output overflow, previous unknown outcomes and unterminated-process errors SHALL also remain stopped.

#### Scenario: A target is unregistered

- **WHEN** the user unregisters one target while no action is active
- **THEN** only its DevDiary row is removed and the Codex task remains intact.

### Requirement: Recovery timing and sequential segment repair
The system SHALL wait at least 60 seconds after a future reset, recognize a reset at most 60 minutes before the error timestamp, and delay retries by five minutes per fresh strict quota error. It SHALL allow at most three retries across recent-past reset values per recovery cycle and stop on the fourth recent-past error. Consumed and unknown dispatch evidence MUST NOT be replayed. The system SHALL follow a later same-store same-thread segment only with stable old and new identity/checkpoint proof, a start after registration, and a clean idle transactional checkpoint transfer. Retry budgets MUST survive segment changes and restarts; alternating stale resets MUST NOT replenish them. Only a strictly newer future reset may begin a new cycle. Transfer SHALL require the new start to exceed the consumed-event floor; equal or overlapping time fails closed. Earlier copied errors MUST NOT trigger continuation. Final claim SHALL atomically fence target enablement, safe state, quarantine, all claim fields, unchanged registration and consumed checkpoint and a completely idle global lease. Queue acceptance SHALL NOT imply Desktop execution.

#### Scenario: Server still reports quota at reset
- **WHEN** a fresh strict error reports a reset 35 seconds before its timestamp
- **THEN** the system waits five minutes and does not reinterpret that reset as tomorrow

#### Scenario: New runtime segment
- **WHEN** the same registered UUID gains a strictly newer verified segment after registration
- **THEN** the system monitors that segment without replaying old evidence or bypassing a quarantine

### Requirement: Accepted queue requests open the registered Desktop task
The foreground-assisted dispatcher SHALL validate the exact canonical UUID and require the verified queue store to equal the local Desktop canonical `.codex` store before enqueueing. After queue acceptance and process-group termination proof, it SHALL open only `codex://threads/<UUID>` through `/usr/bin/open -b com.openai.codex` once, without shell or background-opening flags. The entire queue and open sequence SHALL remain under one 45-second action lease. Open SHALL have a five-second deadline and bounded TERM/KILL cleanup with child-close and group-absence proof. Unknown process termination SHALL quarantine the lease. An open failure SHALL require attention and consume the evidence without any resend or reopen retry. Successful open SHALL NOT claim a turn started or completed. Existing accepted requests SHALL NOT replay on upgrade.

#### Scenario: Dormant registered task has a new due quota event
- **WHEN** the Desktop store matches, the exact queue receipt succeeds and its process group has stopped
- **THEN** the runner opens that same task's deep link once and preserves the accepted-request-only status semantics

#### Scenario: Navigation fails after queue acceptance
- **WHEN** opening fails, times out, or has an unproven process group
- **THEN** the target requires attention, the evidence is consumed, the unknown group remains quarantined, and future ticks do not resend or reopen

#### Scenario: A configured CLI store differs from Desktop
- **WHEN** the verified context root differs from the canonical local Desktop store
- **THEN** no queue or open command is executed and a sanitized store-mismatch error is returned

#### Scenario: Upgrade sees an earlier accepted request
- **WHEN** no new qualifying quota evidence exists
- **THEN** upgrade and restart do not reopen or resend the earlier request

## Impacted Readers and Writers

Readers: Settings UI, Core API, session lookup/parser, background runner. Writers: dedicated resume repository/API and fixed Codex CLI dispatcher. Codex logs are read-only; project files are unchanged.

## Compatibility and Migration

Contract v8 uses dedicated tables. Legacy single-target settings become disabled/empty and require explicit re-registration. Legacy register/stop routes return 410; general settings cannot mutate resume state.

## Verification Mapping

Core schema/contracts/repository/lookup/parser/engine/API tests; UI API and build tests; fake CLI runtime smoke; desktop screenshot; independent black-box/security review.

## Open Questions

None.

### Requirement: Vendor apostrophe variants preserve strict quota evidence
The quota parser SHALL accept only the official prefixes `You've hit your usage limit.` and `You’ve hit your usage limit.` with U+0027 or U+2019. It SHALL retain original-byte evidence digest and all existing event type, error enum, timestamp, unique reset clause, timezone and replay checks. Other apostrophe variants or embedded quoted text SHALL NOT qualify.

#### Scenario: Desktop emits a right-curly apostrophe
- **WHEN** a post-registration event_msg/task_complete/usage_limit_exceeded event uses You’ve and contains one valid due reset time
- **THEN** the engine consumes that original event once and may dispatch the registered target; subsequent ticks MUST NOT replay it.
