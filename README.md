# DevDiary UI（自動開發日記 macOS App — React 介面）

從 Open Design prototype（`app.html`，單檔 React + Babel standalone）移植成可執行的 Vite + React 專案。
視覺、版面、互動與所有 mock 資料完全保留，僅將 CDN / Babel 即時編譯改為正規的 Vite 建置流程。

> 對應 spec：[`docs/specs/dev-diary-macos-app.md`](docs/specs/dev-diary-macos-app.md)

## 專案結構

```
index.html        # 入口（保留 Google Fonts 連結）
src/main.jsx      # React 掛載點
src/App.jsx       # 主應用程式（完整移植自 app.html 的 React 程式碼）
src/index.css     # 設計系統與所有樣式（移植自 app.html 的 <style>）
vite.config.js    # Vite + @vitejs/plugin-react 設定
```

> 註：目前為 prototype UI，所有資料皆為 `src/App.jsx` 中的 mock 常數（`INITIAL_PROJECTS` 等），
> 尚未接上 spec 第 6 章的 Core HTTP API。圖表 / heatmap 等仍是 prototype 行為，
> 後續正式實作需依 spec 改為 Core API 提供的 deterministic 資料。

## 執行指令

```bash
# 1. 安裝依賴
npm install

# 2. 啟動開發伺服器（本機預覽，會自動開啟瀏覽器）
npm run dev

# 手機 / 區網預覽（同一 Wi-Fi 下用手機開 http://<你的電腦 IP>:5173）
npm run dev -- --host
```

## 驗證 / 預覽指令

```bash
# 正式打包
npm run build

# 預覽打包後結果
npm run preview
```

打包輸出在 `dist/`。

## Core Engine 本機啟動

Core Engine 位於 `core/`，提供 local HTTP API 與 SQLite persistence。

```bash
cd core
npm install

# 預設 persistent runtime：
# 使用 ~/Library/Application Support/DevDiary/DevDiary.sqlite
npm start

# 本機 development preset：
# 使用同一個 persistent SQLite，並掃描本機兩個 development roots
npm run start:local

# watch mode + 本機 development roots
npm run dev:local
```

`npm start` 不會自動掃描 `~/Projects` 或 `~/Workspace/side-projects`；要掃這兩個路徑請用 `npm run start:local`，或自行設定 `DEVDIARY_PROJECT_ROOTS`。
