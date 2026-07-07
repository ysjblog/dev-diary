# Dashboard Visual Polish Follow-up

## Test Depth Route

- Level: 3
- Reason: Dashboard API contract, React chart rendering, range state, and rendered UI all change.
- Required verification: Core dashboard tests, root API/client tests, root build, Core typecheck, desktop/mobile localhost smoke with screenshots.
- Allowed skips: no security review because this does not touch auth, permissions, secrets, shell commands, or persistence writes.

## Bug Pattern Coverage

- [x] Boundary values / empty / null / malformed input: empty selected Dashboard range keeps metrics empty without blanking the independent heatmap.
- [x] Contract generated and execution applied: Core returns a range-independent heatmap and the UI renders it through the Dashboard snapshot.
- [x] Operation order invariants: selected range still drives metric, trend, donut, and project concentration before heatmap rendering.
- [x] Production-like dirty data: missing legacy `project_concentration` field does not make the all-time project ranking panel blank.
- [x] Multi-condition combinations: all-time, 1m, and custom ranges keep heatmap stable while other charts update.
- [x] State/history/retry/refresh behavior: changing Dashboard range and reloading the page preserves a visible heatmap and ranking.
- [x] Externally observable result, not only implementation detail: browser smoke verifies desktop and mobile rendered panels.

## Runtime Verification Route

- Runtime smoke: REQUIRED
- Black-box QA: REQUIRED
- Safe environment or localhost command: `npm run dev` plus Core on `127.0.0.1:4317`
- Safe test account / mock access: local deterministic or existing local app data only
- Forbidden or destructive actions: do not write user project folders, do not run mutating Git commands, do not expose secrets

## [x] 【function 邏輯】heatmap 不跟 Dashboard selected range 連動
**範例輸入**：同一個 seeded DB，分別讀 `range=all`、`range=1m`、future custom empty range。
**期待輸出**：三者 `heatmap` 相同；metric / mix 仍依 selected range 改變。

## [x] 【function 邏輯】project concentration legacy fallback 不讓 all-time ranking 空白
**範例輸入**：Dashboard snapshot 缺少 `project_concentration`，但 `/api/projects` list 有 all-time `token_total`。
**期待輸出**：all-time Dashboard 仍顯示前五名 project token share。

## [x] 【前端元素】Agent Token donut 接縫穩定
**範例輸入**：兩段與多段 agent mix，包含 Codex 綠色與 Claude 紫色相鄰。
**期待輸出**：donut 分段沒有紫綠接縫異常、重疊尖角或多餘缺口。

## [x] 【前端元素】Trend axis 與 neon area fill 可讀
**範例輸入**：累積總計趨勢圖。
**期待輸出**：座標軸數字比前版更小；曲線下方同色 glow/area fill 更明顯但不蓋住線條。

## [x] 【前端元素】heatmap 色彩語意一致且標題較短
**範例輸入**：最新 26 週 heatmap 含不同 dominant agents。
**期待輸出**：格子只用藍色深淺表示 activity intensity，不再出現紫色與 legend 語意衝突；標題改為較短的「AI 活躍熱力圖」。

## [x] 【RWD】Dashboard 桌面與手機 smoke
**範例輸入**：localhost Dashboard desktop viewport 與 mobile viewport。
**期待輸出**：project ranking、trend chart、donut、heatmap 都可見，沒有重疊、空白 panel、framework overlay 或 console error。
