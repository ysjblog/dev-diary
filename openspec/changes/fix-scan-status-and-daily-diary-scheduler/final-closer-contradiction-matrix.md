# Final Closer Contradiction Matrix

This matrix records the trusted final full closer findings for the active Change. It is a Plan-Spec repair record, not implementation or runtime evidence.

| ID | Severity | Concern tags | Spec location before fix | Runtime evidence | Required resolution | verifyString |
|---|---|---|---|---|---|---|
| FFC-BR-001 | high | `readers-writers` | Delta `Scheduler and runtime lifecycle are fail-safe` | `core/src/services/dailyScheduler.ts:77`, `core/src/server.ts:69,430,702` | Name every default date reader that must use scheduler date `D`; keep explicit date input exact. | `Scheduler date `D` is resolved by the shared `Asia/Taipei` calendar-date helper` |
| FFC-BR-002 | medium | `readers-writers` | Delta `Date-scoped diary and AI draft recovery` | `core/src/services/exports.ts:111,122,253` | Make Daily Markdown export table-first with legacy fallback and include `project_daily_diaries` in the redacted backup. | `Daily Markdown export SHALL read `project_daily_diaries` first` |
| FFC-EO-001 | high | `execution-order` | Delta `Scheduler and runtime lifecycle are fail-safe`, scheduler-finalization scenario | `core/src/services/dailyScheduler.ts:326,327,350,352` | Specify rollback, a separate best-effort durable-failure write, and the response when that write cannot persist. | `failure_state_not_persisted` |
| FFC-LAD-001 | high | `design-contract` | Design scan lifecycle | `core/src/server.ts:469,474`, `core/src/backgroundRunner.ts:89,109` | Define heartbeat cadence, deadline extension, and recovery rule so a running long scan is not reclaimed. | `heartbeat_at` at least every 30 seconds |
| FFC-LAD-002 | medium | `execution-order` | Delta `Scheduler and runtime lifecycle are fail-safe` | `core/src/services/dailyScheduler.ts:273,276`, `core/test/dailyScheduler.test.ts:77` | Limit only ordinary scheduled ticks to once per local day; explicitly allow a forced same-day rerun after no valid lease exists. | `Ordinary scheduled ticks` |

## Resolution boundary

- Each row must land in Proposal, Delta Spec, Design, Tasks, Contract Matrix, and the fresh author-fix receipt as applicable.
- `converged` remains `false`; this final closer cannot be repeated in this Plan-Spec responsibility.
