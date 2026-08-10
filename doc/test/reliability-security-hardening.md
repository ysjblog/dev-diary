# DevDiary reliability and local-runtime security hardening test plan

## Test Depth Route

- Level: 4
- Reason: core local-API authorization plus cross-module calendar, runtime identity, generated-file-path, persistence, SQL, UI, and macOS lifecycle contracts.
- Required verification: test-first regression matrix, Core/UI/Rust full suites, integration execution checks, safe localhost Owner smoke, independent black-box QA, security review, strict OpenSpec, build/type/diff.
- Allowed skips: no private runtime DB, real provider execution, real LaunchAgent bootstrap, app installation, notarization, merge, push, or deploy.

## Bug Pattern Coverage

- [x] Input normalization / trusted and untrusted Origin format variants
- [x] Boundary values / Taipei midnight, empty/missing/zero/dead PID
- [x] Rule priority conflicts / trusted Origin versus mutation method
- [x] Negation / absent Origin remains a deliberate local-caller path
- [x] Contract generated and execution applied / date projection reaches every downstream query
- [x] Operation order invariants / authorize before JSON parsing, provider call, or DB mutation
- [x] Production-like dirty data / legacy runtime manifest without PID
- [x] Multi-condition combinations / Origin + preflight/method/content type
- [x] Security bypass mixed with normal input / simple form POST and opaque `null` Origin
- [x] State/history/retry/refresh behavior / stale manifest fallback and scheduler idempotency
- [x] Externally observable result, not only implementation detail / safe local API and desktop UI

## Runtime Verification Route

- Runtime smoke: REQUIRED
- Black-box QA: REQUIRED
- Safe environment or localhost command: `candidate_revision="$(bash scripts/verification-candidate-digest.sh)"`; `evidence_dir="/tmp/devdiary-reliability-security-hardening/$candidate_revision"`; `node scripts/smoke-local-runtime.mjs --revision "$candidate_revision" --output "$evidence_dir/smoke.json"`; Vite uses exact worktree origin `http://localhost:5180` at 1280x820, or exact `http://localhost:5181` only when 5180 is already owned by an unrelated process and that conflict is recorded in the host receipt. Automated policy tests continue to cover exact 5180 origins. Evidence is external and revision-scoped so proof generation cannot alter the candidate or dirty the final commit.
- Safe test account / mock access: no account; in-memory seeded fixtures and provider spies only.
- Forbidden or destructive actions: real runtime SQLite writes, real AI providers, actual LaunchAgent install/remove, packaged app installation, external writes, merge, push, deploy.

## [x] 【資料邊界】UTC 16:00 前後正確跨入 Asia/Taipei 日期
**範例輸入**：`2026-06-30T15:59:59Z`, `2026-06-30T16:00:00Z`, `2026-06-30T17:30:00Z`。
**期待輸出**：日期依序為 `2026-06-30`, `2026-07-01`, `2026-07-01`；Dashboard、Workspace、scheduler、export 與 token aggregate 一致。

## [x] 【整合流程】日期 helper 的產物實際被所有 session 查詢採用
**範例輸入**：同一專案跨 UTC/Taipei 日界線的多個 sessions，請求單日與 24h snapshot。
**期待輸出**：session count、token total、heatmap、trend、daily diary material 與 export session list 對同一台北日完全一致。

## [x] 【狀態回歸】掃描後 token_usage 與 session 的台北日期不分歧
**範例輸入**：掃描插入 `2026-06-30T17:30:00Z` session，之後重掃帶來 token delta。
**期待輸出**：新增與 delta 都落在 `2026-07-01`，不重複、不留新的 UTC 錯日 aggregate。

## [x] 【前端元素】每日 Markdown 匯出預設為 Asia/Taipei 今日
**範例輸入**：瀏覽器時鐘在台北 01:30、UTC 前一天 17:30。
**期待輸出**：UI 請求日期與 Core default 均為台北當日，匯出檔名一致。

