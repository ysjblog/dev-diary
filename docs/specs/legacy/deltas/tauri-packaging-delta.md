# Delta Spec: Tauri Shell and Unsigned macOS Packaging

> PR: feature/core-engine
> Date: 2026-07-01
> Status: implemented

## 背景 / 問題

DevDiary 目前只有 React/Vite UI 與 Node/TypeScript Core runtime；`docs/specs/dev-diary-macos-app.md` 要求 v1 desktop shell 使用 Tauri，並可 build unsigned `.app` / `.dmg`。目前 repo 尚無 `src-tauri/`、Tauri config、打包 script 或 packaged runtime lifecycle。

## 新增（Added）

- Tauri macOS shell scaffold：
  - `src-tauri/` Rust project。
  - Tauri config 指向 Vite dev URL 與 production `dist/`。
  - macOS bundle metadata（app name、identifier、icons placeholder 或 generated icon）。
- Package scripts：
  - `npm run tauri:dev`
  - `npm run package:mac`
  - `npm run package:mac:debug`（如工具鏈支援）
  - DMG packaging 使用 macOS `hdiutil create` fallback，避免 Tauri create-dmg script 在本機 Finder/DMG 美化流程卡住。
- Packaged Core lifecycle strategy：
  - v1 local unsigned package 會從 Tauri setup 啟動 bundled Core source + bundled `core/node_modules`。
  - Core 仍只綁定 loopback `127.0.0.1`；Tauri runtime 的 UI API helper 會指向 `http://127.0.0.1:4317/api/*`。
  - v1 需要本機安裝 Homebrew `node@22`（`/opt/homebrew/opt/node@22/bin/node`，ABI 127），因 `better-sqlite3` native module 目前隨 `core/node_modules` 打包；完全免 Node / ABI 固定的 native sidecar binary 留待下一個 packaging hardening。
  - Tauri Core launch log 寫到 `~/Library/Application Support/DevDiary/core-tauri.log`，方便診斷 Node path 或 native module ABI 錯誤。

## 修改（Changed）

- `package.json` 補 Tauri build/dev scripts 與必要 dev dependency。
- `vite.config.js` 視 Tauri asset loading 需求調整 production base。
- `docs/specs/MASTER.md` 更新 Tauri shell / packaging 狀態。

## 移除（Removed）

- 不移除 existing Vite dev workflow；Tauri 是新增 desktop shell path。

## 影響範圍（Impact）

- Frontend build path、Tauri Rust shell、local package artifact、README/manual run instructions。
- 安全邊界：packaged shell 仍只連 loopback Core API，不開 remote listener；不打包 secrets / `.env`。

## 驗收條件

- [x] `src-tauri/` exists with valid Tauri config and Rust project files.
- [x] `npm run build` still passes.
- [x] `npm run package:mac` produces unsigned `.app` / `.dmg`.
- [x] Packaged app can launch a WebView shell and packaged Core responds on loopback.
- [x] No `.env`, token, credential, or project root private data is bundled into tracked package config.
- [x] MASTER.md reflects current packaging status.
