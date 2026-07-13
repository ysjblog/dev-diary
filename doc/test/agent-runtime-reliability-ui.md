# Agent Runtime Reliability And Source-Path UI Test Plan

## Test Depth Route

- Level: 3 — shared SQLite persistence、local CLI execution、background LaunchAgent、React stateful write workflow。
- Required: Core unit/integration + typecheck、UI tests/build、security review、localhost desktop/mobile RWD、packaged app smoke、black-box QA。
- 禁止：對使用者真實 project roots / logs / credentials / persistent DB 寫測試資料；CLI 僅用 fixed executable fixture。

## Test matrix

- [ ] **Claude diary adapter**：fixture 驗證 `-p`、model alias、timeout、`shell:false`、temporary cwd、safe env 無 token；project / daily 都回 `agent_id: 'claude-code'`；CLI fail / timeout 顯示 fallback reason。Claude selected 時 Kanban resolver 為 null，Antigravity / supported Ollama 原有 Kanban 行為不回歸。
- [ ] **Diary capability**：Settings snapshot 的 canonical capability stable；Codex persisted default migration 成 null 並有 unsupported reason；UI option disabled，Claude / Antigravity 與 enabled Ollama 可選。
- [ ] **Activity roots UI contract**：只有 `agents[].sources.activity_logs.mode` / `configured_data_roots` 進 PATCH；auto / auto_plus_custom / custom 三種 mode、trim/dedupe、空列、picker / remove / bottom add；`resolved_data_roots` / `derived_scan_locations` 只讀分組。
- [ ] **SQLite busy**：file-backed 兩 connection 都有 WAL / 5000ms busy timeout；`:memory:` 不要求 WAL。synthetic `SQLITE_BUSY` / `SQLITE_LOCKED` write error 回 `503 database_busy`，其他錯誤仍不被誤映射；新增/刪除沒有 client auto retry，comment count 不增加兩次。
- [ ] **Comment / Settings refresh**：project-scoped `{ text, tag }` round trip、malformed storage ignored、切換 project 各自保存；2xx 新增才清 key；503 / delete failure 保留 draft。background polling 和 manual reload 僅更新 snapshots，不重設 diary editor；dirty Settings input 經 60 秒 polling 不變，revision 改變只顯示 reload 提示。
- [ ] **Background status**：cycle 開始、scan success、scan failure、scheduler skip 都持久化精確 `background_scan` fields；`GET /api/settings` 可讀；last count 源自 scan result；5 minute setting 產生 300000 next interval。Projects Settings 顯示最後狀態與下次週期。
- [ ] **Startup contention**：LaunchAgent first-cycle delay 預設 45000ms、限制 0–120000ms；Core 能在 delay 內回 health/settings，下一輪仍使用 settings interval。
- [ ] **LaunchAgent migration**：暫存 fixture 只有同時具備非 current `.devdiary.background` Label、`devdiary-background-launcher.sh`、`run` argument、DevDiary logs marker 的 plist 可清除；任一條件缺失一律保留。bootout(plist path) → bootout(label) → remove only plist/symlink → `launchctl print gui/<uid>/<label>` not-found → install / bootstrap / kickstart current label，not-found idempotent；不影響無關 plist / symlink target。
- [ ] **RWD / black-box**：1440×900、390×844 長 root / 23 derived locations 無溢出；切 Claude 後 safe fixture 產生日記；simulate database_busy 友善提示；Settings scan status 在 refresh 更新；打包後 app 啟動、health、current background service、CLI source UI 和 comment draft smoke。

## Completion evidence

- Core targeted tests + full test suite、typecheck。
- UI targeted tests + build。
- Desktop/mobile screenshots（僅 /tmp，不進 repo）、packaged `.app` launch / health / background service smoke。
