# Final closer root-cause rollover 8

## Findings

- `SOL-GATE-001`: the prior Author Preflight receipt was stale after active Change task updates.
- `SOL-EVID-002`: the QA's tracked-diff hash did not include untracked executable `core/src/services/taipeiDate.ts`.

## Bounded repair

- Regenerate and require the current Author Preflight receipt after active Change files stop changing.
- Add an executable candidate manifest with hashes for every changed source and regression test, including the untracked Taipei date helper, and bind the QA report to that manifest digest.

## Verification strings

- `--require-receipt`
- `3cd2f14d116e67dacc168a46c824cf828d5490421cbe8f2eb95367615fd0e6ba`
- `core/src/services/taipeiDate.ts`

## Scope boundary

Desktop-only; the repair only refreshes evidence and receipts. No mobile/RWD validation or user-data write is introduced.