## [x] 【驗證權限】不受信 Origin 在任何 mutation 前被拒絕
**範例輸入**：`Origin: https://attacker.example` 對 simple POST scheduler/scan 與 JSON PATCH settings。
**期待輸出**：HTTP 403、安全錯誤 envelope、provider/DB/downstream spy 呼叫數為 0。

## [x] 【安全繞過】opaque 與偽裝 localhost Origin 不可繞過
**範例輸入**：`Origin: null`, `http://localhost.attacker.example`, `http://127.0.0.1:9999`。
**期待輸出**：全部 403，沒有 CORS allow header，也沒有副作用。

## [x] 【授權矩陣】hostile Origin 的 GET 與 OPTIONS 都在 dispatch 前被拒絕
**範例輸入**：`Origin: https://attacker.example` 對 `/api/health` GET 與任意 path OPTIONS；對照精確 trusted Origin OPTIONS。
**期待輸出**：hostile GET/OPTIONS 都回 `forbidden_origin` 403、無 allow-origin、middleware `next` 為 0；trusted OPTIONS 回 204、精確 allow-origin，且 parser/route 不執行。

## [x] 【驗證權限】可信桌面／開發 Origin 與 no-Origin 本機工具維持可用
**範例輸入**：`tauri://localhost`, default dev `http://localhost:5173` / `http://127.0.0.1:5173`, explicit worktree `http://localhost:5180` / `http://127.0.0.1:5180`，以及缺 Origin 的本機請求。
**期待輸出**：既有 health/preflight/mutation contract 成功；CORS header 只回給精確可信 Origin。worktree origins 只在安全驗證過的顯式設定存在，其他 localhost port 仍被拒絕。

## [x] 【安全繞過】跨站 Fetch Metadata 在缺 Origin 時仍被拒絕
**範例輸入**：缺 Origin 但帶 `Sec-Fetch-Site: cross-site` 的 GET 與 POST；對照沒有 browser fetch metadata 的 native/CLI request。
**期待輸出**：cross-site request 403 且零副作用；native/CLI request 維持可用。

## [x] 【相容性】no-Origin CLI 的 GET、mutation 與 OPTIONS 保持可用
**範例輸入**：沒有 Origin、也沒有 `Sec-Fetch-Site: cross-site` 的 health GET、合法 settings mutation 與 OPTIONS。
**期待輸出**：GET/mutation 遵循既有 contract，OPTIONS 為 204，三者皆不回 allow-origin；對照 cross-site 全部在 next/route 前拒絕。

## [x] 【錯誤處理】錯誤 Origin 必須在 body/parser 及 route 前終止
**範例輸入**：不受信 Origin 加 malformed JSON 或可觸發 provider 的 endpoint。
**期待輸出**：仍回安全 403，而非 JSON parse error；provider 與 route handler 未執行。

## [x] 【可觀測性】next、parser、provider 與 DB effect 各自有獨立證據
**範例輸入**：純 middleware mocked `next`、hostile malformed JSON、注入 scan provider spy，以及 app-owned table 的 before/after query；另以表格送出 21 條 mutation route。
**期待輸出**：hostile middleware `next=0`、malformed JSON 仍 403、provider calls=0、DB before=after，且 21 條 route 全部被同一 guard 拒絕；不只以單一 403 推論零副作用。

## [x] 【設定邊界】additional Origin 先 trim transport whitespace，再全有或全無驗證
**範例輸入**：空 token、重複 additional、與 built-in 衝突、trailing slash/path/query/fragment、credentials、wildcard、非 loopback、無/超界 port，以及精確 5180 origins。
**期待輸出**：任何無效或碰撞使 server construction 整體失敗且不反射原值；只有兩個精確 5180 origins 被加入，沒有部分接受或 wildcard。

## [x] 【資料邊界】runtime manifest PID 需為正整數且仍存活
**範例輸入**：live、dead、missing、zero、negative、string PID，以及 JSON `4322.0`／`4.322e3` 這類解析後為整數的 numeric port/PID。
**期待輸出**：只有 positive live mathematically-integral numeric value 可被 JS/Rust resolver 信任，且兩端對 JSON numeric encoding 得到相同結果；其餘走固定埠 fallback。

