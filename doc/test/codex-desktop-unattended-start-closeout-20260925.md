# Codex Desktop unattended start — 6.4 closeout (2026-09-25)

## Scope

Task 6.4 of `add-codex-desktop-auto-resume`: controlled registered-target wake with actual start evidence, packaging, and precise installed/runtime limits. The maintainer accepted closing 6.4 on the real observations below with the limits stated, instead of waiting for further live quota events.

## Real observations (installed app, no manual send)

| Local time (Asia/Taipei) | Trigger | Queue result | Task start | Source |
|---|---|---|---|---|
| 2026-09-21 12:28:45 | installed background runner after quota reset | accepted | turn began 12:28:53 (8 s) | `codex-recovery-verification-report.md` |
| 2026-09-22 16:42:17 | installed background runner after quota reset | accepted, Desktop switched and requested resume | Desktop completed `thread/resume` at 2026-09-23 00:33:08 (about 7 h 51 min later) | `codex-desktop-wake-delayed-start-evidence.json`, `codex-desktop-request-delay-summary.json` |
| 2026-09-23 17:22:05 | installed background runner, display off 14:30–17:36 | accepted | new turn observed 17:22:14 (9 s), completed later | `codex-resume-status-20260924.json` |

Additional controlled evidence: the 2026-09-22 source dispatcher live test (`codex-desktop-wake-live-result.json`) moved a `notLoaded` task to `inProgress`; it is not an installed-scheduler trigger.

## Installed package

The v0.1.4 DMG (`DevDiary_0.1.4_aarch64.dmg`, SHA-256 `529a0ccee0696a6b078a2558c0e0bec9396a2c438acac113d4f858db722eca29`) is installed; bundle `core/src` is identical to the repository; both registered targets were `watching` / `waiting_for_reset` with no error code after install.

## Precise limits

- Two of three installed live triggers started within 10 seconds; one started only after Codex Desktop's own resume completed about 8 hours later. During that window Desktop kept rejecting queued work on its side, which DevDiary cannot observe or repair.
- "已送出續跑要求" means the message was queued; it does not guarantee a start time.
- The Mac must stay awake and logged in to a usable desktop; display-off with the session still running worked once. DevDiary provides no wake-from-sleep or auto-unlock.
- Three live events are not a statistical reliability guarantee. The diagnostics file (`codex-resume-diagnostics/observations.json`) keeps recording `new_turn_observed` or timeout for later requests.

## Result

6.4: PASS with the limits above (not a claim of guaranteed unattended start).
