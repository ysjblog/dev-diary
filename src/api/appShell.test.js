import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(join(here, '..', 'App.jsx'), 'utf8');
const cssSource = readFileSync(join(here, '..', 'index.css'), 'utf8');
const trendChartSource = readFileSync(join(here, '..', 'components', 'TrendChart.jsx'), 'utf8');
const tauriConfig = JSON.parse(readFileSync(resolve(here, '..', '..', 'src-tauri', 'tauri.conf.json'), 'utf8'));

test('packaged app shell relies on native macOS traffic lights, not fake inner window controls', () => {
  assert.equal(appSource.includes('className="window-controls"'), false);
  assert.equal(appSource.includes('control-dot'), false);
  assert.equal(cssSource.includes('.window-controls'), false);
  assert.equal(cssSource.includes('.control-dot'), false);
});

test('app content shell fills the Tauri webview without an outer prototype frame', () => {
  assert.match(cssSource, /\.mac-window\s*\{[\s\S]*width:\s*100vw;[\s\S]*height:\s*100vh;[\s\S]*border:\s*0;[\s\S]*border-radius:\s*0;/);
  assert.match(cssSource, /body\s*\{[\s\S]*align-items:\s*stretch;[\s\S]*justify-content:\s*stretch;[\s\S]*padding:\s*0;/);
});

test('macOS titlebar uses dark transparent native chrome', () => {
  const mainWindow = tauriConfig.app.windows[0];
  assert.equal(mainWindow.theme, 'Dark');
  assert.equal(mainWindow.titleBarStyle, 'Transparent');
  assert.equal(mainWindow.hiddenTitle, true);
});

test('onboarding primary button hover keeps a defined contrasting foreground and background', () => {
  assert.match(cssSource, /:root\s*\{[\s\S]*--accent-hover:\s*#[0-9a-fA-F]{6};/);
  assert.match(cssSource, /:root\.light-mode\s*\{[\s\S]*--accent-hover:\s*#[0-9a-fA-F]{6};/);
  assert.match(cssSource, /\.btn-primary:hover\s*\{[\s\S]*background:\s*var\(--accent-hover\);[\s\S]*color:\s*var\(--accent-on\);/);
});

test('settings path controls distinguish Project Docs filename and folder scan modes', () => {
  assert.match(appSource, /Project Docs Scan/);
  assert.match(appSource, /Project Docs Scan：特定檔名/);
  assert.match(appSource, /Project Docs Scan：資料夾全掃描/);
  assert.match(appSource, /新增相對檔名/);
  assert.match(appSource, /新增相對資料夾/);
  assert.match(appSource, /selectedFolderToProjectDocFolder/);
  assert.match(appSource, /relativeToProjectRoots:\s*true/);
  assert.match(cssSource, /\.docs-scan-mode-grid\s*\{/);
});

test('workspace comments use forced category filters without unassigned button', () => {
  assert.match(appSource, /\{ key: 'UI\/UX', label: 'UI\/UX' \}/);
  assert.match(appSource, /\{ key: 'Bug', label: 'Bug' \}/);
  assert.match(appSource, /\{ key: 'Feature', label: 'Feature' \}/);
  assert.match(appSource, /\{ key: 'Info', label: 'Info' \}/);
  assert.doesNotMatch(appSource, /未分類/);
});

test('workspace board hides redundant generated kanban cards from old scans', () => {
  assert.match(appSource, /agent-synth:\/\/'/);
  assert.match(appSource, /\/working-tree\//);
  assert.match(appSource, /seenAutoSession/);
});

test('workspace board shows manual status lock badges for user-moved kanban cards', () => {
  const projectsApiSource = readFileSync(join(here, 'projects.js'), 'utf8');
  assert.match(projectsApiSource, /manualStatusLock:\s*Boolean\(c\.status_locked_by_user\)/);
  assert.match(appSource, /c\.manualStatusLock/);
  assert.match(appSource, /手動調整/);
  assert.match(cssSource, /\.kanban-lock-badge\s*\{/);
});

test('workspace board shows AI auto-added source and sync action', () => {
  const projectsApiSource = readFileSync(join(here, 'projects.js'), 'utf8');
  assert.match(projectsApiSource, /runProjectKanbanAiSync/);
  assert.match(projectsApiSource, /aiAutoAdded:\s*c\.source_ref\?\.startsWith\('ai-suggest:\/\/'\)/);
  assert.match(appSource, /重新整理卡片/);
  assert.match(appSource, /AI 自動加入/);
  assert.match(appSource, /kanbanAiSyncSummary/);
  assert.match(cssSource, /\.kanban-ai-toolbar\s*\{/);
  assert.match(cssSource, /\.kanban-ai-badge\s*\{/);
});

test('settings UI does not expose the strict Kanban cards prompt editor', () => {
  assert.doesNotMatch(appSource, /Kanban cards prompt/);
  assert.doesNotMatch(appSource, /promptEditor\('kanban_cards'/);
});

test('settings UI does not expose Kanban AI auto-add tuning controls', () => {
  assert.doesNotMatch(appSource, /Kanban AI Auto-add/);
  assert.doesNotMatch(appSource, /kanbanAiAutoAdd/);
  assert.doesNotMatch(appSource, /Confidence/);
  assert.doesNotMatch(appSource, /Max cards/);
});

test('token trend axis labels render outside the stretch-scaled SVG', () => {
  assert.match(trendChartSource, /preserveAspectRatio="none"/);
  assert.match(trendChartSource, /trend-axis-layer/);
  assert.doesNotMatch(trendChartSource, /<text[\s\S]*chart-axis-label/);
  assert.match(cssSource, /\.chart-axis-label\s*\{[\s\S]*font-family:\s*var\(--font-body\);[\s\S]*font-size:\s*11px;/);
});

test('daily diary writes reload the full Workspace detail before clearing date filters', () => {
  assert.match(appSource, /function App\(\)/);
  assert.match(appSource, /const reloadSelectedProjectDetail = async/);
  assert.match(appSource, /fetchProjectDetail\(selectedProjId, workspaceRangeOptions\)/);
  assert.match(appSource, /const applyDailyWriteResult = async/);
  assert.match(appSource, /await applyDailyWriteResult\(diaryDate, detail, markdown\)/);
  assert.match(appSource, /await applyDailyWriteResult\(diaryDate, detail\)/);
  assert.match(appSource, /const handleClearDiaryDateFilter = async/);
  assert.match(appSource, /await reloadSelectedProjectDetail\(\{ resetEditor: true \}\)/);
});

test('workspace folder button invokes native Finder command instead of fake success toast', () => {
  assert.match(appSource, /const openProjectFolder = async/);
  assert.match(appSource, /@tauri-apps\/api\/core/);
  assert.match(appSource, /invoke\('open_project_folder'/);
  assert.doesNotMatch(appSource, /onClick=\{\(\) => triggerToast\(`📂 已在 Finder 中開啟 \$\{selectedProject\.path\}`\)\}/);
});

test('agent activity roots use per-row controls and distinguish derived scan locations', () => {
  assert.match(appSource, /自動＋自訂（建議）/);
  assert.match(appSource, /只用自訂/);
  assert.match(appSource, /恢復自動偵測/);
  assert.match(appSource, /Product data roots（Core 讀取狀態）/);
  assert.match(appSource, /Core 實際衍生掃描位置/);
  assert.match(appSource, /＋ 新增路徑/);
  assert.doesNotMatch(appSource, /新增一列/);
  assert.match(cssSource, /\.agent-path-row\.agent-path-wrap span:last-child[\s\S]*white-space:\s*normal/);
});

test('background scan status and comment drafts do not overwrite editable input during polling', () => {
  assert.match(appSource, /background_scan/);
  assert.match(appSource, /backgroundScanRunning \? 5_000 : 60_000/);
  assert.match(appSource, /refreshReadOnlySnapshots\(\)/);
  assert.match(appSource, /未儲存的表單內容已保留/);
  assert.match(appSource, /readCommentDraft/);
  assert.match(appSource, /clearCommentDraft/);
});

test('CLI card keeps executable metadata in its dedicated section and docs support path groups/search', () => {
  assert.doesNotMatch(appSource, /<span>Binary path<\/span>/);
  assert.doesNotMatch(appSource, /<span>\{ag\.version\}<\/span>/);
  assert.match(appSource, /<summary>CLI 執行檔<\/summary>/);
  assert.match(appSource, /agent-path-row agent-path-wrap/);
  assert.match(appSource, /aria-label="依檔名或內容搜尋專案文件"/);
  assert.match(appSource, /docs-path-group/);
  assert.match(cssSource, /\.docs-search-control\s*\{/);
  assert.match(cssSource, /\.docs-path-group\s*\{/);
});

test('app shell keeps one desktop tree without mobile layout rules or viewport branches', () => {
  assert.doesNotMatch(cssSource, /@media\s*\(\s*max-width\s*:\s*1180px\s*\)/);
  assert.doesNotMatch(cssSource, /@media\s*\(\s*max-width\s*:\s*820px\s*\)/);
  assert.doesNotMatch(cssSource, /@media\s*\(\s*max-width\s*:\s*640px\s*\)/);
  assert.equal((appSource.match(/className=\{`mac-window/g) ?? []).length, 1);
  assert.doesNotMatch(appSource, /\bmobile\b|narrow[-\s]?screen/i);
  assert.doesNotMatch(appSource, /window\.(?:innerWidth|visualViewport)/);
  assert.doesNotMatch(appSource, /matchMedia\(\s*['"]\(\s*max-width/i);
});
