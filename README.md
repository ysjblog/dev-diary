

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
- **匯出資料**：支援匯出每日 Markdown diary，以及 redacted JSON backup。匯出會盡量遮蔽 secret-like 內容。

## 下載 Mac App

如果 GitHub Releases 已上傳安裝檔，可以到這裡下載：

<https://github.com/ysjblog/dev-diary/releases>

請下載檔名類似下面的 macOS DMG：

```text
DevDiary_0.1.3_aarch64.dmg
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
src-tauri/target/release/bundle/dmg/DevDiary_0.1.3_aarch64.dmg
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
