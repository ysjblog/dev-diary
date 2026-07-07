# Delta: DevDiary UI Scaffold

> Feature: 將 Open Design prototype 移植為可執行的 Vite + React 專案
> Base spec: `docs/specs/dev-diary-macos-app.md`
> Date: 2026-06-28
> Status: implemented (UI only, mock data)

## 新增 (Added)

- Vite + React 18 專案骨架：`index.html`、`src/main.jsx`、`vite.config.js`、`package.json`。
- `src/App.jsx`：完整移植 Open Design `app.html` 的 React 應用程式，含 Dashboard / Projects Workspace / Agents / Settings 四大畫面與 onboarding 互動。
- `src/index.css`：移植設計系統（glassmorphism 深色主題）與全部樣式。
- `README.md`、`.gitignore`、`.claude/launch.json`（dev server 預覽設定）。

## 修改 (Modified)

- 渲染方式由「CDN UMD + Babel standalone 即時編譯」改為 Vite 正規建置（`npm run build` 通過）。
- 移除 prototype 的 `ReactDOM.createRoot` inline 區塊，改由 `src/main.jsx` 掛載。

## 移除 (Removed)

- 無（純新增；未刪除 Open Design 原始檔案，原專案資料夾未被改動）。

## 尚未實作（對照 base spec，屬後續 delta）

- Tauri desktop shell 與 unsigned `.app` / `.dmg` 打包（spec §6）。
- TypeScript Core Engine、Local HTTP API、SQLite 儲存（spec §6.2 / §6.3）。
- CLI log adapter / parser（Claude Code / Codex CLI / Antigravity，spec §8）。
- AI Diary Agent orchestration 與 fallback report（spec §9）。
- 將 UI 由 mock 常數改接 Core API 的 deterministic 資料（spec §10 / §11 render order）。
- 所有 prototype-only 行為（隨機 heatmap、proportional custom range、共用 timeRange state、AI regenerate 直接覆蓋）依 spec §15 改為正式行為。