## [x] 【錯誤處理】malformed/wrong-service/non-loopback/mismatched manifest 持續 fail safe
**範例輸入**：破損 JSON、錯誤 service、外部 host、無效或超界 port、runtime 與 top-level URL 不同埠，以及 fallback 的 transport whitespace、`+4400`、leading zero、空字串與邊界。
**期待輸出**：JS/Rust 都不信任 manifest、不洩漏內容、不連外；fallback 兩端都先 trim、只接受 ASCII decimal digits 與 `1..65535`（leading zero 可正規化），sign／fraction／超界一律固定回 4317。

## [x] 【function 邏輯】packaged LaunchAgent 支援檔固定在使用者 Application Support
**範例輸入**：`/Applications/DevDiary.app/Contents/Resources/core` 與 development core path。
**期待輸出**：兩者皆使用 `<app_data>/LaunchAgents` 與同一個 per-user registration link；新內容先寫入獨立 candidate 並 lint，失敗時既有 live source byte-for-byte 不變且 candidate 被清除，成功後才原子替換 stable source；registration 失敗只清理由本次嘗試建立且仍指向精確 source 的 link；測試不寫真實 HOME 或啟動 launchctl。

## [x] 【資料呈現】完整 export ISO timestamp 保持 UTC audit fact
**範例輸入**：台北日期 `2026-07-01` 選中 `2026-06-30T17:30:00Z` session 並輸出 Daily Markdown。
**期待輸出**：session 被歸入 7/1，但完整 timestamp 原樣保留 `Z`；它不被拿來當日期 label 或分組 key。

## [x] 【整合流程】安全 localhost Core smoke 驗證 allow/deny 與日期結果
**範例輸入**：動態 loopback port、`:memory:` DB、mock provider、可信與不可信 Origin、跨午夜 fixture。
**期待輸出**：可信路徑正常，不可信路徑零副作用，日期 snapshot/匯出一致；revision-scoped external `smoke.json` 記錄候選 digest／最終 commit SHA、每個 scenario、HTTP 結果、downstream call counts 與 PASS，腳本失敗時非零退出。

## [ ] 【前端元素】desktop-only UI 在 1280x820 無破版且匯出互動仍可用
**範例輸入**：Vite worktree runtime、支援的桌面 viewport。
**期待輸出**：頁面載入、Settings export control 可操作、無重疊或 mobile-only 假要求，保存新鮮截圖。

## [ ] 【證據綁定】runtime、UI、QA 與 security closer 使用同一 revision
**範例輸入**：未提交 candidate digest，及提交後 final `HEAD` SHA。
**期待輸出**：同一外部 revision 目錄中的 smoke JSON、UI manifest/host receipt、QA report、security receipt 的 revision 與 artifact SHA-256 完全一致；commit 後改用 final `HEAD` 目錄全部重新執行，不沿用 candidate evidence，也不寫回版本庫造成新的 commit 循環。

## [x] 【工具契約】revision digest 與 runtime smoke 腳本可重現且可自我驗證
**範例輸入**：臨時 Git repository 的 tracked diff／non-ignored untracked file／ignored evidence file，以及 in-memory runtime 的成功與刻意失敗 scenario。
**期待輸出**：delivery input 改變時 digest 必變、ignored 或外部 evidence 不影響 digest；smoke 必須自行重算工作樹 candidate digest，或在 clean worktree 核對 final HEAD，傳入任意／stale revision 時不得建立證據；參數錯誤或 scenario mismatch 非零退出，server/DB 無論成敗均關閉。

## [ ] 【安全審查】最終 diff 通過 security 與 authorization lenses
**範例輸入**：最終候選 diff、OpenSpec contract、測試與 runtime evidence。
**期待輸出**：無未解決高風險 finding；殘餘 no-Origin/host/packaged-install 限制明確記錄。
