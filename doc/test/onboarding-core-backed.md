# Core-Backed Onboarding Test Plan

## Test Depth Route

- Level: 3
- Reason: First-launch onboarding changes a critical UI workflow, settings persistence, Core scan execution, and startup state.
- Required verification: UI helper/unit coverage where practical, browser smoke, RWD screenshots, build, full relevant tests.
- Allowed skips: native folder picker; v1 accepts typed path textarea.

## Bug Pattern Coverage

- [x] Input normalization / aliases / format variants
- [x] Boundary values / empty / null / malformed input
- [x] Rule priority conflicts
- [x] Negation / exclusion / opt-out / unlimited
- [x] Contract generated and execution applied
- [x] Operation order invariants
- [x] Production-like dirty data
- [x] Multi-condition combinations
- [x] Security bypass mixed with normal input
- [x] State/history/retry/refresh behavior
- [x] Externally observable result, not only implementation detail

## Runtime Verification Route

- Runtime smoke: REQUIRED
- Black-box QA: REQUIRED
- Safe environment or localhost command: localhost Vite + Core with temporary project root.
- Safe test account / mock access: not needed.
- Forbidden or destructive actions: no project folder writes, no direct UI filesystem access.

## [x] 【前端元素】fresh settings with no roots opens onboarding
**範例輸入**：Core settings returns `project_roots: []` and local onboarding complete flag is absent。
**期待輸出**：Onboarding overlay appears before ordinary Dashboard workflow。

## [x] 【整合流程】onboarding saves project roots and scans
**範例輸入**：typed project root path, click save/scan/complete。
**期待輸出**：Core `PATCH /api/settings` persists root, `POST /api/scan` runs, Dashboard appears after completion。

## [x] 【錯誤處理】empty roots cannot complete
**範例輸入**：blank project roots textarea。
**期待輸出**：UI shows a clear error and stays in setup。

## [x] 【RWD】onboarding overlay is usable on desktop/mobile
**範例輸入**：desktop and mobile viewport screenshots。
**期待輸出**：step controls and text do not overlap or clip。
