

https://github.com/user-attachments/assets/4fcc10dc-f8ba-4321-b7c2-2c061e7bdc28



# DevDiary
DevDiary 是一個 local-first 的 macOS 開發日記 App。它會整理你用 Claude Code、Codex CLI、Antigravity CLI 或自訂本機 AI agent 開發時留下的紀錄，幫你把每天做了什麼、每個專案目前卡在哪裡、用了多少 token、有哪些待辦，自動整理成可以回顧和交接的日記。

資料預設存在你的 Mac 本機，不需要把專案原始碼或私人紀錄上傳到雲端。

## 可以做什麼

- **自動整理開發日記**：掃描本機專案與 CLI coding agent 紀錄，整理每日重點、專案摘要和單日 diary。
- **看跨專案 Dashboard**：查看最近的 session、token 使用量、主要 agent、專案活躍度和每日 highlight。
- **追蹤單一專案狀態**：在 Workspace 看到專案摘要、daily diary、session、token detail、Git 狀態、comments、project docs 和 Kanban。
- **AI 重新總結**：可以指定預設 Diary Agent，讓 AI 依照專案或日期重新整理 Markdown 摘要；失敗時會保留 deterministic fallback，不會破壞手動內容。
- **Kanban 自動建議**：從 session、commit、TODO 訊號與 AI 建議中產生卡片；你手動移動過的卡片會被保護，不會被自動流程覆蓋狀態。
- **本機背景排程**：可設定每日時間自動跑 Daily Scheduler；macOS App 打包版也會安裝 LaunchAgent，讓 App 關閉時仍可定期掃描。
- **Codex Desktop 額度恢復續跑**：可在 `Settings > Automation` 用 deep link 註冊多個 Codex Desktop 任務；只有精確額度中斷且恢復時間已到時，背景 runner 才會按任務 UUID 送出固定的「繼續」。
- **匯出資料**：支援匯出每日 Markdown diary，以及 redacted JSON backup。匯出會盡量遮蔽 secret-like 內容。

## 下載 Mac App

如果 GitHub Releases 已上傳安裝檔，可以到這裡下載：

<https://github.com/ysjblog/dev-diary/releases>

請下載檔名類似下面的 macOS DMG：

```text
DevDiary_0.1.4_aarch64.dmg
```

下載後：

1. 打開 `.dmg` 檔。
2. 把 `DevDiary.app` 拖到 `Applications`。
3. 第一次開啟時，如果 macOS 顯示「無法驗證開發者」，到 `System Settings > Privacy & Security` 允許開啟，或在 Finder 對 `DevDiary.app` 按右鍵選 `Open`。

正式 release 使用完整的 ad-hoc bundle signing，但沒有 Apple `Developer ID` 或 notarization。從瀏覽器下載或透過 AirDrop 傳送後，請先拖到 Applications，再 Control-click `DevDiary` 選 **Open**，並在第二個提示按 **Open**；也可以先嘗試開啟一次，再到 System Settings → Privacy & Security 按 **Open Anyway**。這是 macOS 的未知開發者手動允許流程，不需要、也不應使用終端機移除 quarantine。

如果 macOS 顯示「app 已損毀」而不是未知開發者警告，請不要繞過它：確認使用的是最新 GitHub Release，並回報 DMG 版本與 macOS 版本。

## 第一次使用

1. 開啟 DevDiary。
2. 到 `Settings > Projects` 設定 `Project Roots`，也就是你放 side projects 的資料夾。
3. 到 `CLI Agents` 偵測本機可用的 agent，例如 Claude Code、Codex CLI、Antigravity CLI。
4. 選一個 `Default Diary Agent`，這會用在 Workspace 的 AI 重新總結、daily diary regenerate 和 Daily Scheduler。
5. 回到 Dashboard 或 Workspace，按 `Scan Now` 或單一專案的 rescan，讓 DevDiary 讀取最近的開發紀錄。

