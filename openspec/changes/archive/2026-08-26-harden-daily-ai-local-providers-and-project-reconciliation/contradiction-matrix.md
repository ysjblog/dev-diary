# Root-cause contradiction matrix

Final closer verdict: REJECT. Root-cause continuation is active; implementation and installation remain gated until its fresh bounded verification passes.

| Finding | Root cause | Missing authority / contract | Required continuation |
|---|---|---|---|
| `FINAL-EVIDENCE-001` | Initial review findings were reduced to ids after the fix and the regenerated matrix no longer proves the pre-fix landing. | Durable receipt needs the complete initial finding payload, pre-fix artifact digest, per-id fix location and landed string. | Addressed in `root-cause-continuation.md`; pending fresh verification. |
| `FINAL-RECOVERY-001` | The scheduler design named the fence but did not inventory the provider-await/write intermediary functions. | `projectWrites.ts`, `kanbanAiSuggestions.ts` and generator interfaces need signal/fence/telemetry contracts and matrix coverage. | Addressed in Design/Delta/Tasks; pending expanded matrix and fresh verification. |
| `FINAL-COMPAT-001` | New response fields/capabilities were designed without a Core API contract-version handshake. | Core health manifest, UI minimum version and named capabilities need coordinated upgrade and mismatch tests. | Addressed with version 6 and named capabilities; pending fresh verification. |
| `FINAL-TELEMETRY-001` | Counters mixed per-output, per-card and per-invocation units. | Each family needs a typed unit and separate invariant denominator. | Addressed with typed units/equations; pending fresh verification. |
| `FINAL-ROLLOUT-001` | Installation backup was specified but candidate provenance was not revision-bound. | A candidate identity receipt must bind source/dirty state, version, App/DMG and DB snapshot digests before replacement. | Addressed by commit-before-package identity receipt and drift invalidation; pending fresh verification. |

No third full reviewer was launched in the rejected O3 run. This user-authorized fresh root-cause continuation repairs the authority/contracts and may use one bounded fresh reviewer only after all landed-string, strict, preflight and matrix checks pass.

Continuation review 1 resolved API compatibility and rollout but found three remaining bounded gaps. The final targeted repair adds the digest-valid eight-finding landing receipt, complete Kanban/runner abort propagation, and an explicit `failed` telemetry outcome. A final bounded landing verification is required before implementation.
