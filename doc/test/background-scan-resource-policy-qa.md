# QA Black-Box Report

- Environment: macOS; temporary copied shell script, mocked launchctl, extracted unchanged Rust generator compiled by rustc.
- Revision / HEAD SHA: 6d55c34224518e1fdfc4748851808ee77acc2ae8; dirty workspace; bounded source hashes below are the evidence identity.
- Timestamp: 2026-09-24T02:38:13.010259+00:00
- Target / public entry: copied shell install command; real generator function output.
- Test depth: independent QA required by Level 4 route; this report covers packet acceptance only.
- Owner / QA Worker identity: /root / /root/policy_qa
- Independence method: separately executed fixtures and assertions; no owner runtime evidence reused.
- Bounded lens: generator wiring, exact output identity, deadline preservation, shell security delta.
- Result: PASS

## Scenarios
- [PASS] Copied shell installer ran with unchanged HOME and only copied-script HOME path literals redirected under /tmp/devdiary-policy-qa-hg78h_d_. Mock launchctl logged exactly 4 expected argv sequences: bootout, bootstrap, enable, kickstart. No real launchctl called; launcher stub was not executed.
- [PASS] Parsed actual shell plist; all 8 keys exactly matched expected service identity, program arguments, Standard enum, RunAtLoad, KeepAlive, working directory and log paths. File permission 0600 and registration symlink target verified.
- [PASS] Compiled exact production Rust generator and exact added regression test in /tmp; regression 1 passed, 0 failed. Compiled generator output parsed with plistlib and all fields matched expected values.
- [PASS] Copied existing JS regression with only source path/temp prefix rebased: 1 passed, 0 failed, 0 skipped. Assertions unchanged.
- [PASS] Independently compared both generator templates against HEAD: only Background -> Standard changed. Deadline module byte-identical to HEAD, default 120000ms; live background call supplies no timeout override.
- [PASS] Post-test diff check; generator and shell copied sources still equal current scope; hashes computed after tests.

## Evidence
- Commands: /bin/bash -n copied-script; /bin/bash copied-script install; rustc --test generator.rs; generator-test; rustc generator.rs; generator; node --test --test-reporter=tap regression.mjs; git diff --check scoped files; Python plistlib/assert/hashlib verification.
- Artifacts: /tmp/devdiary-policy-qa-hg78h_d_/summary.json, calls.jsonl, rust.plist, rust-test.log, node-test.log, generator.rs, regression.mjs.
- UI screenshots: not applicable; no UI changes in packet.
- Network/API: none; no production data accessed or mutated.
- Instrumentation note: first result summarizer expected TAP while Node emitted spec reporter; both tests had passed. Reran explicit TAP and recomputed counts with Python. This was an evidence parser issue, not a product failure.

## Security review
Protected asset: user service registration and existing launch behavior. Boundary: locally generated shell/plist into launchd. Input delta: fixed enum only. Sink: existing plist registration path. Controls verified: exact argv, 0600, symlink, same label/args and no timeout override. No newly introduced dynamic input or shell interpolation. Existing XML path escaping design is outside this fixed-enum change. No reportable new finding.

## Findings
No blocking findings within accepted scope. Rust regression alone is substring-based; independent runtime plist parsing here supplies the stricter acceptance evidence.

## Residual Risk
No fresh real launchd scan performed by QA; Owner's required runtime, full Rust suite, build/package and installed-service verification remain separate gates. Standard can use more CPU/I/O than Background. Successful generated settings do not prove production scan or diary completion. Existing unrelated WIP is not reviewed or authorized by this PASS. No repository source modifications or commits.

## Source SHA-256
- `scripts/devdiary-background-agent.sh`: `e82b793625201e27f3a999b037cbd4a4ff05a73aa99978de418f1b808820f2ae`
- `src-tauri/src/lib.rs`: `f2a7e915707fa090827a35a1c1e638ed95c7e3b31c2d76c48c803ca210245b35`
- `src/api/backgroundResourcePolicy.test.js`: `13e3fa7f3270263f0923391e0b821eda8bc698d0766e962ea9081dfd59cffa77`
- `core/src/services/manualScanIsolation.ts`: `8002aa3e8326384be0fc84ba045bdb446c8cdbf4594671e5404bfa6251123e22`
- `core/src/services/backgroundRunner.ts`: `5283bb0e42d3f5a233cc5b15efe02f70eb199d63238b0f7578d04ceab80c6b9d`