DevDiary 只會透過 Core API 讀取你設定的本機資料夾；不會直接從 React UI 讀檔，也不會對 project folder 執行 mutating command。

### Codex Desktop 額度恢復續跑

這是 DevDiary 內的 companion workflow，不會修改 Codex App，也不會在 Codex App 內新增 Resume 按鈕。使用方式：

1. 在 Codex Desktop 的目標任務複製 deep link，格式是 `codex://threads/<UUID>`。
2. 到 `Settings > Automation`，貼上 deep link，並把目前任務名稱填入「目前 Codex 任務名稱」；名稱只供清單顯示，真正定位使用 deep link 內的 UUID。
3. 按「註冊任務」。需要監看更多任務就重複貼上與註冊；清單可個別暫停、繼續監看、重新命名或註銷，也可用最上方開關暫停全部。
4. DevDiary 只在註冊後看到 Codex 的結構化額度用完事件、合法恢復時間已到，而且本機 session 仍唯一且完整時，透過本機 Codex CLI 的 `queue` 對該 UUID 排入固定「繼續」。其他中斷不會觸發。

恢復時間後先保留 60 秒緩衝；若 Codex 仍回報最近一小時內的已過恢復時間，收到新錯誤後等 5 分鐘重試，同一恢復週期最多三次。重開 DevDiary 或 Codex 換紀錄檔不會重設次數；達上限會要求人工檢查。經驗證的同任務新紀錄檔可接續監看，重疊、來源不完整或派送結果不明時仍停止。

「已送出續跑要求」只表示訊息已排入佇列，仍需 Codex Desktop 處理，不代表工作已開始或完成。收到精確 queue 回條後，背景程序會透過固定的 Codex app 識別與任務連結，自動開啟並切換到該任務。開啟失敗會要求人工檢查，不會重送；macOS 接受開啟連結也不等於任務已開始。暫停只阻止後續要求，不會取消已排入的訊息。背景程序若在派送中異常結束且無法確認子程序已停止，系統會保留全域鎖定並要求人工處理，不會在鎖定時間到期後直接重送。

正常可寫入且未達容量上限時，新的續跑要求另有本機診斷紀錄，保存在 `~/Library/Application Support/DevDiary/codex-resume-diagnostics/observations.json`：分開記錄送出結果、新執行紀錄是否出現，以及十分鐘觀察期限內未見開始或來源無法驗證。背景程序重啟後會接續未完成觀察；安裝前的要求不追補。「看到新執行」不代表已完成，也不能單憑時間關聯證明是哪個輸入啟動。逾時或來源異常會保存最多16個白名單程序的PID／狀態及有限Desktop日誌統計，不保存對話、任務名稱、原始日誌、來源路徑或命令列，不外傳、不重送。最多保留100筆、同時觀察32筆、檔案上限256KiB、僅擁有者可讀寫；每輪最多觀察兩筆，忙碌或重啟可能使快照晚於期限，仍只採信期限內的開始事件。超過觀察容量時會略過新增診斷並留下固定警告；診斷不可用時背景錯誤日誌會留下固定警告，續跑行為維持原樣。這項蒐證不能自行修復Codex內部停滯。

此功能會切換 Codex Desktop 畫面，但不使用 Accessibility、座標、剪貼簿或按鍵注入；視窗不必固定大小或位置。Mac 必須保持醒著且已登入可用桌面；不提供防休眠或自動解鎖。只接受目前使用者預設 `.codex` 的 canonical Desktop 資料目錄，其他 CLI store 會在送出前拒絕。Codex CLI 必須仍可在本機正常使用並維持登入；若 CLI/session 格式改變或執行結果不明，任務會顯示「需要人工檢查」且不會自動重播。

## 怎麼串 AI

DevDiary 目前支援兩類 AI 設定：

### 內建 CLI Agents

在 `CLI Agents` 頁面可以啟用或停用：

- Claude Code
- Codex CLI
- Antigravity CLI

每個 agent 可以設定：

- `Model`：例如 Claude、Codex 或 Antigravity 對應的模型名稱。
- `Reasoning`：例如 light、medium、high、extra_high 或 speed。
- 是否作為 `Default Diary Agent`。

DevDiary 不會要求你把 API key 填進 App；它使用你本機 CLI agent 既有的登入狀態與設定。

### Custom Agent / Ollama

如果你有本機模型服務，例如 Ollama，可以在 `CLI Agents` 新增 Custom Agent。新增時會先做 Core safe probe，確認 executable path 可用，通過後才會保存。

常見設定方式：

1. 在 `CLI Agents` 按 `新增 Agent`。
2. 輸入名稱，例如 `Local Ollama`。
3. 設定模型名稱，例如 `qwen3.6:27b`。
4. 設定 executable path 或 PATH command。
5. 先跑 probe，成功後保存。
6. 把它選為 `Default Diary Agent`。

Custom Agent probe 會使用安全的 `execFile` 流程，不會用 shell string，也不會在你的 project folder 裡執行。

## 可以調整的 AI Prompts

到 `Settings > Prompts` 可以修改 AI 產生內容時使用的 prompts：

- `Project diary prompt`：專案層級摘要。
- `Daily diary prompt`：單日專案日記。
- `Daily highlight prompt`：跨專案每日重點。

如果 prompt 留空，DevDiary 會回到內建預設值。Prompt 只會存在本機 settings。

## 匯出與備份

到 `Settings > Preferences` 可以匯出：

- `Markdown daily diary`：適合貼到 Notion、Obsidian、GitHub issue 或交接文件。
- `Redacted Backup JSON`：保留結構化資料，但避免直接輸出 raw SQLite DB。

也可以設定匯出時是否包含 comments。

## 本機開發

如果你想自己從原始碼啟動：

```bash
npm install
cd core && npm install && cd ..
```

啟動 React UI：

```bash
npm run dev
```

啟動 Core Engine：

```bash
cd core
npm start
```

Core 預設使用：

```text
~/Library/Application Support/DevDiary/DevDiary.sqlite
```

要掃描 project folders，請明確設定自己的 project roots：

```bash
cd core
DEVDIARY_PROJECT_ROOTS="/path/to/projects:/path/to/another-project" npm start
```

`npm start` 不會自動掃描任何私人目錄。

## 打包 Mac DMG

```bash
npm run package:mac
```

Tauri 會先完成 DMG 的所有 resources，再在 staging image 對完整 app 做一次 ad-hoc seal。GitHub Actions only builds and verifies the DMG; it does not publish release assets. 經明確授權的 maintainer 只會在所有本機與獨立驗證通過後建立新 GitHub Release；不需要 Apple certificate 或 notarization credentials。

成功後會產生：

```text
src-tauri/target/release/bundle/dmg/DevDiary_0.1.4_aarch64.dmg
```

這個 package 目前需要本機有 Homebrew `node@22`，因為 Core 會使用 bundled `core/node_modules` 裡的 native module。

## 驗證指令

```bash
npm test
npm run build

cd core
npm test
npm run typecheck
```

## 技術架構

- Desktop shell：Tauri
- UI：React + Vite
- Core Engine：Node.js / TypeScript
- Local API：loopback-only Express HTTP API
- Storage：SQLite，預設在 macOS app data folder
- Background：Core in-app scheduler + macOS per-user LaunchAgent

更多 current-state 細節請看：

- [`docs/specs/MASTER.md`](docs/specs/MASTER.md)
- [`docs/specs/dev-diary-macos-app.md`](docs/specs/dev-diary-macos-app.md)

背景服務使用 macOS `Standard` 資源分類，保留系統的輕量CPU／I/O限制，避免 `Background` 的較嚴格限制使掃描超過既有120秒截止。此調整不提供防休眠，也不改動Codex續跑判定。
