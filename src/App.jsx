import React, { useState, useEffect, useMemo, useRef } from 'react';
import { scanActivityPresentation, shouldAutoScanOnStartup } from './api/autoScanPolicy.js';
import { buildProjectConcentrationFromProjects, fetchDashboard, fetchDashboardWithRetry, toDashboardView } from './api/dashboard.js';
import {
  classifyRuntimeHealth,
  DEFAULT_AGENT_MODEL_OPTIONS,
  fetchAgentDetectionWithRetry,
  fetchDailySchedulerStatusWithRetry,
  fetchDailySchedulerPreflight,
  fetchDailyMarkdownExport,
  fetchRedactedBackupExport,
  fetchRuntimeHealthWithRetry,
  fetchSettingsWithRetry,
  formToSettingsPatch,
  createCustomAgent,
  deleteCustomAgent,
  listToMultiline,
  multilineToList,
  rowsToList,
  patchSettings,
  patchCustomAgent,
  probeCustomAgent,
  REASONING_OPTIONS,
  runDailySchedulerNow,
  schedulerPreflightSummary,
  selectedFolderToProjectDocFolder,
  settingsAgentsToCardsWithDetection,
  settingsToForm,
  updateCanonicalActivityLogSource,
  updateCanonicalExecutableSource,
} from './api/settings.js';
import { taipeiDate } from './api/date.js';
import {
  fetchProjectListWithRetry,
  fetchProjectDetail,
  createProjectComment,
  setProjectCommentPinned,
  removeProjectComment,
  setKanbanCardStatus,
  saveProjectSummary,
  regenerateProjectSummary,
  acceptProjectSummaryDraft,
  saveProjectDiaryEntry,
  regenerateProjectDiaryEntry,
  singleDayRangeOptions,
  runGlobalScan,
  runProjectScan,
  runProjectKanbanAiSync,
  toProjectListView,
  toKanbanCardView,
  toMetricStripView,
  toGitStatusView,
  summaryStatusLabel,
  formatTs,
  formatDuration,
} from './api/projects.js';
import { clearCommentDraft, readCommentDraft, writeCommentDraft } from './api/commentDrafts.js';
import TrendChart from './components/TrendChart.jsx';


    // --- Mock Initial Data ---
    const INITIAL_PROJECTS = [
      {
        id: 1,
        name: "Example Workspace UI",
        status: "active",
        path: "example://workspace-ui",
        agents: ["antigravity-cli", "claude-code"],
        logsCount: 12,
        tokensCount: "24.5k",
        logs: `## 自動開發日記 macOS App UI 設計需求書 v0.2
### 2026-06-26 工作摘要
- 成功設計 Liquid Glass 風格的 macOS 視窗框架。
- 整合 React 與 Babel 進行本地端動態渲染。
- 實作 Onboarding 設定引導精靈與首頁數據卡片。
- 下一步：優化 SQLite 解析模組並防止空白視窗 bug。`,
        blockers: [
          { id: 101, title: "CSS 樣式衝突", desc: "部分 sidebar 寬度在 1200px 以下解析度會被壓縮。" },
          { id: 102, title: "Babel 快取過大", desc: "本地載入 @babel/standalone 在極限環境下可能慢 500ms。" }
        ],
        tokens: [
          { id: 1, date: "2026-06-26", agent: "Antigravity CLI", input: "12,450", output: "4,210", cost: "$0.091" },
          { id: 2, date: "2026-06-26", agent: "Claude Code Core", input: "18,900", output: "6,400", cost: "$0.142" },
          { id: 3, date: "2026-06-25", agent: "Antigravity CLI", input: "8,500", output: "2,100", cost: "$0.051" }
        ],
        comments: [
          { id: 201, text: "記得在 app.html 裡面要引入 React 與 ReactDOM 依賴，避免空白畫面！", pinned: true, date: "2026-06-26 14:30", tags: ["Bug", "Urgent"] },
          { id: 202, text: "Liquid Glass 風格在 Light mode 底下需要適當降低模糊度以維持文字易讀性。", pinned: false, date: "2026-06-26 10:15", tags: ["UI/UX"] }
        ],
        docs: [
          { name: "master.md", content: "# Master Spec\n主分支的架構描述檔。定義整個開發日記系統的專案生命週期以及 API 同步合約。" },
          { name: "spec.md", content: "# Spec Specification\n包含 macOS App 的界面與功能規格書。主要為 Tauri 封裝的 Webview 設計。" },
          { name: "delta_spec.md", content: "# Delta Spec\n新增 Onboarding 掃描 CLI Agents 及設定專案路徑的差量規格。" }
        ],
        sessions: [
          { id: "s1", cmd: "agy run-command \"make build\"", time: "2026-06-26 21:05", duration: "12s", tokens: "1.2k", status: "success", logs: "[system] Build succeeded in 12s.\n[info] Executable size: 14.5MB\n[info] Output path: ./dist/diary" },
          { id: "s2", cmd: "claude run-command \"npm run test\"", time: "2026-06-26 19:40", duration: "45s", tokens: "4.5k", status: "failed", logs: "[error] Fail: 2 tests failed.\n[error] TimeoutError: waiting for selector '#root'\n[info] Exit code 1" }
        ]
      },
      {
        id: 2,
        name: "Open Design CLI",
        status: "idle",
        path: "example://open-design-cli",
        agents: ["antigravity-cli"],
        logsCount: 8,
        tokensCount: "12.8k",
        logs: `## Open Design CLI (od-cli) v1.0.1
### 2026-06-25 工作摘要
- 完成媒體資源下載模組 (wan-2.1-t2v / veo-3-fal)。
- 支援 POSIX 終端機下的非同步輪詢機制。
- 完成 media generate 工具整合。`,
        blockers: [
          { id: 103, title: "API 憑證遺失", desc: "Fal AI 在部分 Windows 環境下讀取 env 會有亂碼問題。" }
        ],
        tokens: [
          { id: 4, date: "2026-06-25", agent: "Antigravity CLI", input: "9,800", output: "3,000", cost: "$0.064" }
        ],
        comments: [
          { id: 203, text: "需要支援 --aspect 比例設定參數，預設為 1:1。", pinned: false, date: "2026-06-25 11:20", tags: ["Feature"] }
        ],
        docs: [
          { name: "master.md", content: "# od-cli master\nOpen Design Command Line Interface tool specs." }
        ],
        sessions: [
          { id: "s3", cmd: "agy media generate --surface image", time: "2026-06-25 15:10", duration: "25s", tokens: "2.1k", status: "success", logs: "[info] Fal AI task generated: 9283712\n[info] Finished download to ./assets/out.png" }
        ]
      },
      {
        id: 3,
        name: "SQLite Auth Service",
        status: "idle",
        path: "example://sqlite-auth",
        agents: ["claude-code"],
        logsCount: 5,
        tokensCount: "5.2k",
        logs: `## SQLite Auth Service
### 2026-06-24 工作摘要
- 實作 bcrypt 密碼雜湊與加密 token 機制。
- 完成 SQLite3 資料表初始化及測試案例。`,
        blockers: [],
        tokens: [
          { id: 5, date: "2026-06-24", agent: "Claude Code Core", input: "4,000", output: "1,200", cost: "$0.026" }
        ],
        comments: [],
        docs: [
          { name: "master.md", content: "# SQLite Auth Service master\n本機資料庫使用者權限管理模組。" }
        ],
        sessions: []
      }
    ];

    const INITIAL_AGENTS = [
      { id: "antigravity-cli", name: "Antigravity CLI", version: "Settings", status: "connected", active: true, path: "等待 Core 偵測" },
      { id: "claude-code", name: "Claude Code Core", version: "Settings", status: "connected", active: true, path: "等待 Core 偵測" },
      { id: "codex", name: "Codex CLI Engine", version: "v1.1.0", status: "disconnected", active: false, path: "未偵測到預設執行路徑" }
    ];

    const INITIAL_KANBAN = [
      { id: 1, title: "自動日記 macOS App UI 設計", desc: "完成 Dashboard 與 Onboarding 的 UI 設計規格書", status: "in_progress", assignee: "antigravity-cli", date: "2026-06-26", projectId: 1 },
      { id: 2, title: "SQLite Database Schema", desc: "定義專案日誌與 Token 統計的資料表結構", status: "done", assignee: "claude-code", date: "2026-06-25", projectId: 1 },
      { id: 3, title: "CLI Agent Log Parser", desc: "實作 regex 解析 $PATH 下 AI 執行日誌", status: "todo", assignee: "antigravity-cli", date: "2026-06-27", projectId: 1 },
      { id: 4, title: "System Service Daemon", desc: "背景定時執行 SQLite 檔案備份與快取清理", status: "todo", assignee: "claude-code", date: "2026-06-28", projectId: 1 },
      { id: 5, title: "Aspect Ratio Image Parameter", desc: "支援 CLI 輸入 --aspect 自動切換畫幅比例", status: "todo", assignee: "antigravity-cli", date: "2026-06-25", projectId: 2 }
    ];

    const statusLabels = {
      todo: "待處理 (TODO)",
      in_progress: "進行中 (IN PROGRESS)",
      done: "已完成 (DONE)"
    };
    const statusOrder = ["todo", "in_progress", "done"];

    const monthLabel = (date) => {
      const [year, month] = date.split("-");
      return `${year} 年 ${Number(month)} 月`;
    };

    const renderInlineMarkdown = (text) => {
      const parts = String(text).split(/(`[^`]+`)/g);
      return parts.map((part, index) => {
        if (part.startsWith("`") && part.endsWith("`")) {
          return <code key={index}>{part.slice(1, -1)}</code>;
        }
        return part;
      });
    };

    const renderMarkdown = (markdown) => {
      const lines = String(markdown || "").split("\n");
      const nodes = [];
      let list = [];
      const flushList = () => {
        if (list.length) {
          nodes.push(
            <ul key={`ul-${nodes.length}`}>
              {list.map((item, index) => <li key={index}>{renderInlineMarkdown(item)}</li>)}
            </ul>
          );
          list = [];
        }
      };

      lines.forEach((rawLine, index) => {
        const line = rawLine.trim();
        if (!line) {
          flushList();
          return;
        }
        if (line.startsWith("- ")) {
          list.push(line.slice(2));
          return;
        }
        flushList();
        if (line.startsWith("# ")) nodes.push(<h1 key={index}>{line.slice(2)}</h1>);
        else if (line.startsWith("## ")) nodes.push(<h2 key={index}>{line.slice(3)}</h2>);
        else if (line.startsWith("### ")) nodes.push(<h3 key={index}>{line.slice(4)}</h3>);
        else if (line.startsWith("#### ")) nodes.push(<h4 key={index}>{line.slice(5)}</h4>);
        else nodes.push(<p key={index}>{renderInlineMarkdown(line)}</p>);
      });
      flushList();
      return nodes;
    };

    // --- Time-range token stats ---
    const formatRangeDate = (value) => {
      if (!value) return "未選";
      const [year, month, day] = value.split("-");
      return `${Number(month)}/${Number(day)}`;
    };

    const formatTokens = (n) => {
      if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
      if (n >= 1000)    return `${(n / 1000).toFixed(0)}k`;
      return String(n);
    };

    const parseTokenNumber = (value) => Number(String(value || "").replace(/[^\d.-]/g, "")) || 0;
    const extractRecordDate = (value) => {
      const match = String(value || "").match(/\d{4}-\d{2}-\d{2}/);
      return match ? match[0] : "";
    };
    const isRecordInRange = (value, start, end) => {
      const date = extractRecordDate(value);
      return date !== "" && date >= start && date <= end;
    };
    const computeProjectRangeData = (project, start, end) => {
      const tokenTotal = (project?.tokens || [])
        .filter((token) => isRecordInRange(token.date, start, end))
        .reduce((sum, token) => sum + parseTokenNumber(token.input) + parseTokenNumber(token.output), 0);
      const sessionTotal = (project?.sessions || [])
        .filter((session) => isRecordInRange(session.time, start, end))
        .length;
      return { tokens: formatTokens(tokenTotal), sessions: sessionTotal };
    };

    function AgentGlyph() {
      return (
        <svg className="agent-glyph" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3z" />
          <path d="M5 14l.9 2.1L8 17l-2.1.9L5 20l-.9-2.1L2 17l2.1-.9L5 14z" />
          <path d="M19 13l.9 2.1L22 16l-2.1.9L19 19l-.9-2.1L16 16l2.1-.9L19 13z" />
        </svg>
      );
    }

    // --- Donut SVG Component ---
    function polarPoint(cx, cy, radius, angle) {
      const radians = (angle - 90) * Math.PI / 180;
      return {
        x: cx + radius * Math.cos(radians),
        y: cy + radius * Math.sin(radians),
      };
    }

    function donutSlicePath(cx, cy, outerRadius, innerRadius, startAngle, endAngle) {
      const largeArc = endAngle - startAngle > 180 ? 1 : 0;
      const outerStart = polarPoint(cx, cy, outerRadius, startAngle);
      const outerEnd = polarPoint(cx, cy, outerRadius, endAngle);
      const innerEnd = polarPoint(cx, cy, innerRadius, endAngle);
      const innerStart = polarPoint(cx, cy, innerRadius, startAngle);

      return [
        `M ${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)}`,
        `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)}`,
        `L ${innerEnd.x.toFixed(2)} ${innerEnd.y.toFixed(2)}`,
        `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)}`,
        'Z',
      ].join(' ');
    }

    function DonutChart({ data, total }) {
      const cx = 62, cy = 62, outer = 52, inner = 39;
      const tokenSum = data.reduce((sum, d) => sum + (Number(d.tokenTotal) || 0), 0);
      let cursor = 0;
      const segs = data.map((d, index) => {
        const fraction = tokenSum > 0 ? (Number(d.tokenTotal) || 0) / tokenSum : (Number(d.pct) || 0) / 100;
        const start = cursor;
        const end = index === data.length - 1 ? 360 : Math.min(360, cursor + fraction * 360);
        cursor = end;
        return { ...d, start, end };
      });
      return (
        <svg width={cx * 2} height={cy * 2} viewBox={`0 0 ${cx * 2} ${cy * 2}`} style={{ flexShrink: 0 }}>
          {/* Track ring */}
          <circle cx={cx} cy={cy} r={(outer + inner) / 2} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={outer - inner} />
          {segs.map((s, i) => (
            s.end - s.start >= 359.99 ? (
              <circle
                key={`${s.name}-${i}`}
                cx={cx}
                cy={cy}
                r={(outer + inner) / 2}
                fill="none"
                stroke={s.color}
                strokeWidth={outer - inner}
              />
            ) : (
              <path
                key={`${s.name}-${i}`}
                d={donutSlicePath(cx, cy, outer, inner, s.start, s.end)}
                fill={s.color}
              />
            )
          ))}
          {/* Centre label */}
          <text x={cx} y={cy + 4} textAnchor="middle" fill="var(--fg)" fontSize="11.5" fontWeight="700" fontFamily="var(--font-mono)">{total}</text>
        </svg>
      );
    }

    // --- Main App Component ---
    function App() {
      // Pages Navigation
      const [currentPage, setCurrentPage] = useState("dashboard"); // "dashboard" | "projects" | "agents" | "settings"

      // Theme Mode state
      const [themeMode, setThemeMode] = useState("dark"); // "dark" | "light" | "system"
      
      // Toast notifications state
      const [toasts, setToasts] = useState([]);
      const triggerToast = (text) => {
        const id = Date.now();
        setToasts((prev) => [...prev, { id, text }]);
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 3000);
      };

      // App Data states — projects/kanban now come from the Core API (spec §11).
      const [projects, setProjects] = useState([]);
      const [agents, setAgents] = useState(() => settingsAgentsToCardsWithDetection(INITIAL_AGENTS));
      const [agentDetection, setAgentDetection] = useState(null);
      const [agentDetectionLoading, setAgentDetectionLoading] = useState(false);
      const [kanbanCards, setKanbanCards] = useState([]);
      const [settingsSnapshot, setSettingsSnapshot] = useState(null);
      const [settingsForm, setSettingsForm] = useState(() => settingsToForm(null));
      const [settingsLoading, setSettingsLoading] = useState(true);
      const [settingsSaving, setSettingsSaving] = useState(false);
      const [settingsError, setSettingsError] = useState(null);
      const [runtimeHealth, setRuntimeHealth] = useState(null);
      const [runtimeStatus, setRuntimeStatus] = useState(() => classifyRuntimeHealth(null, new Error('initializing')));
      const [schedulerStatus, setSchedulerStatus] = useState(null);
      const [schedulerRunning, setSchedulerRunning] = useState(false);
      const [dailyExporting, setDailyExporting] = useState(false);
      const [backupExporting, setBackupExporting] = useState(false);
      const [settingsRefreshNotice, setSettingsRefreshNotice] = useState('');
      const [agentLogRows, setAgentLogRows] = useState({});
      const [showOnboarding, setShowOnboarding] = useState(false);
      const [onboardingStep, setOnboardingStep] = useState(1);
      const [onboardingRootsText, setOnboardingRootsText] = useState("");
      const [onboardingAgent, setOnboardingAgent] = useState("claude-code");
      const [onboardingStoragePath, setOnboardingStoragePath] = useState("");
      const [onboardingLoading, setOnboardingLoading] = useState(false);
      const [onboardingMessage, setOnboardingMessage] = useState("");
      
      // Active states in Projects view
      const [selectedProjId, setSelectedProjId] = useState(null);
      const [projectTab, setProjectTab] = useState("board"); // "board" | "logs" | "git" | "comments" | "docs" | "sessions" | "tokens"
      const [searchQuery, setSearchQuery] = useState("");
      const [statusFilter, setStatusFilter] = useState("all");
      const [draggedCardId, setDraggedCardId] = useState(null);
      const [dragOverStatus, setDragOverStatus] = useState(null);

      // Edit Log text state
      const [editableLogText, setEditableLogText] = useState("");
      const [isLogEditing, setIsLogEditing] = useState(false);
      const [summaryBusyAction, setSummaryBusyAction] = useState(null);
      const [selectedDiaryEntryDate, setSelectedDiaryEntryDate] = useState("");
      
      // Comment text & tag states
      const [newCommentText, setNewCommentText] = useState("");
      const [newCommentTag, setNewCommentTag] = useState("UI/UX");
      const [commentDraftProjectId, setCommentDraftProjectId] = useState(null);
      const [commentFilter, setCommentFilter] = useState("all");
      const [diaryQuery, setDiaryQuery] = useState("");
      const [selectedDiaryDate, setSelectedDiaryDate] = useState("");

      // Doc preview states
      const [activeDocPreview, setActiveDocPreview] = useState(null);
      const [docsQuery, setDocsQuery] = useState("");

      // Core scan states
      const [isScanRunning, setIsScanRunning] = useState(false);
      const [isScanRefreshing, setIsScanRefreshing] = useState(false);
      const [scanningProjectId, setScanningProjectId] = useState(null);
      const [kanbanAiSyncing, setKanbanAiSyncing] = useState(false);
      const [kanbanAiSyncSummary, setKanbanAiSyncSummary] = useState(null);
      const autoScanStartedRef = useRef(false);
      const isAnyScanRunning = isScanRunning || isScanRefreshing || scanningProjectId !== null || kanbanAiSyncing;
      const backgroundScanRunning = (settingsSnapshot?.background_scan?.running_operations || []).length > 0;
      const scanActivity = scanActivityPresentation({ activeWorkPending: isScanRunning, coreScanRunning: backgroundScanRunning });

      // Add Agent Wizard modal states
      const [isAddAgentOpen, setIsAddAgentOpen] = useState(false);
      const [wizardStep, setWizardStep] = useState(1);
      const [newAgentName, setNewAgentName] = useState("");
      const [newAgentPath, setNewAgentPath] = useState("");
      const [newAgentModel, setNewAgentModel] = useState("Gemini-2.0-Flash");
      const [newAgentProbe, setNewAgentProbe] = useState(null);
      const [agentProbeRunning, setAgentProbeRunning] = useState(false);

      // Chart filter state
      const [chartFilter, setChartFilter] = useState("all"); // "all" | "claude-code" | "codex-cli" | "antigravity-cli" | "other"

      // Dashboard and Workspace keep independent range state (spec §11).
      const [dashboardTimeRange, setDashboardTimeRange] = useState("all");
      const [isDashboardDatePickerOpen, setIsDashboardDatePickerOpen] = useState(false);
      const [dashboardCustomStartDate, setDashboardCustomStartDate] = useState("");
      const [dashboardCustomEndDate, setDashboardCustomEndDate] = useState("");
      const [workspaceTimeRange, setWorkspaceTimeRange] = useState("all");
      const [isWorkspaceDatePickerOpen, setIsWorkspaceDatePickerOpen] = useState(false);
      const [workspaceCustomStartDate, setWorkspaceCustomStartDate] = useState("");
      const [workspaceCustomEndDate, setWorkspaceCustomEndDate] = useState("");

      // Custom range is "active" only when mode=custom AND both dates filled
      const isDashboardCustomRangeSet = dashboardTimeRange === "custom" && dashboardCustomStartDate !== "" && dashboardCustomEndDate !== "";
      const isWorkspaceCustomRangeSet = workspaceTimeRange === "custom" && workspaceCustomStartDate !== "" && workspaceCustomEndDate !== "";

      const dashboardCustomRangeLabel = isDashboardCustomRangeSet
        ? `${formatRangeDate(dashboardCustomStartDate)}–${formatRangeDate(dashboardCustomEndDate)}`
        : "自訂日期";
      const workspaceCustomRangeLabel = isWorkspaceCustomRangeSet
        ? `${formatRangeDate(workspaceCustomStartDate)}–${formatRangeDate(workspaceCustomEndDate)}`
        : "自訂日期";

      // --- Dashboard live data from Core API (spec §10) ---
      // The requested range maps to the Core snapshot. A custom selection without
      // both dates falls back to all-time, matching the prototype's behavior.
      const dashRange = dashboardTimeRange === "custom" ? (isDashboardCustomRangeSet ? "custom" : "all") : dashboardTimeRange;

      const [dashSnapshot, setDashSnapshot] = useState(null);
      const [dashLoading, setDashLoading] = useState(true);
      const [dashError, setDashError] = useState(null);

      useEffect(() => {
        let cancelled = false;
        setDashLoading(true);
        setDashError(null);
        fetchDashboardWithRetry(dashRange, dashboardCustomStartDate, dashboardCustomEndDate)
          .then((snapshot) => {
            if (cancelled) return;
            setDashSnapshot(snapshot);
            setDashError(null);
            setDashLoading(false);
          })
          .catch((err) => {
            if (cancelled) return;
            setDashError(err.message || String(err));
            setDashLoading(false);
          });
        return () => { cancelled = true; };
      }, [dashRange, dashboardCustomStartDate, dashboardCustomEndDate]);

      const dashView = dashSnapshot ? toDashboardView(dashSnapshot) : null;
      const rangeData = dashView
        ? dashView.rangeData
        : { label: "載入中", tokens: "—", sessions: "—", primary: "—", pct: "—", activeProjects: "—", delta: null };
      const agentMix = dashView
        ? dashView.agentMix
        : { label: "載入中", total: "—", data: [] };
      const projectConcentrationFallback = useMemo(() => buildProjectConcentrationFromProjects(projects), [projects]);
      const projectConcentration = dashView?.projectConcentration?.length
        ? dashView.projectConcentration
        : (!Array.isArray(dashSnapshot?.project_concentration) && dashRange === "all" ? projectConcentrationFallback : []);

      // Sidebar 24h quick stats — always 24h, independent of the selected Dashboard range.
      const [sidebar24h, setSidebar24h] = useState(null);
      useEffect(() => {
        let cancelled = false;
        fetchDashboardWithRetry("24h")
          .then((s) => { if (!cancelled) setSidebar24h(s); })
          .catch(() => { if (!cancelled) setSidebar24h(null); });
        return () => { cancelled = true; };
      }, []);
      const sb24 = sidebar24h ? sidebar24h.metric : null;
      const sbScanLabel = backgroundScanRunning
        ? '掃描中'
        : settingsSnapshot?.background_scan?.last_completed_at
          ? new Date(settingsSnapshot.background_scan.last_completed_at).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })
          : sidebar24h ? new Date(sidebar24h.captured_at).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" }) : "—";

      // --- Projects Workspace live data from Core API (spec §11) ---
      const [projectsLoading, setProjectsLoading] = useState(true);
      const [projectsError, setProjectsError] = useState(null);
      useEffect(() => {
        let cancelled = false;
        setProjectsLoading(true);
        setProjectsError(null);
        fetchProjectListWithRetry()
          .then((list) => {
            if (cancelled) return;
            const view = toProjectListView(list);
            setProjects(view);
            setProjectsLoading(false);
            // Keep a valid selection if the default id is absent.
            setSelectedProjId((cur) => (view.some((p) => p.id === cur) ? cur : (view[0]?.id ?? null)));
          })
          .catch((err) => {
            if (cancelled) return;
            setProjectsError(err.message || String(err));
            setProjectsLoading(false);
          });
        return () => { cancelled = true; };
      }, []);

      // Selected-project detail snapshot. Re-fetched whenever the selection changes.
      const [projectDetail, setProjectDetail] = useState(null);
      const [detailLoading, setDetailLoading] = useState(false);
      const [detailError, setDetailError] = useState(null);
      const workspaceFetchRange = workspaceTimeRange === "custom" ? (isWorkspaceCustomRangeSet ? "custom" : "all") : workspaceTimeRange;
      const workspaceRangeOptions = useMemo(() => ({
        range: workspaceFetchRange,
        start: workspaceFetchRange === "custom" ? workspaceCustomStartDate : "",
        end: workspaceFetchRange === "custom" ? workspaceCustomEndDate : "",
      }), [workspaceFetchRange, workspaceCustomStartDate, workspaceCustomEndDate]);
      const workspaceRangeLabel = {
        all: "全部",
        "24h": "近24小時",
        "7d": "近7天",
        "1m": "近1個月",
        custom: workspaceCustomRangeLabel,
      }[workspaceFetchRange] || "全部";
      const applyProjectDetail = (detail, { resetEditor = false } = {}) => {
        setProjectDetail(detail);
        setKanbanCards(detail.kanban.map(toKanbanCardView));
        if (resetEditor) {
          setSelectedDiaryEntryDate("");
          setEditableLogText(detail.summary_markdown || "");
          setIsLogEditing(false);
        }
      };
      const reloadSelectedProjectDetail = async ({ resetEditor = false } = {}) => {
        if (selectedProjId == null) return null;
        setDetailLoading(true);
        setDetailError(null);
        try {
          const detail = await fetchProjectDetail(selectedProjId, workspaceRangeOptions);
          applyProjectDetail(detail, { resetEditor });
          return detail;
        } catch (err) {
          const message = err.message || String(err);
          setDetailError(message);
          triggerToast(`重新載入 Workspace 日記失敗：${message}`);
          throw err;
        } finally {
          setDetailLoading(false);
        }
      };
      useEffect(() => {
        if (selectedProjId == null) {
          setProjectDetail(null);
          return;
        }
        let cancelled = false;
        setDetailLoading(true);
        setDetailError(null);
        fetchProjectDetail(selectedProjId, workspaceRangeOptions)
          .then((detail) => {
            if (cancelled) return;
            applyProjectDetail(detail, { resetEditor: true });
            setDetailLoading(false);
          })
          .catch((err) => {
            if (cancelled) return;
            setProjectDetail(null);
            setDetailError(err.message || String(err));
            setDetailLoading(false);
          });
        return () => { cancelled = true; };
      }, [selectedProjId, workspaceRangeOptions]);

      const metricStrip = useMemo(() => toMetricStripView(projectDetail?.metric_strip), [projectDetail]);
      const groupedDocs = useMemo(() => {
        const query = docsQuery.trim().toLocaleLowerCase();
        const docs = (projectDetail?.docs || []).filter((doc) => !query || `${doc.name}\n${doc.content}`.toLocaleLowerCase().includes(query));
        const groupsByPath = new Map();
        docs.forEach((doc) => {
          const pieces = String(doc.name || '').replace(/\\/g, '/').split('/').filter(Boolean);
          const name = pieces.length > 1 ? `${pieces.slice(0, -1).join('/')}/` : '專案根目錄';
          const group = groupsByPath.get(name) || { name, docs: [] };
          group.docs.push(doc);
          groupsByPath.set(name, group);
        });
        return [...groupsByPath.values()];
      }, [projectDetail, docsQuery]);

      const applySettingsSnapshot = (snapshot) => {
        setSettingsSnapshot(snapshot);
        setSettingsForm(settingsToForm(snapshot));
        setSettingsRefreshNotice('');
        setThemeMode(snapshot.appearance || 'system');
        setAgents(settingsAgentsToCardsWithDetection(snapshot.agents, agentDetection?.agents, snapshot.custom_agents));
        setOnboardingRootsText(listToMultiline(snapshot.project_roots));
        setOnboardingAgent(snapshot.default_diary_agent || 'claude-code');
        setOnboardingStoragePath(snapshot.data_storage?.desired_db_path || snapshot.data_storage?.active_db_path || "");
        if (!window.localStorage.getItem('devdiary:onboarding-complete') && (!snapshot.project_roots || snapshot.project_roots.length === 0)) {
          setShowOnboarding(true);
        }
      };

      useEffect(() => {
        if (settingsSnapshot?.agents) {
          setAgents(settingsAgentsToCardsWithDetection(settingsSnapshot.agents, agentDetection?.agents, settingsSnapshot.custom_agents));
        }
      }, [settingsSnapshot, agentDetection]);

      const reloadSettings = async () => {
        setSettingsLoading(true);
        setSettingsError(null);
        try {
          const health = await fetchRuntimeHealthWithRetry();
          setRuntimeHealth(health);
          setRuntimeStatus(classifyRuntimeHealth(health));
          const snapshot = await fetchSettingsWithRetry();
          applySettingsSnapshot(snapshot);
        } catch (err) {
          setRuntimeStatus(classifyRuntimeHealth(null, err));
          setSettingsError(err.message || String(err));
        } finally {
          setSettingsLoading(false);
        }
      };

      useEffect(() => {
        let cancelled = false;
        const refreshReadOnlySnapshots = async () => {
          try {
            const snapshot = await fetchSettingsWithRetry();
            if (cancelled) return;
            setSettingsSnapshot((current) => {
              if (!current) return snapshot;
              if (current.revision !== snapshot.revision) {
                setSettingsRefreshNotice('偵測到背景服務更新設定；未儲存的表單內容已保留，需要時請重新載入。');
              }
              return {
                ...current,
                background_scan: snapshot.background_scan,
                updated_at: snapshot.updated_at,
              };
            });
          } catch {
            // Polling is supplemental; interactive actions keep their existing errors.
          }
        };
        refreshReadOnlySnapshots();
        const timer = window.setInterval(refreshReadOnlySnapshots, backgroundScanRunning ? 5_000 : 60_000);
        return () => { cancelled = true; window.clearInterval(timer); };
      }, [backgroundScanRunning]);

      useEffect(() => {
        if (selectedProjId == null) {
          setCommentDraftProjectId(null);
          setNewCommentText('');
          setNewCommentTag('UI/UX');
          return;
        }
        const draft = readCommentDraft(window.localStorage, selectedProjId);
        setNewCommentText(draft.text);
        setNewCommentTag(draft.tag);
        setCommentDraftProjectId(selectedProjId);
      }, [selectedProjId]);

      useEffect(() => {
        if (selectedProjId == null || commentDraftProjectId !== selectedProjId) return;
        writeCommentDraft(window.localStorage, selectedProjId, { text: newCommentText, tag: newCommentTag });
      }, [selectedProjId, commentDraftProjectId, newCommentText, newCommentTag]);

      const reloadAgentDetection = async ({ quiet = false } = {}) => {
        setAgentDetectionLoading(true);
        try {
          const snapshot = await fetchAgentDetectionWithRetry();
          setAgentDetection(snapshot);
          if (!quiet) triggerToast("Agent detection 已更新。");
        } catch (err) {
          const message = err.message || String(err);
          setSettingsError(message);
          if (!quiet) triggerToast(`Agent detection 失敗：${message}`);
        } finally {
          setAgentDetectionLoading(false);
        }
      };

      const reloadSchedulerStatus = async () => {
        try {
          const status = await fetchDailySchedulerStatusWithRetry();
          setSchedulerStatus(status);
        } catch (err) {
          setSettingsError(err.message || String(err));
        }
      };

      const handleRunDailyScheduler = async () => {
        setSchedulerRunning(true);
        setSettingsError(null);
        try {
          const preflight = await fetchDailySchedulerPreflight();
          triggerToast(`Daily scheduler ${schedulerPreflightSummary(preflight)}`);
          const result = await runDailySchedulerNow();
          triggerToast(`Daily scheduler：${result.status} · ${schedulerPreflightSummary(result.preflight ?? preflight)}`);
          await reloadSchedulerStatus();
        } catch (err) {
          const message = err.message || String(err);
          setSettingsError(message);
          triggerToast(`Daily scheduler 失敗：${message}`);
        } finally {
          setSchedulerRunning(false);
        }
      };

      const saveAgentExecutableSource = async (agent, mode) => {
        const configured_path = mode === 'custom' ? document.getElementById(`agent-executable-${agent.id}`)?.value?.trim() : null;
        try {
          const result = await updateCanonicalExecutableSource(agent.id, { mode, configured_path, expected_revision: settingsSnapshot?.revision });
          await reloadSettings();
          await reloadAgentDetection({ quiet: true });
          triggerToast(`${agent.name} 執行檔已測試並儲存。revision ${result.revision}`);
        } catch (err) {
          const message = err.message || String(err);
          setSettingsError(message);
          triggerToast(`執行檔未儲存：${message}`);
        }
      };

      const rootsForAgent = (agent) => agentLogRows[agent.id] ?? (agent.sources?.activity_logs?.configured_data_roots || []);

      const pickAgentSourcePath = async (agent, kind, rowIndex = null) => {
        try {
          if (!window.__TAURI_INTERNALS__) throw new Error('Web 開發模式無法開啟 macOS picker；請直接輸入絕對路徑。');
          const { open } = await import('@tauri-apps/plugin-dialog');
          const selected = await open({ directory: kind === 'directory', multiple: false });
          if (!selected || Array.isArray(selected)) return;
          if (kind === 'directory') {
            const rows = [...rootsForAgent(agent)];
            if (rowIndex === null) rows.push(selected);
            else rows[rowIndex] = selected;
            setAgentLogRows((prev) => ({ ...prev, [agent.id]: rows }));
            return;
          }
          const input = document.getElementById(`agent-executable-${agent.id}`);
          if (input) input.value = selected;
        } catch (err) {
          triggerToast(err.message || String(err));
        }
      };

      const changeAgentLogRow = (agent, action, index, value = '') => {
        const rows = [...rootsForAgent(agent)];
        if (action === 'add') rows.push('');
        if (action === 'remove') rows.splice(index, 1);
        if (action === 'update') rows[index] = value;
        setAgentLogRows((prev) => ({ ...prev, [agent.id]: rows.length ? rows : [''] }));
      };

      const saveAgentLogRoots = async (agent, mode) => {
        const configured_data_roots = rootsForAgent(agent).map((item) => item.trim()).filter(Boolean);
        try {
          const result = await updateCanonicalActivityLogSource(agent.id, { mode, configured_data_roots, expected_revision: settingsSnapshot?.revision });
          await reloadSettings();
          await reloadAgentDetection({ quiet: true });
          setAgentLogRows((prev) => { const next = { ...prev }; delete next[agent.id]; return next; });
          triggerToast(`${agent.name} 活動記錄資料夾已儲存。revision ${result.revision}`);
        } catch (err) {
          const message = err.message || String(err);
          setSettingsError(message);
          triggerToast(`活動記錄資料夾未儲存：${message}`);
        }
      };

      const downloadArtifact = (artifact, type) => {
        const blob = new Blob([artifact.content], { type });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = artifact.filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      };

      const handleDailyMarkdownExport = async () => {
        setDailyExporting(true);
        setSettingsError(null);
        try {
          const date = taipeiDate();
          const artifact = await fetchDailyMarkdownExport({
            date,
            includeComments: settingsForm.includeCommentsInExports,
          });
          downloadArtifact(artifact, 'text/markdown;charset=utf-8');
          triggerToast(`Markdown 日誌已匯出：${artifact.filename}`);
        } catch (err) {
          const message = err.message || String(err);
          setSettingsError(message);
          triggerToast(`Markdown 匯出失敗：${message}`);
        } finally {
          setDailyExporting(false);
        }
      };

      const handleRedactedBackupExport = async () => {
        setBackupExporting(true);
        setSettingsError(null);
        try {
          const artifact = await fetchRedactedBackupExport({
            includeComments: settingsForm.includeCommentsInExports,
          });
          downloadArtifact(artifact, 'application/json;charset=utf-8');
          triggerToast(`Redacted backup 已匯出：${artifact.filename}`);
        } catch (err) {
          const message = err.message || String(err);
          setSettingsError(message);
          triggerToast(`Backup 匯出失敗：${message}`);
        } finally {
          setBackupExporting(false);
        }
      };

      useEffect(() => {
        let cancelled = false;
        setSettingsLoading(true);
        setSettingsError(null);
        Promise.all([
          fetchRuntimeHealthWithRetry().catch((err) => ({ __runtime_error: err })),
          fetchSettingsWithRetry(),
        ])
          .then(([health, snapshot]) => {
            if (cancelled) return;
            if (health?.__runtime_error) {
              setRuntimeHealth(null);
              setRuntimeStatus(classifyRuntimeHealth(null, health.__runtime_error));
            } else {
              setRuntimeHealth(health);
              setRuntimeStatus(classifyRuntimeHealth(health));
            }
            applySettingsSnapshot(snapshot);
          })
          .catch((err) => {
            if (cancelled) return;
            setSettingsError(err.message || String(err));
          })
          .finally(() => {
            if (!cancelled) setSettingsLoading(false);
          });
        return () => { cancelled = true; };
      }, []);

      useEffect(() => {
        reloadAgentDetection({ quiet: true });
        reloadSchedulerStatus();
      }, []);

      const handleSaveSettings = async () => {
        setSettingsSaving(true);
        setSettingsError(null);
        try {
          const snapshot = await patchSettings(formToSettingsPatch(settingsForm));
          applySettingsSnapshot(snapshot);
          await reloadSchedulerStatus();
          triggerToast("Settings 已透過 Core API 儲存。");
        } catch (err) {
          const message = err.message || String(err);
          setSettingsError(message);
          triggerToast(`Settings 儲存失敗：${message}`);
        } finally {
          setSettingsSaving(false);
        }
      };

      const handleOnboardingDetectAgents = async () => {
        setOnboardingLoading(true);
        setOnboardingMessage("");
        try {
          await reloadAgentDetection({ quiet: true });
          setOnboardingStep(3);
          setOnboardingMessage("Agent detection 完成。");
        } catch (err) {
          setOnboardingMessage(`Agent detection 失敗：${err.message || String(err)}`);
        } finally {
          setOnboardingLoading(false);
        }
      };

      const handleOnboardingSaveRoots = async () => {
        const roots = multilineToList(onboardingRootsText);
        if (!roots.length) {
          setOnboardingMessage("請至少輸入一個 project root，或稍後到 Settings 修改。");
          return;
        }
        setOnboardingLoading(true);
        setOnboardingMessage("");
        try {
          const snapshot = await patchSettings({
            project_roots: roots,
            default_diary_agent: onboardingAgent,
            data_storage: onboardingStoragePath ? { desired_db_path: onboardingStoragePath } : undefined,
          });
          applySettingsSnapshot(snapshot);
          setOnboardingStep(4);
          setOnboardingMessage("Project roots 已儲存到 Core Settings。");
        } catch (err) {
          setOnboardingMessage(`儲存失敗：${err.message || String(err)}`);
        } finally {
          setOnboardingLoading(false);
        }
      };

      const handleOnboardingScan = async () => {
        setOnboardingLoading(true);
        setOnboardingMessage("");
        try {
          const body = await runGlobalScan({ range: 'all' });
          setDashSnapshot(body.dashboard);
          setSidebar24h(await fetchDashboard("24h"));
          const projectView = toProjectListView(body.projects);
          setProjects(projectView);
          setSelectedProjId((cur) => (projectView.some((p) => p.id === cur) ? cur : (projectView[0]?.id ?? null)));
          setOnboardingStep(5);
          setOnboardingMessage(`掃描完成：新增 ${body.scan.inserted_sessions} 個 sessions，找到 ${projectView.length} 個 projects。`);
        } catch (err) {
          setOnboardingMessage(`掃描失敗：${err.message || String(err)}`);
        } finally {
          setOnboardingLoading(false);
        }
      };

      const completeOnboarding = () => {
        window.localStorage.setItem('devdiary:onboarding-complete', 'true');
        setShowOnboarding(false);
        setCurrentPage('dashboard');
        triggerToast("DevDiary onboarding 已完成。");
      };

      const selectedProject = useMemo(() => {
        return projects.find(p => p.id === selectedProjId) || projects[0];
      }, [projects, selectedProjId]);

      // Selected Workspace range stats come from the same Core snapshot as Token Detail, Sessions, and diary.
      const workspaceProjectStats = useMemo(() => ({
        tokens: metricStrip.rangeTokens,
        sessions: metricStrip.rangeSessions,
      }), [metricStrip]);

      // Handle Theme Class Addition
      useEffect(() => {
        const rootElement = document.documentElement;
        if (themeMode === 'light') {
          rootElement.classList.add('light-mode');
        } else if (themeMode === 'dark') {
          rootElement.classList.remove('light-mode');
        } else if (themeMode === 'system') {
          const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
          if (prefersLight) {
            rootElement.classList.add('light-mode');
          } else {
            rootElement.classList.remove('light-mode');
          }
        }
      }, [themeMode]);

      // Filtered Projects list
      const filteredProjects = useMemo(() => {
        return projects.filter(p => {
          const matchesQuery = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.path.toLowerCase().includes(searchQuery.toLowerCase());
          const matchesStatus = statusFilter === "all" || p.status === statusFilter;
          return matchesQuery && matchesStatus;
        });
      }, [projects, searchQuery, statusFilter]);

      // Filtered Kanban Cards for the active project
      const filteredKanban = useMemo(() => {
        const seenAutoSession = new Set();
        return kanbanCards.filter(c => {
          if (c.projectId !== selectedProjId) return false;
          if (c.sourceRef?.startsWith('agent-synth://') && c.sourceRef.includes('/working-tree/')) return false;
          if (c.sourceRef?.startsWith('agent-synth://') && c.sourceRef.includes('/session/')) {
            const key = `${c.status}:${c.assignee}:session`;
            if (seenAutoSession.has(key)) return false;
            seenAutoSession.add(key);
          }
          return true;
        });
      }, [kanbanCards, selectedProjId]);

      const aiSyncText = (aiSync) => {
        if (!aiSync) return "";
        const parts = [`AI 自動加入 ${aiSync.inserted ?? 0} 張`, `更新 ${aiSync.updated ?? 0} 張`, `略過 ${aiSync.skipped ?? 0} 張`];
        const warningCount = aiSync.warnings?.length ?? 0;
        if (warningCount > 0) parts.push(`${warningCount} 則提醒`);
        return parts.join("、");
      };

      const selectedGitStatus = useMemo(() => toGitStatusView(projectDetail?.git_status), [projectDetail]);
      const projectDocFolderRules = useMemo(() => {
        return rowsToList(settingsForm.projectDocFolders ?? settingsForm.projectDocFoldersText)
          .map((folder) => folder.replace(/^\/+/, '').replace(/\/+$/, ''))
          .filter(Boolean);
      }, [settingsForm.projectDocFolders, settingsForm.projectDocFoldersText]);
      const docScanSource = (docName) => {
        const normalized = String(docName || '').replace(/^\/+/, '');
        return projectDocFolderRules.some((folder) => normalized === folder || normalized.startsWith(`${folder}/`)) ? 'folder' : 'filename';
      };

      // Diary blocks come from the Core snapshot (one block per date). Exact-date and
      // keyword filters combine on the returned candidates (spec §11 render order step 6).
      const diaryEntries = useMemo(() => {
        const source = projectDetail?.diary ?? [];
        const query = diaryQuery.trim().toLowerCase();
        return source.filter(entry => {
          const matchDate = !selectedDiaryDate || entry.date === selectedDiaryDate;
          const haystack = `${entry.title}\n${entry.markdown}`.toLowerCase();
          const matchQuery = !query || haystack.includes(query);
          return matchDate && matchQuery;
        });
      }, [projectDetail, diaryQuery, selectedDiaryDate]);

      const diaryEntriesByMonth = useMemo(() => {
        return diaryEntries.reduce((groups, entry) => {
          const key = monthLabel(entry.date);
          groups[key] = groups[key] || [];
          groups[key].push(entry);
          return groups;
        }, {});
      }, [diaryEntries]);

      const selectedDiaryEntry = useMemo(() => {
        if (!selectedDiaryEntryDate) return null;
        return (projectDetail?.diary || []).find((entry) => entry.date === selectedDiaryEntryDate) || null;
      }, [projectDetail, selectedDiaryEntryDate]);
      const hasDistinctProjectAiDraft = Boolean(!selectedDiaryEntryDate
        && projectDetail?.summary_source === "user"
        && typeof projectDetail?.summary_ai_draft_markdown === "string"
        && projectDetail.summary_ai_draft_markdown.trim()
        && projectDetail.summary_ai_draft_markdown.trim() !== editableLogText.trim());

      useEffect(() => {
        if (!selectedDiaryEntryDate || isLogEditing) return;
        const entry = (projectDetail?.diary || []).find((item) => item.date === selectedDiaryEntryDate);
        if (entry) setEditableLogText(entry.markdown || "");
      }, [projectDetail, selectedDiaryEntryDate, isLogEditing]);

      const selectDiaryEntryForEditing = (entry) => {
        setSelectedDiaryEntryDate(entry.date);
        setSelectedDiaryDate(entry.date);
        setEditableLogText(entry.markdown || "");
        setIsLogEditing(false);
        triggerToast(`${entry.date} 日記已載入左側摘要。`);
      };

      const resetToProjectSummary = () => {
        setSelectedDiaryEntryDate("");
        setEditableLogText(projectDetail?.summary_markdown || "");
        setIsLogEditing(false);
      };

      const applyDailyWriteResult = async (date, dailyDetail, fallbackMarkdown = "") => {
        let detail = dailyDetail;
        try {
          detail = await reloadSelectedProjectDetail({ resetEditor: false }) || dailyDetail;
        } catch {
          applyProjectDetail(dailyDetail);
        }
        const updatedEntry = (detail.diary || []).find((entry) => entry.date === date)
          || (dailyDetail.diary || []).find((entry) => entry.date === date);
        setSelectedDiaryEntryDate(date);
        setSelectedDiaryDate(date);
        setEditableLogText(updatedEntry?.markdown || fallbackMarkdown);
        setIsLogEditing(false);
      };

      const handleClearDiaryDateFilter = async () => {
        setSelectedDiaryDate("");
        setSelectedDiaryEntryDate("");
        setIsLogEditing(false);
        if (selectedProjId == null) {
          setEditableLogText(projectDetail?.summary_markdown || "");
          return;
        }
        try {
          await reloadSelectedProjectDetail({ resetEditor: true });
          triggerToast("已清除日期篩選，日記清單已回到目前 Workspace 範圍。");
        } catch {
          setEditableLogText(projectDetail?.summary_markdown || "");
        }
      };

      const handleDiaryDateFilterChange = (nextDate) => {
        setSelectedDiaryDate(nextDate);
        if (!nextDate) {
          handleClearDiaryDateFilter();
          return;
        }
        const entry = (projectDetail?.diary || []).find((item) => item.date === nextDate);
        if (entry) {
          setSelectedDiaryEntryDate(entry.date);
          setEditableLogText(entry.markdown || "");
          setIsLogEditing(false);
          triggerToast(`${entry.date} 日記已載入左側摘要。`);
          return;
        }
        setSelectedDiaryEntryDate(nextDate);
        setEditableLogText("");
        setIsLogEditing(false);
      };

      const runDashboardScan = async ({ auto = false } = {}) => {
        if (isAnyScanRunning) return;
        setIsScanRunning(true);
        setDashError(null);
        triggerToast(auto ? "DevDiary 已連上 Core，開始自動掃描本機 CLI 執行日誌..." : "開始透過 DevDiary Core 掃描本機 CLI 執行日誌...");
        try {
          const body = await runGlobalScan({
            range: dashRange,
            start: dashRange === "custom" ? dashboardCustomStartDate : "",
            end: dashRange === "custom" ? dashboardCustomEndDate : "",
          });
          // The Core response arrives only after both the scan and inline Kanban
          // AI sync finish. Keep duplicate actions disabled while snapshots reload,
          // but stop the scan spinner before those unrelated follow-up reads.
          setIsScanRunning(false);
          setIsScanRefreshing(true);
          if (body.background_scan) setSettingsSnapshot((current) => current ? { ...current, background_scan: body.background_scan } : current);
          setDashSnapshot(body.dashboard);
          const sidebarSnapshot = dashRange === "24h" ? body.dashboard : await fetchDashboard("24h");
          setSidebar24h(sidebarSnapshot);
          const projectView = toProjectListView(body.projects);
          setProjects(projectView);
          setSelectedProjId((cur) => (projectView.some((p) => p.id === cur) ? cur : (projectView[0]?.id ?? null)));
          if (selectedProjId != null) {
            const detail = await fetchProjectDetail(selectedProjId, workspaceRangeOptions);
            applyProjectDetail(detail);
          }
          const skipped = body.scan.skipped_projects?.length ?? 0;
          if (body.scan.ai_sync) setKanbanAiSyncSummary(body.scan.ai_sync);
          const aiPart = body.scan.ai_sync ? `，${aiSyncText(body.scan.ai_sync)}` : "";
          triggerToast(`${auto ? "自動掃描" : "掃描"}完成：新增 ${body.scan.inserted_sessions} 個 sessions、${body.scan.inserted_kanban_cards} 張基礎卡${aiPart}，跳過 ${skipped} 個專案。`);
        } catch (err) {
          const message = err.message || String(err);
          setDashError(message);
          triggerToast(`${auto ? "自動掃描" : "掃描"}失敗：${message}`);
        } finally {
          setIsScanRunning(false);
          setIsScanRefreshing(false);
        }
      };

      const handleRunScan = async () => {
        await runDashboardScan();
      };

      useEffect(() => {
        if (!shouldAutoScanOnStartup({
          alreadyStarted: autoScanStartedRef.current,
          isAnyScanRunning,
          settingsSnapshot,
          runtimeStatus,
        })) {
          return;
        }
        autoScanStartedRef.current = true;
        runDashboardScan({ auto: true });
      }, [isAnyScanRunning, settingsSnapshot, runtimeStatus, dashRange, dashboardCustomStartDate, dashboardCustomEndDate, selectedProjId, workspaceRangeOptions]);

      const handleProjectRescan = async () => {
        if (isAnyScanRunning || selectedProjId == null) return;
        setScanningProjectId(selectedProjId);
        setDetailError(null);
        triggerToast(`開始重新掃描 ${selectedProject?.name ?? "selected project"}...`);
        try {
          const body = await runProjectScan(selectedProjId, workspaceRangeOptions);
          if (body.background_scan) setSettingsSnapshot((current) => current ? { ...current, background_scan: body.background_scan } : current);
          setSidebar24h(body.dashboard);
          const projectView = toProjectListView(body.projects);
          setProjects(projectView);
          if (body.project_detail) {
            applyProjectDetail(body.project_detail);
          }
          const skipped = body.scan.skipped_projects?.length ?? 0;
          if (body.scan.ai_sync) setKanbanAiSyncSummary(body.scan.ai_sync);
          const aiPart = body.scan.ai_sync ? `，${aiSyncText(body.scan.ai_sync)}` : "";
          triggerToast(`專案重新掃描完成：新增 ${body.scan.inserted_sessions} 個 sessions、${body.scan.inserted_kanban_cards} 張基礎卡${aiPart}，跳過 ${skipped} 個專案。`);
        } catch (err) {
          const message = err.message || String(err);
          setDetailError(message);
          triggerToast(`重新掃描失敗：${message}`);
        } finally {
          setScanningProjectId(null);
        }
      };

      const handleKanbanAiSync = async () => {
        if (selectedProjId == null || kanbanAiSyncing) return;
        setKanbanAiSyncing(true);
        setDetailError(null);
        triggerToast("開始同步 AI Kanban 卡片...");
        try {
          const body = await runProjectKanbanAiSync(selectedProjId, workspaceRangeOptions);
          if (body.project_detail) applyProjectDetail(body.project_detail);
          setKanbanAiSyncSummary(body.ai_sync);
          triggerToast(`AI Kanban 同步完成：${aiSyncText(body.ai_sync)}。`);
        } catch (err) {
          const message = err.message || String(err);
          setDetailError(message);
          triggerToast(`AI Kanban 同步失敗：${message}`);
        } finally {
          setKanbanAiSyncing(false);
        }
      };

      // Drag Kanban Card Status
      const handleKanbanDrop = async (status) => {
        if (!draggedCardId || selectedProjId == null) return;
        const cardId = draggedCardId;
        try {
          const detail = await setKanbanCardStatus(selectedProjId, cardId, status, workspaceRangeOptions);
          applyProjectDetail(detail);
          const statusText = statusLabels[status] || status;
          triggerToast(`卡片已移動到 ${statusText}`);
        } catch (err) {
          triggerToast(`Kanban 更新失敗：${err.message || String(err)}`);
        } finally {
          setDraggedCardId(null);
          setDragOverStatus(null);
        }
      };

      const handleKanbanMove = async (cardId, status, event) => {
        event?.stopPropagation?.();
        if (selectedProjId == null) return;
        try {
          const detail = await setKanbanCardStatus(selectedProjId, cardId, status, workspaceRangeOptions);
          applyProjectDetail(detail);
          triggerToast(`卡片已移動到 ${statusLabels[status] || status}`);
        } catch (err) {
          triggerToast(`Kanban 更新失敗：${err.message || String(err)}`);
        }
      };

      const handleSaveLogs = async () => {
        if (selectedProjId == null) return;
        const markdown = editableLogText.trim();
        if (!markdown) {
          triggerToast("摘要內容不能空白；請輸入內容，或先按 AI 重新總結。");
          return;
        }
        const diaryDate = selectedDiaryEntryDate;
        setSummaryBusyAction("save");
        try {
          const detail = diaryDate
            ? await saveProjectDiaryEntry(selectedProjId, diaryDate, markdown, singleDayRangeOptions(diaryDate))
            : await saveProjectSummary(selectedProjId, markdown, workspaceRangeOptions);
          if (diaryDate) {
            await applyDailyWriteResult(diaryDate, detail, markdown);
          } else {
            applyProjectDetail(detail);
            setIsLogEditing(false);
            setEditableLogText(detail.summary_markdown || "");
          }
          triggerToast(diaryDate ? `${diaryDate} 日記已儲存到 Core。` : "專案摘要已儲存到 Core。");
        } catch (err) {
          triggerToast(`摘要儲存失敗：${err.message || String(err)}`);
        } finally {
          setSummaryBusyAction(null);
        }
      };

      const handleAiRegenerate = async () => {
        if (selectedProjId == null) return;
        const diaryDate = selectedDiaryEntryDate;
        setSummaryBusyAction("regenerate");
        try {
          const detail = diaryDate
            ? await regenerateProjectDiaryEntry(selectedProjId, diaryDate, singleDayRangeOptions(diaryDate))
            : await regenerateProjectSummary(selectedProjId, workspaceRangeOptions);
          if (diaryDate) {
            await applyDailyWriteResult(diaryDate, detail);
            triggerToast(`${diaryDate} 日記已由 Core 重新整理。`);
          } else if (detail.summary_source === "user") {
            applyProjectDetail(detail);
            triggerToast("AI 草稿已產生，手動摘要保持不變。");
          } else {
            applyProjectDetail(detail);
            setEditableLogText(detail.summary_markdown || "");
            triggerToast("AI 草稿已由 Core 更新。");
          }
        } catch (err) {
          triggerToast(`AI 重新總結失敗：${err.message || String(err)}`);
        } finally {
          setSummaryBusyAction(null);
        }
      };

      const handleAcceptAiDraft = async () => {
        if (selectedProjId == null) return;
        try {
          const detail = await acceptProjectSummaryDraft(selectedProjId, workspaceRangeOptions);
          applyProjectDetail(detail, { resetEditor: true });
          triggerToast("已接受 AI 草稿並更新摘要。");
        } catch (err) {
          triggerToast(`接受 AI 草稿失敗：${err.message || String(err)}`);
        }
      };

      const handleAddComment = async () => {
        if (!newCommentText.trim()) return;
        if (selectedProjId == null) return;
        try {
          const detail = await createProjectComment(selectedProjId, { content: newCommentText, tags: [newCommentTag] }, workspaceRangeOptions);
          applyProjectDetail(detail);
          clearCommentDraft(window.localStorage, selectedProjId);
          setNewCommentText("");
          triggerToast("成功新增一筆備忘錄。");
        } catch (err) {
          triggerToast(`新增留言失敗：${err.message || String(err)}`);
        }
      };

      const togglePinComment = async (commentId) => {
        const current = projectDetail?.comments?.find(c => c.id === commentId);
        if (!current || selectedProjId == null) return;
        try {
          const detail = await setProjectCommentPinned(selectedProjId, commentId, !current.pinned, workspaceRangeOptions);
          applyProjectDetail(detail);
          triggerToast("備忘錄置頂狀態已變更");
        } catch (err) {
          triggerToast(`置頂更新失敗：${err.message || String(err)}`);
        }
      };

      const deleteComment = async (commentId) => {
        if (selectedProjId == null) return;
        try {
          const detail = await removeProjectComment(selectedProjId, commentId, workspaceRangeOptions);
          applyProjectDetail(detail);
          triggerToast("留言已刪除");
        } catch (err) {
          triggerToast(`刪除留言失敗：${err.message || String(err)}`);
        }
      };

      // Toggle Agent Status Switch
      const toggleAgentActive = async (agentId) => {
        const currentCard = agents.find((agent) => agent.id === agentId);
        if (currentCard?.kind === 'custom') {
          try {
            const snapshot = await patchCustomAgent(agentId, { enabled: !currentCard.active });
            applySettingsSnapshot(snapshot);
            triggerToast(`Custom Agent: ${currentCard.name} ${!currentCard.active ? "已啟用" : "已停用"}`);
          } catch (err) {
            const message = err.message || String(err);
            setSettingsError(message);
            triggerToast(`Custom Agent 更新失敗：${message}`);
          }
          return;
        }
        if (!settingsSnapshot?.agents) {
          setAgents(prev => prev.map(a => {
            if (a.id === agentId) {
              const nextActive = !a.active;
              return { ...a, active: nextActive, status: nextActive ? "connected" : "disconnected" };
            }
            return a;
          }));
          return;
        }
        const nextAgents = settingsSnapshot.agents.map((agent) => (
          agent.id === agentId
            ? { id: agent.id, enabled: !agent.enabled, model: agent.model, reasoning: agent.reasoning }
            : { id: agent.id, enabled: agent.enabled, model: agent.model, reasoning: agent.reasoning }
        ));
        try {
          const snapshot = await patchSettings({ agents: nextAgents });
          applySettingsSnapshot(snapshot);
          const updated = snapshot.agents.find((agent) => agent.id === agentId);
          triggerToast(`Agent: ${updated?.display_name || agentId} ${updated?.enabled ? "已啟用" : "已停用"}`);
        } catch (err) {
          const message = err.message || String(err);
          setSettingsError(message);
          triggerToast(`Agent 設定更新失敗：${message}`);
        }
      };

      const updateAgentRuntimePreference = async (agentId, patch) => {
        if (!settingsSnapshot) {
          triggerToast("Settings 尚未載入，請稍後再試。");
          return;
        }
        try {
          if (agentId.startsWith('custom-')) {
            const nextCustomAgents = (settingsSnapshot.custom_agents || []).map((agent) => (
              agent.id === agentId ? { ...agent, ...patch } : agent
            ));
            const snapshot = await patchSettings({ custom_agents: nextCustomAgents });
            applySettingsSnapshot(snapshot);
            triggerToast("Custom Agent 模型設定已更新。");
            return;
          }

          const nextAgents = (settingsSnapshot.agents || []).map((agent) => (
            agent.id === agentId
              ? { id: agent.id, enabled: agent.enabled, model: patch.model ?? agent.model, reasoning: patch.reasoning ?? agent.reasoning }
              : { id: agent.id, enabled: agent.enabled, model: agent.model, reasoning: agent.reasoning }
          ));
          const snapshot = await patchSettings({ agents: nextAgents });
          applySettingsSnapshot(snapshot);
          triggerToast("Agent 模型設定已更新。");
        } catch (err) {
          const message = err.message || String(err);
          setSettingsError(message);
          triggerToast(`Agent 模型設定更新失敗：${message}`);
        }
      };

      const updateDiaryAgent = async (agentId) => {
        if (!settingsSnapshot) {
          triggerToast("Settings 尚未載入，請稍後再試。");
          return;
        }
        try {
          const snapshot = await patchSettings({ default_diary_agent: agentId || null });
          applySettingsSnapshot(snapshot);
          triggerToast(agentId ? "Diary Agent 已更新。" : "Diary Agent 已設為不指定。");
        } catch (err) {
          const message = err.message || String(err);
          setSettingsError(message);
          triggerToast(`Diary Agent 更新失敗：${message}`);
        }
      };

      const openProjectFolder = async () => {
        if (!selectedProject?.path) {
          triggerToast("目前沒有可開啟的專案路徑。");
          return;
        }
        const isTauriRuntime = Boolean(window.__TAURI_INTERNALS__) || window.location.protocol.startsWith('tauri');
        if (!isTauriRuntime) {
          triggerToast("目前 Web dev runtime 不能直接開 Finder；請在 macOS packaged app 裡使用。");
          return;
        }
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('open_project_folder', { path: selectedProject.path });
          triggerToast(`已在 Finder 中開啟 ${selectedProject.path}`);
        } catch (err) {
          triggerToast(`開啟 Finder 失敗：${err?.message || String(err)}`);
        }
      };

      const resetAgentWizard = () => {
        setWizardStep(1);
        setNewAgentName("");
        setNewAgentPath("");
        setNewAgentModel("Gemini-2.0-Flash");
        setNewAgentProbe(null);
        setAgentProbeRunning(false);
      };

      const closeAgentWizard = () => {
        setIsAddAgentOpen(false);
        resetAgentWizard();
      };

      const removeAgent = async (agentId) => {
        const agent = agents.find(a => a.id === agentId);
        if (!agent?.removable) {
          triggerToast("Canonical agents 只能停用，不能從 DevDiary 移除。");
          return;
        }
        try {
          const snapshot = await deleteCustomAgent(agentId);
          applySettingsSnapshot(snapshot);
          triggerToast(`已移除 ${agent.name}`);
        } catch (err) {
          const message = err.message || String(err);
          setSettingsError(message);
          triggerToast(`移除 Custom Agent 失敗：${message}`);
        }
      };

      // Add Agent wizard handle next
      const runCustomAgentProbe = async () => {
        setAgentProbeRunning(true);
        setNewAgentProbe(null);
        setSettingsError(null);
        try {
          const result = await probeCustomAgent({
            display_name: newAgentName,
            model: newAgentModel,
            executable_path: newAgentPath,
            probe_arg: '--version',
          });
          setNewAgentProbe(result);
          if (result.status === 'connected') {
            setWizardStep(4);
            triggerToast("Custom Agent probe 成功，可以保存。");
          } else {
            triggerToast(`Custom Agent probe 未通過：${result.error_message || 'unknown error'}`);
          }
        } catch (err) {
          const message = err.message || String(err);
          setNewAgentProbe({ status: 'failed', error_message: message });
          setSettingsError(message);
          triggerToast(`Custom Agent probe 失敗：${message}`);
        } finally {
          setAgentProbeRunning(false);
        }
      };

      const handleWizardNext = async () => {
        if (wizardStep === 1) {
          if (!newAgentName.trim()) {
            triggerToast("請輸入 Agent 服務名稱");
            return;
          }
          setWizardStep(2);
        } else if (wizardStep === 2) {
          if (!newAgentPath.trim()) {
            triggerToast("請指定執行指令或路徑");
            return;
          }
          setWizardStep(3);
          await runCustomAgentProbe();
        }
      };

      // Finish Add Agent
      const handleWizardFinish = async () => {
        if (newAgentProbe?.status !== 'connected') {
          triggerToast("必須先通過 Core safe probe 才能保存 Custom Agent。");
          return;
        }
        try {
          const snapshot = await createCustomAgent({
            display_name: newAgentName,
            model: newAgentModel,
            executable_path: newAgentPath,
            probe_arg: '--version',
          });
          applySettingsSnapshot(snapshot);
          closeAgentWizard();
          triggerToast(`成功保存 Custom Agent: ${newAgentName}`);
        } catch (err) {
          const message = err.message || String(err);
          setSettingsError(message);
          triggerToast(`保存 Custom Agent 失敗：${message}`);
        }
      };

      return (
        <div className={`mac-window ${currentPage === 'dashboard' ? 'dashboard-window' : ''} ${currentPage === 'projects' ? 'workspace-window' : ''}`}>
          {showOnboarding && (
            <div className="modal-overlay onboarding-overlay">
              <div className="modal-window onboarding-window">
                <div className="wizard-steps">
                  {['Welcome', 'Agents', 'Roots', 'Scan', 'Complete'].map((label, index) => (
                    <span key={label} className={`wizard-step-indicator ${onboardingStep === index + 1 ? 'active' : ''}`}>
                      {index + 1}. {label}
                    </span>
                  ))}
                </div>

                {onboardingStep === 1 && (
                  <div className="wizard-form">
                    <h3>Welcome to DevDiary</h3>
                    <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
                      DevDiary 會透過本機 Core API 讀取 CLI coding activity，所有設定都會保存到本機 app data。
                    </p>
                    <button className="btn btn-primary" onClick={() => setOnboardingStep(2)}>開始設定</button>
                  </div>
                )}

                {onboardingStep === 2 && (
                  <div className="wizard-form">
                    <h3>偵測 CLI Agents</h3>
                    <p style={{ color: 'var(--muted)' }}>先確認 Claude Code、Codex CLI、Antigravity CLI 的本機狀態。</p>
                    <button className="btn btn-primary" onClick={handleOnboardingDetectAgents} disabled={onboardingLoading}>
                      {onboardingLoading ? '偵測中...' : '開始偵測'}
                    </button>
                  </div>
                )}

                {onboardingStep === 3 && (
                  <div className="wizard-form">
                    <h3>Project Roots</h3>
                    <label>每行一個要掃描的根目錄</label>
                    <textarea
                      className="wizard-input ai-summary-editor"
                      rows={5}
                      value={onboardingRootsText}
                      onChange={(e) => setOnboardingRootsText(e.target.value)}
                      placeholder="/path/to/projects"
                    />
                    <label>預設 AI Diary Agent</label>
                    <select className="wizard-input" value={onboardingAgent} onChange={(e) => setOnboardingAgent(e.target.value)}>
                      {(settingsSnapshot?.agents || []).map((agent) => (
                        <option key={agent.id} value={agent.id}>{agent.display_name}</option>
                      ))}
                    </select>
                    <label>Data storage path</label>
                    <input
                      className="wizard-input"
                      value={onboardingStoragePath}
                      onChange={(e) => setOnboardingStoragePath(e.target.value)}
                    />
                    <button className="btn btn-primary" onClick={handleOnboardingSaveRoots} disabled={onboardingLoading}>
                      {onboardingLoading ? '儲存中...' : '儲存設定'}
                    </button>
                  </div>
                )}

                {onboardingStep === 4 && (
                  <div className="wizard-form">
                    <h3>掃描候選 Projects</h3>
                    <p style={{ color: 'var(--muted)' }}>使用剛剛儲存的 project roots 透過 Core 執行 read-only scan。</p>
                    <button className="btn btn-primary" onClick={handleOnboardingScan} disabled={onboardingLoading}>
                      {onboardingLoading ? '掃描中...' : '開始掃描'}
                    </button>
                  </div>
                )}

                {onboardingStep === 5 && (
                  <div className="wizard-form">
                    <h3>設定完成</h3>
                    <p style={{ color: 'var(--muted)' }}>你可以進入 Dashboard，也可以之後在 Settings 修改 roots、scheduler、agent 與 export 設定。</p>
                    <button className="btn btn-primary" onClick={completeOnboarding}>進入 Dashboard</button>
                  </div>
                )}

                {onboardingMessage && (
                  <div className={onboardingMessage.includes('失敗') || onboardingMessage.includes('請至少') ? 'settings-alert' : 'settings-hint'}>
                    {onboardingMessage}
                  </div>
                )}
              </div>
            </div>
          )}
          {/* Sidebar */}
          <div className="sidebar">
            <ul className="nav-list">
              <li className={`nav-item ${currentPage === 'dashboard' ? 'active' : ''}`} role="button" tabIndex="0" aria-label="儀表板首頁" onClick={() => setCurrentPage('dashboard')}>
                <svg className="nav-icon" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>
                <span aria-hidden="true">儀表板首頁</span>
              </li>
              <li className={`nav-item ${currentPage === 'projects' ? 'active' : ''}`} role="button" tabIndex="0" aria-label="工作區管理" onClick={() => setCurrentPage('projects')}>
                <svg className="nav-icon" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                <span aria-hidden="true">工作區管理</span>
              </li>
              <li className={`nav-item ${currentPage === 'agents' ? 'active' : ''}`} role="button" tabIndex="0" aria-label="CLI Agents" onClick={() => setCurrentPage('agents')}>
                <svg className="nav-icon" viewBox="0 0 24 24"><path d="M12 3l1.7 4.1L18 9l-4.3 1.9L12 15l-1.7-4.1L6 9l4.3-1.9L12 3z"/><path d="M5 14l.8 1.9L8 17l-2.2 1.1L5 20l-.8-1.9L2 17l2.2-1.1L5 14z"/><path d="M19 13l.8 1.9L22 16l-2.2 1.1L19 19l-.8-1.9L16 16l2.2-1.1L19 13z"/></svg>
                <span aria-hidden="true">CLI Agents</span>
              </li>
              <li className={`nav-item ${currentPage === 'settings' ? 'active' : ''}`} role="button" tabIndex="0" aria-label="偏好設定" onClick={() => setCurrentPage('settings')}>
                <svg className="nav-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                <span aria-hidden="true">偏好設定</span>
              </li>
            </ul>

            <div className="sidebar-footer">
              <div className="sidebar-footer-title" style={{ color: 'var(--accent-neon)', letterSpacing: '0.1em' }}>近24小時統計</div>
              <div className="footer-stat-row">
                <span>Token</span>
                <span style={{ color: 'var(--accent-neon)' }}>{sb24 ? formatTokens(sb24.token_total) : '—'}</span>
              </div>
              <div className="footer-stat-row">
                <span>Projects</span>
                <span style={{ color: 'var(--success)' }}>{sb24 ? sb24.active_project_count : '—'}/{projects.length}</span>
              </div>
              <div className="footer-stat-row">
                <span>Sessions</span>
                <span>{sb24 ? sb24.session_count : '—'}</span>
              </div>
              <div className="footer-stat-row">
                <span>更新</span>
                <span style={{ color: 'var(--muted)' }}>{sbScanLabel}</span>
              </div>
              <button className={`btn-scan ${scanActivity.busy ? 'scanning' : ''}`} onClick={handleRunScan} disabled={isAnyScanRunning} title={scanActivity.title}>
                <svg className={`nav-icon ${scanActivity.busy ? 'scanning-spinner' : ''}`} viewBox="0 0 24 24">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                </svg>
                <span>{scanActivity.label}</span>
              </button>
            </div>
          </div>

          {/* Main Area */}
          <div className="main-content">
            
            {/* 1. DASHBOARD PAGE */}
            {currentPage === 'dashboard' && (
              <React.Fragment>
                <div className="page-header">
                  <div className="page-title">
                    <h1>儀表板首頁 (Dashboard)</h1>
                    <p>追蹤本機所有 CLI Agents 於專案目錄下的活動指標與 Token 耗量</p>
                  </div>
                  <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className="time-range-selector">
                      <button
                        className={`time-range-btn${dashboardTimeRange === 'all' ? ' active' : ''}`}
                        onClick={() => { setDashboardTimeRange("all"); setDashboardCustomStartDate(""); setDashboardCustomEndDate(""); setIsDashboardDatePickerOpen(false); }}
                      >全部</button>
                      <button
                        className={`time-range-btn${dashboardTimeRange === '24h' ? ' active' : ''}`}
                        onClick={() => { setDashboardTimeRange("24h"); setIsDashboardDatePickerOpen(false); }}
                      >近24小時</button>
                      <button
                        className={`time-range-btn${dashboardTimeRange === '7d' ? ' active' : ''}`}
                        onClick={() => { setDashboardTimeRange("7d"); setIsDashboardDatePickerOpen(false); }}
                      >近7天</button>
                      <button
                        className={`time-range-btn${dashboardTimeRange === '1m' ? ' active' : ''}`}
                        onClick={() => { setDashboardTimeRange("1m"); setIsDashboardDatePickerOpen(false); }}
                      >近1個月</button>
                      <button
                        className={`time-range-btn${dashboardTimeRange === 'custom' ? ' active' : ''}`}
                        onClick={() => { setDashboardTimeRange("custom"); setIsDashboardDatePickerOpen(prev => !prev); }}
                      >
                        {dashboardCustomRangeLabel} {isDashboardDatePickerOpen ? '▲' : '▾'}
                      </button>
                      {isDashboardCustomRangeSet && (
                        <button
                          className="time-range-clear-btn"
                          onClick={() => {
                            setDashboardCustomStartDate("");
                            setDashboardCustomEndDate("");
                            setDashboardTimeRange("all");
                            setIsDashboardDatePickerOpen(false);
                          }}
                          aria-label="清除日期篩選"
                          title="清除日期篩選"
                        >✕</button>
                      )}
                    </div>
                    <button className="btn" onClick={handleRunScan} disabled={isAnyScanRunning}>
                      <svg className={`nav-icon ${scanActivity.busy ? 'scanning-spinner' : ''}`} viewBox="0 0 24 24"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                      <span>{scanActivity.actionLabel}</span>
                    </button>
                  </div>
                  {isDashboardDatePickerOpen && (
                    <div className="date-popover-tray" aria-label="自訂日期範圍">
                      <div className="custom-range-fields">
                        <label className="custom-range-field">
                          <span>從</span>
                          <input
                            className="custom-range-input"
                            type="date"
                            value={dashboardCustomStartDate}
                            max={dashboardCustomEndDate}
                            onChange={(event) => {
                              const nextStart = event.target.value;
                              setDashboardCustomStartDate(nextStart);
                              if (dashboardCustomEndDate && nextStart > dashboardCustomEndDate) {
                                setDashboardCustomEndDate(nextStart);
                              }
                            }}
                          />
                        </label>
                        <label className="custom-range-field">
                          <span>到</span>
                          <input
                            className="custom-range-input"
                            type="date"
                            value={dashboardCustomEndDate}
                            min={dashboardCustomStartDate}
                            onChange={(event) => {
                              const nextEnd = event.target.value;
                              setDashboardCustomEndDate(nextEnd);
                              if (dashboardCustomStartDate && nextEnd < dashboardCustomStartDate) {
                                setDashboardCustomStartDate(nextEnd);
                              }
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                <div className="page-body">
                  {dashError && (
                    <div className="panel" style={{ borderColor: 'var(--danger, #ef4444)', color: 'var(--danger, #ef4444)', padding: '10px 14px', marginBottom: '12px', fontSize: '13px' }}>
                      ⚠️ 無法從 Core API 取得儀表板資料：{dashError}。請確認 Core Engine 已啟動（cd core && npm start）。
                    </div>
                  )}
                  {dashLoading && !dashSnapshot && (
                    <div className="panel" style={{ padding: '10px 14px', marginBottom: '12px', fontSize: '13px', color: 'var(--muted)' }}>
                      ⏳ 正在從 Core API 載入儀表板資料…
                    </div>
                  )}
                  <div className="dashboard-grid">

                    {/* Metrics — 4 cards + donut chart */}
                    <div className="panel metric-card metric-card-primary">
                      <div className="metric-top">
                        <span>{rangeData.label} Token</span>
                        <svg className="metric-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8"/></svg>
                      </div>
                      <div className="metric-value">{rangeData.tokens}</div>
                      <div className={`metric-change ${rangeData.delta == null ? 'neutral' : rangeData.delta >= 0 ? 'up' : 'down'}`}>
                        <span>
                          {rangeData.delta == null
                            ? '— vs 上一區段'
                            : `${rangeData.delta >= 0 ? '↑' : '↓'} ${Math.abs(rangeData.delta)}% vs 上一區段`}
                        </span>
                      </div>
                    </div>

                    <div className="panel metric-card metric-card-secondary">
                      <div className="metric-top">
                        <span>活躍 Projects</span>
                        <svg className="metric-icon" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                      </div>
                      <div className="metric-value">{rangeData.activeProjects}<small>/{projects.length}</small></div>
                      <div className="metric-change neutral">
                        <span>● 本機連線</span>
                      </div>
                    </div>

                    <div className="panel metric-card metric-card-secondary">
                      <div className="metric-top">
                        <span>{rangeData.label} Sessions</span>
                        <svg className="metric-icon" viewBox="0 0 24 24"><polyline points="4 17 10 11 14 15 20 9"/><polyline points="14 9 20 9 20 15"/></svg>
                      </div>
                      <div className="metric-value">{rangeData.sessions}<small>次</small></div>
                      <div className="metric-change up">
                        <span>↑ 12%</span>
                      </div>
                    </div>

                    <div className="panel metric-card metric-card-secondary">
                      <div className="metric-top">
                        <span>主要 Agent</span>
                        <svg className="metric-icon" viewBox="0 0 24 24"><path d="M12 3l1.7 4.1L18 9l-4.3 1.9L12 15l-1.7-4.1L6 9l4.3-1.9L12 3z"/><path d="M5 14l.8 1.9L8 17l-2.2 1.1L5 20l-.8-1.9L2 17l2.2-1.1L5 14z"/><path d="M19 13l.8 1.9L22 16l-2.2 1.1L19 19l-.8-1.9L16 16l2.2-1.1L19 13z"/></svg>
                      </div>
                      <div className="metric-value" style={{ fontSize: '22px' }}>{rangeData.primary}</div>
                      <div className="metric-change neutral">
                        <span>{rangeData.pct} 佔比 ({rangeData.label})</span>
                      </div>
                    </div>

                    {/* Time-range Donut Chart Panel */}
                    <div className="panel donut-panel">
                      <div className="panel-head" style={{ marginBottom: '6px' }}>
                        <div className="panel-title" style={{ fontSize: '12px' }}>
                          <svg className="nav-icon" viewBox="0 0 24 24"><path d="M21.21 15.89A10 10 0 1 1 8 2.83M22 12A10 10 0 0 0 12 2v10z"/></svg>
                          <span>Agent Token 比例</span>
                        </div>
                        <span style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>{agentMix.label}</span>
                      </div>
                      <div className="donut-chart-wrap">
                        <DonutChart data={agentMix.data} total={agentMix.total} label={agentMix.label} />
                        <div className="donut-legend">
                          {agentMix.data.map(d => (
                            <div key={d.name} className="donut-legend-item">
                              <div className="donut-legend-dot" style={{ background: d.color }}></div>
                              <span className="donut-legend-name">{d.name}</span>
                              <span className="donut-legend-pct">{d.pct}% · {d.tokens}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="donut-context">
                        <div className="donut-context-item">
                          <span className="donut-context-label">目前區間</span>
                          <span className="donut-context-value">{rangeData.tokens}</span>
                        </div>
                        <div className="donut-context-item">
                          <span className="donut-context-label">比例來源</span>
                          <span className="donut-context-value">{agentMix.label}</span>
                        </div>
                      </div>
                    </div>

                    {/* Chart panel */}
                    <div className="panel chart-panel">
                      <div className="panel-head">
                        <div className="panel-title">
                          <svg className="nav-icon" viewBox="0 0 24 24"><path d="M3 3v18h18M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>
                          <span>Token 消耗量趨勢 ({rangeData.label})</span>
                        </div>
                        <div className="chart-toggles">
                          <button className={`pill-toggle ${chartFilter === 'all' ? 'active' : ''}`} onClick={() => setChartFilter("all")}>全部</button>
                          <button className={`pill-toggle ${chartFilter === 'claude-code' ? 'active' : ''}`} onClick={() => setChartFilter("claude-code")}>Claude Code</button>
                          <button className={`pill-toggle ${chartFilter === 'codex-cli' ? 'active' : ''}`} onClick={() => setChartFilter("codex-cli")}>Codex CLI</button>
                          <button className={`pill-toggle ${chartFilter === 'antigravity-cli' ? 'active' : ''}`} onClick={() => setChartFilter("antigravity-cli")}>Antigravity</button>
                        </div>
                      </div>
                      <TrendChart trend={dashView ? dashView.trend : []} axis={dashView ? dashView.trendAxis : null} filter={chartFilter} />
                      <div className="trend-legend">
                        <span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--model-total)', marginRight: 4 }} />總計</span>
                        <span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--model-claude)', marginRight: 4 }} />Claude Code</span>
                        <span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--model-codex)', marginRight: 4 }} />Codex CLI</span>
                        <span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--model-antigravity)', marginRight: 4 }} />Antigravity</span>
                        <span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--model-other)', marginRight: 4 }} />其他</span>
                      </div>
                    </div>

                    {/* Project concentration ranking */}
                    <div className="panel breakdown-panel">
                      <div className="panel-head">
                        <div className="panel-title">
                          <svg className="nav-icon" viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M7 16V9"/><path d="M12 16V5"/><path d="M17 16v-4"/></svg>
                          <span>專案集中度排行 ({rangeData.label})</span>
                        </div>
                        <span className="panel-kicker">Token share</span>
                      </div>
                      <div className="project-rank-list">
                        {projectConcentration.length > 0 ? projectConcentration.map((project, index) => (
                          <div className="project-rank-row" key={project.id}>
                            <div className="project-rank-head">
                              <span className="project-rank-name">{index + 1}. {project.name}</span>
                              <span className="project-rank-pct">{project.pct}%</span>
                            </div>
                            <div className="project-rank-track">
                              <div className="project-rank-fill" style={{ width: `${Math.max(2, project.pct)}%` }}></div>
                            </div>
                            <div className="project-rank-meta">
                              <span>{project.tokens}</span>
                              <span>{project.sessions} sessions</span>
                            </div>
                          </div>
                        )) : (
                          <div className="project-rank-empty">尚無可排行的 project token 資料。</div>
                        )}
                      </div>
                    </div>

                    {/* Heatmap Panel */}
                    <div className="panel heatmap-panel">
                      <div className="panel-head">
                        <div className="panel-title">
                          <svg className="nav-icon" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>
                          <span>AI 活躍熱力圖</span>
                        </div>
                      </div>

                      <div className="heatmap-container" style={{ paddingBottom: '4px' }}>
                        <div className="heatmap-days-labels">
                          <span></span>
                          <span>Mon</span>
                          <span></span>
                          <span>Wed</span>
                          <span></span>
                          <span>Fri</span>
                          <span></span>
                        </div>
                        <div className="heatmap-grid-wrapper">
                          <div
                            className="heatmap-months-labels"
                            style={{ gridTemplateColumns: `repeat(${Math.max(1, dashView?.heatmap?.totalWeeks ?? 1)}, minmax(10px, 1fr))` }}
                          >
                            {(dashView?.heatmap?.monthLabels ?? []).map((month) => (
                              <span key={`${month.label}-${month.column}`} style={{ gridColumnStart: month.column }}>{month.label}</span>
                            ))}
                          </div>
                          <div
                            className="heatmap-grid"
                            style={{ gridTemplateColumns: `repeat(${Math.max(1, dashView?.heatmap?.totalWeeks ?? 1)}, minmax(10px, 1fr))` }}
                          >
                            {(dashView?.heatmap?.cells ?? []).map((cell) => {
                              const levelClass = cell.intensity_level > 0 ? `level-${cell.intensity_level}` : "";
                              return (
                                <div
                                  key={cell.date}
                                  className={`heatmap-cell ${levelClass}`}
                                  style={{ gridColumnStart: cell.gridColumnStart, gridRowStart: cell.gridRowStart }}
                                  title={`${cell.date} · ${cell.session_count} sessions · ${cell.token_total.toLocaleString()} tokens`}
                                  onClick={() => triggerToast(
                                    `📅 ${cell.date}：${cell.session_count} 個 session、${cell.token_total.toLocaleString()} tokens、${cell.task_count} 項任務`,
                                  )}
                                />
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="heatmap-legend">
                        <span>Low</span>
                        <div className="legend-box" style={{ background: 'rgba(255,255,255,0.03)' }}></div>
                        <div className="legend-box level-1"></div>
                        <div className="legend-box level-2"></div>
                        <div className="legend-box level-3"></div>
                        <div className="legend-box level-4"></div>
                        <span>High</span>
                      </div>
                    </div>

                    {/* Summary Panel */}
                    <div className="panel summary-panel">
                      <div className="panel-head">
                        <div className="panel-title">
                          <svg className="nav-icon" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
                          <span>AI Global Summary List (智能日記撮要)</span>
                        </div>
                      </div>

                      <div className="summary-list">
                        {(dashView?.dailyHighlights ?? []).length > 0 ? (
                          dashView.dailyHighlights.map((item) => (
                            <div className="summary-item" key={`${item.date}-${item.kind}`}>
                              <span className={`summary-badge ${item.kind}`}>{item.label}</span>
                              <div className="summary-text">{item.text}</div>
                            </div>
                          ))
                        ) : (
                          <div className="summary-empty-state">
                            今日還沒有 Core daily highlight；執行 Daily Scheduler 或 Scan Now 後會顯示真實摘要。
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                </div>
              </React.Fragment>
            )}

            {/* 2. PROJECTS WORKSPACE PAGE */}
            {currentPage === 'projects' && (
              <div className="workspace-layout">
                {/* Left side list */}
                <div className="workspace-left">
                  <div className="panel-search-bar">
                    <div className="search-input-wrapper">
                      <svg className="search-icon-svg" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      <input 
                        type="text" 
                        className="search-input" 
                        placeholder="搜尋專案路徑或名稱..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                    <div className="filter-row">
                      <select className="select-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <option value="all">全部狀態</option>
                        <option value="active">作用中 (Active)</option>
                        <option value="idle">閒置 (Idle)</option>
                      </select>
                    </div>
                  </div>

                  <div className="project-list-items">
                    {filteredProjects.map((p) => (
                      <div 
                        key={p.id} 
                        className={`project-list-item ${selectedProjId === p.id ? 'selected' : ''}`}
                        onClick={() => { setSelectedProjId(p.id); setProjectTab("board"); }}
                      >
                        <div className="item-header">
                          <span className="item-title">{p.name}</span>
                          <span className={`item-status-dot ${p.status}`} />
                        </div>
                        <div className="item-meta">
                          <span>{p.logsCount} 筆日誌</span>
                          <span>Tokens: {p.tokensCount}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right side content */}
                <div className="workspace-right">
                  {projectsLoading ? (
                    <div className="workspace-empty-state">
                      <h3>載入專案中…</h3>
                      <p>正在從 Core API 取得專案列表。</p>
                    </div>
                  ) : projectsError ? (
                    <div className="workspace-empty-state">
                      <h3>無法載入專案</h3>
                      <p>{projectsError}</p>
                    </div>
                  ) : detailError ? (
                    <div className="workspace-empty-state">
                      <h3>無法載入專案詳情</h3>
                      <p>{detailError}</p>
                    </div>
                  ) : selectedProject ? (
                    <React.Fragment>
                      {/* Project Head */}
                      <div className="proj-detail-header">
                        <div className="proj-meta-info">
                          <div className="proj-title-row">
                            <h2>{selectedProject.name}</h2>
                            <span className={`status-badge ${selectedProject.status}`}>
                              {selectedProject.status === "active" ? "Active" : "Idle"}
                            </span>
                          </div>
                          <div className="proj-root-path">
                            <svg className="nav-icon" style={{ width: '12px', height: '12px' }} viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
                            <span>{selectedProject.path}</span>
                          </div>
                        </div>

                        <div className="proj-header-actions">
                          <div className="proj-actions-main">
                            <div className="time-range-selector" aria-label="Workspace 時間範圍">
                              <button
                                className={`time-range-btn${workspaceTimeRange === 'all' ? ' active' : ''}`}
                                onClick={() => { setWorkspaceTimeRange("all"); setWorkspaceCustomStartDate(""); setWorkspaceCustomEndDate(""); setIsWorkspaceDatePickerOpen(false); }}
                              >全部</button>
                              <button
                                className={`time-range-btn${workspaceTimeRange === '24h' ? ' active' : ''}`}
                                onClick={() => { setWorkspaceTimeRange("24h"); setIsWorkspaceDatePickerOpen(false); }}
                              >近24小時</button>
                              <button
                                className={`time-range-btn${workspaceTimeRange === '7d' ? ' active' : ''}`}
                                onClick={() => { setWorkspaceTimeRange("7d"); setIsWorkspaceDatePickerOpen(false); }}
                              >近7天</button>
                              <button
                                className={`time-range-btn${workspaceTimeRange === '1m' ? ' active' : ''}`}
                                onClick={() => { setWorkspaceTimeRange("1m"); setIsWorkspaceDatePickerOpen(false); }}
                              >近1個月</button>
                              <button
                                className={`time-range-btn${workspaceTimeRange === 'custom' ? ' active' : ''}`}
                                onClick={() => { setWorkspaceTimeRange("custom"); setIsWorkspaceDatePickerOpen(prev => !prev); }}
                              >
                                {isWorkspaceDatePickerOpen ? `${workspaceCustomRangeLabel} ▲` : `${workspaceCustomRangeLabel} ▾`}
                              </button>
                              {isWorkspaceCustomRangeSet && (
                                <button
                                  className="time-range-clear-btn"
                                  onClick={() => {
                                    setWorkspaceCustomStartDate("");
                                    setWorkspaceCustomEndDate("");
                                    setWorkspaceTimeRange("all");
                                    setIsWorkspaceDatePickerOpen(false);
                                  }}
                                  aria-label="清除 Workspace 日期篩選"
                                  title="清除日期篩選"
                                >✕</button>
                              )}
                            </div>
                            <span className="proj-last-activity">
                              <svg style={{ width: '11px', height: '11px', stroke: 'currentColor', strokeWidth: '2', fill: 'none' }} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                              <span>最後活動 12 分鐘前</span>
                            </span>
                            <button className="icon-btn" title="開啟資料夾" onClick={openProjectFolder}>
                              <svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                            </button>
                            <button
                              className="icon-btn"
                              title={scanningProjectId === selectedProjId ? "正在重新掃描專案" : "重新掃描專案"}
                              onClick={handleProjectRescan}
                              disabled={isAnyScanRunning || selectedProjId == null}
                            >
                              <svg className={scanningProjectId === selectedProjId ? 'scanning-spinner' : ''} viewBox="0 0 24 24"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                            </button>
                            <button className="btn btn-primary" onClick={handleSaveLogs}>儲存變更</button>
                          </div>
                          <div className="date-popover-tray">
                            {isWorkspaceDatePickerOpen && (
                              <div className="custom-range-fields" aria-label="Workspace 自訂日期範圍">
                                <label className="custom-range-field">
                                  <span>從</span>
                                  <input
                                    className="custom-range-input"
                                    type="date"
                                    value={workspaceCustomStartDate}
                                    max={workspaceCustomEndDate}
                                    onChange={(event) => {
                                      const nextStart = event.target.value;
                                      setWorkspaceCustomStartDate(nextStart);
                                      if (workspaceCustomEndDate && nextStart > workspaceCustomEndDate) {
                                        setWorkspaceCustomEndDate(nextStart);
                                      }
                                    }}
                                  />
                                </label>
                                <label className="custom-range-field">
                                  <span>到</span>
                                  <input
                                    className="custom-range-input"
                                    type="date"
                                    value={workspaceCustomEndDate}
                                    min={workspaceCustomStartDate}
                                    onChange={(event) => {
                                      const nextEnd = event.target.value;
                                      setWorkspaceCustomEndDate(nextEnd);
                                      if (workspaceCustomStartDate && nextEnd < workspaceCustomStartDate) {
                                        setWorkspaceCustomStartDate(nextEnd);
                                      }
                                    }}
                                  />
                                </label>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Project Metric Strip (spec §6.3 B / §11) — Core snapshot */}
                      <div className="proj-metric-strip">
                        <div className="proj-metric">
                          <span className="proj-metric-label">{workspaceRangeLabel} Token</span>
                          <span className="proj-metric-value">{workspaceProjectStats.tokens}</span>
                        </div>
                        <div className="proj-metric">
                          <span className="proj-metric-label">{workspaceRangeLabel} Sessions</span>
                          <span className="proj-metric-value">{workspaceProjectStats.sessions}<small>筆</small></span>
                        </div>
                        <div className="proj-metric">
                          <span className="proj-metric-label">今日 Token</span>
                          <span className="proj-metric-value">{metricStrip.today}</span>
                        </div>
                        <div className="proj-metric">
                          <span className="proj-metric-label">近7天 Token</span>
                          <span className="proj-metric-value">{metricStrip.week}</span>
                        </div>
                        <div className="proj-metric">
                          <span className="proj-metric-label">近1個月 Token</span>
                          <span className="proj-metric-value">{metricStrip.month}</span>
                        </div>
                        <div className="proj-metric ai-summary">
                          <span className="proj-metric-label">AI 摘要狀態</span>
                          <span className="proj-metric-value">{summaryStatusLabel(metricStrip.summaryStatus)}</span>
                        </div>
                      </div>

                      {/* Sticky Tabs Bar */}
                      <div className="proj-tabs-bar">
                        <button className={`proj-tab-btn ${projectTab === 'board' ? 'active' : ''}`} onClick={() => setProjectTab("board")}>Kanban 看板</button>
                        <button className={`proj-tab-btn ${projectTab === 'logs' ? 'active' : ''}`} onClick={() => setProjectTab("logs")}>自動日記摘要</button>
                        <button className={`proj-tab-btn ${projectTab === 'git' ? 'active' : ''}`} onClick={() => setProjectTab("git")}>git狀態</button>
                        <button className={`proj-tab-btn ${projectTab === 'comments' ? 'active' : ''}`} onClick={() => setProjectTab("comments")}>備忘錄留言</button>
                        <button className={`proj-tab-btn ${projectTab === 'docs' ? 'active' : ''}`} onClick={() => setProjectTab("docs")}>專案 Docs</button>
                        <button className={`proj-tab-btn ${projectTab === 'sessions' ? 'active' : ''}`} onClick={() => setProjectTab("sessions")}>Sessions</button>
                        <button className={`proj-tab-btn ${projectTab === 'tokens' ? 'active' : ''}`} onClick={() => setProjectTab("tokens")}>Token 明細</button>
                      </div>

                      {/* Tab Viewport */}
                      <div className="proj-tab-viewport">
                        
                        {/* TAB: BOARD */}
                        {projectTab === "board" && (
                          <div className="kanban-board-wrap">
                            <div className="kanban-ai-toolbar">
                              <div>
                                <strong>AI Kanban</strong>
                                <span>{kanbanAiSyncSummary ? aiSyncText(kanbanAiSyncSummary) : "可自動加入通過 Core gates 的卡片"}</span>
                              </div>
                              <button className="btn" onClick={handleKanbanAiSync} disabled={kanbanAiSyncing || selectedProjId == null}>
                                {kanbanAiSyncing ? "重新整理中..." : "重新整理卡片"}
                              </button>
                            </div>
                            <div className="kanban-grid">
                              {["todo", "in_progress", "done"].map(status => (
                                <div className="kanban-col" key={status}>
                                  <div className="kanban-col-head">
                                    <span>{statusLabels[status]}</span>
                                    <span className="kanban-count-badge">
                                      {filteredKanban.filter(c => c.status === status).length}
                                    </span>
                                  </div>
                                  <div
                                    className={`kanban-cards ${dragOverStatus === status ? 'drag-over' : ''}`}
                                    onDragOver={(event) => {
                                      event.preventDefault();
                                      setDragOverStatus(status);
                                    }}
                                    onDragLeave={() => setDragOverStatus(null)}
                                    onDrop={(event) => {
                                      event.preventDefault();
                                      handleKanbanDrop(status);
                                    }}
                                  >
                                    {filteredKanban.filter(c => c.status === status).map(c => (
                                      <div
                                        key={c.id}
                                        className={`kanban-card ${draggedCardId === c.id ? 'dragging' : ''}`}
                                        draggable
                                        onDragStart={(event) => {
                                          setDraggedCardId(c.id);
                                          event.dataTransfer.setData("text/plain", String(c.id));
                                          event.dataTransfer.effectAllowed = "move";
                                        }}
                                        onDragEnd={() => {
                                          setDraggedCardId(null);
                                          setDragOverStatus(null);
                                        }}
                                      >
                                        <div className="kanban-card-heading">
                                          <div className="kanban-card-title">{c.title}</div>
                                          <div className="kanban-card-badges">
                                            {c.aiAutoAdded && (
                                              <span
                                                className="kanban-ai-badge"
                                                title="這張卡由 AI 產生，已通過 Core validation、dedupe 與 redaction gates"
                                              >
                                                AI 自動加入
                                              </span>
                                            )}
                                            {c.manualStatusLock && (
                                              <span
                                                className="kanban-lock-badge"
                                                title="這張卡已被你手動移動，AI/自動掃描不會再改它的進度"
                                              >
                                                手動調整
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        <div className="kanban-card-desc">{c.desc}</div>
                                        <div className="kanban-card-meta">
                                          <span>{c.assignee}</span>
                                          <span className="kanban-card-actions">
                                            <button
                                              className="kanban-move-btn"
                                              title="移到前一欄"
                                              disabled={statusOrder.indexOf(c.status) <= 0}
                                              onClick={(event) => handleKanbanMove(c.id, statusOrder[Math.max(0, statusOrder.indexOf(c.status) - 1)], event)}
                                            >‹</button>
                                            <span className="kanban-card-drag-hint">拖拉</span>
                                            <button
                                              className="kanban-move-btn"
                                              title="移到後一欄"
                                              disabled={statusOrder.indexOf(c.status) >= statusOrder.length - 1}
                                              onClick={(event) => handleKanbanMove(c.id, statusOrder[Math.min(statusOrder.length - 1, statusOrder.indexOf(c.status) + 1)], event)}
                                            >›</button>
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                    {filteredKanban.filter(c => c.status === status).length === 0 && (
                                      <div className="kanban-empty-state">目前沒有這個狀態的卡片</div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* TAB: LOGS */}
                        {projectTab === "logs" && (
                          <div className="log-panel-split">
                            <div className="log-editor-container">
                              <div className="panel notion-summary-card">
                                <div className="notion-summary-head">
                                  <div className="notion-summary-title">
                                    <strong>{selectedDiaryEntryDate ? `${selectedDiaryEntryDate} 日記摘要` : "專案摘要"}</strong>
                                    <span>{selectedDiaryEntryDate ? "Daily diary entry" : "Project-level diary summary"}</span>
                                  </div>
                                  <div className="summary-edit-actions">
                                    {selectedDiaryEntryDate && (
                                      <button className="btn" onClick={resetToProjectSummary} disabled={summaryBusyAction}>回到專案摘要</button>
                                    )}
                                    {!isLogEditing && (
                                      <button className="icon-btn" title="編輯摘要" onClick={() => setIsLogEditing(true)}>
                                        <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                                      </button>
                                    )}
                                    {isLogEditing && (
                                      <React.Fragment>
                                        <button className="btn" onClick={handleAiRegenerate} disabled={!!summaryBusyAction}>
                                          <AgentGlyph />{summaryBusyAction === "regenerate" ? "整理中..." : "AI 重新總結"}
                                        </button>
                                        {hasDistinctProjectAiDraft && (
                                          <button className="btn" onClick={handleAcceptAiDraft} disabled={!!summaryBusyAction}>接受 AI 草稿</button>
                                        )}
                                        <button className="btn btn-primary" onClick={handleSaveLogs} disabled={!!summaryBusyAction}>
                                          {summaryBusyAction === "save" ? "儲存中..." : "儲存"}
                                        </button>
                                      </React.Fragment>
                                    )}
                                  </div>
                                </div>
                                {isLogEditing ? (
                                  <React.Fragment>
                                    <textarea
                                      className="ai-summary-editor"
                                      value={editableLogText}
                                      onChange={(e) => setEditableLogText(e.target.value)}
                                      placeholder="使用 Markdown 編輯摘要，例如 ## 標題、- 清單、`code`..."
                                    />
                                    <div className="markdown-hint">支援 ## / ### heading、- list、`inline code`，儲存後會回到閱讀狀態。</div>
                                  </React.Fragment>
                                ) : (
                                  <div className="markdown-preview">
                                    {renderMarkdown(editableLogText)}
                                  </div>
                                )}
                                {hasDistinctProjectAiDraft && (
                                  <div className="summary-draft-panel">
                                    <div className="summary-draft-head">
                                      <strong>AI 草稿</strong>
                                      <button className="btn" onClick={handleAcceptAiDraft}>接受 AI 草稿</button>
                                    </div>
                                    <div className="markdown-preview">
                                      {renderMarkdown(projectDetail.summary_ai_draft_markdown)}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div>
                              <div className="diary-toolbar">
                                <label className="diary-field">
                                  <span>日曆選擇</span>
                                  <input className="diary-input" type="date" value={selectedDiaryDate} onChange={(event) => handleDiaryDateFilterChange(event.target.value)} />
                                </label>
                                {selectedDiaryDate && (
                                  <button className="btn diary-clear-btn" onClick={handleClearDiaryDateFilter} title="清除日期篩選並回到專案摘要">
                                    清除
                                  </button>
                                )}
                                <label className="diary-field">
                                  <span>關鍵字搜尋</span>
                                  <input className="diary-input" type="search" value={diaryQuery} onChange={(event) => setDiaryQuery(event.target.value)} placeholder="搜尋 SQLite、UI、Token、blocker..." />
                                </label>
                              </div>
                              {Object.keys(diaryEntriesByMonth).length > 0 ? (
                                Object.entries(diaryEntriesByMonth).map(([month, entries]) => (
                                  <div className="diary-month-group" key={month}>
                                    <div className="diary-month-heading">{month}</div>
                                    {entries.map(entry => (
                                      <article
                                        className={`diary-day-block ${selectedDiaryEntryDate === entry.date ? 'active' : ''}`}
                                        key={entry.id}
                                        onClick={() => selectDiaryEntryForEditing(entry)}
                                      >
                                        <div className="diary-day-top">
                                          <div>
                                            <div className="diary-day-date">{entry.date}</div>
                                            <div style={{ color: 'var(--muted)', fontSize: '11px', marginTop: '4px' }}>{entry.title}</div>
                                          </div>
                                          <span className="agent-tag">{selectedDiaryEntryDate === entry.date ? "左側顯示中" : "點擊編輯"}</span>
                                        </div>
                                        <div className="markdown-preview">{renderMarkdown(entry.markdown)}</div>
                                      </article>
                                    ))}
                                  </div>
                                ))
                              ) : (
                                <div style={{ color: 'var(--muted)', fontSize: '12px', textAlign: 'center', padding: '24px', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)' }}>
                                  沒有符合日期或關鍵字的日記 block。
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* TAB: GIT STATUS */}
                        {projectTab === "git" && (
                          <div className="git-status-layout">
                            <div className="git-status-card">
                              <h3>Repository status</h3>
                              <div className="git-kv"><span>main</span><span>{selectedGitStatus.main}</span></div>
                              <div className="git-kv"><span>branch</span><span>{selectedGitStatus.branch}</span></div>
                              <div className="git-kv"><span>relationship</span><span>{selectedGitStatus.relation}</span></div>
                              <div className="git-kv"><span>working tree</span><span>{selectedGitStatus.workingTree}</span></div>
                              <div className="git-kv"><span>worktrees</span><span>{selectedGitStatus.worktrees.length} linked</span></div>
                              <div className="git-kv"><span>upstream</span><span>{selectedGitStatus.upstreamHealth}</span></div>
                              <div className="worktree-list" aria-label="Git worktrees">
                                {selectedGitStatus.worktrees.map((tree) => (
                                  <div className="worktree-row" key={`${tree.name}-${tree.branch}`}>
                                    <div className="worktree-row-info">
                                      <strong>{tree.name}</strong>
                                      <span className="worktree-branch">
                                        <svg className="worktree-branch-icon" viewBox="0 0 24 24">
                                          <line x1="6" y1="3" x2="6" y2="15"/>
                                          <circle cx="18" cy="6" r="3"/>
                                          <circle cx="6" cy="18" r="3"/>
                                          <path d="M18 9a9 9 0 0 1-9 9"/>
                                        </svg>
                                        {tree.branch}
                                      </span>
                                    </div>
                                    <span className="worktree-dot" title="已連結"></span>
                                  </div>
                                ))}
                              </div>
                              <div className="git-diff-grid">
                                <div className="git-diff-stat"><strong>+{selectedGitStatus.diff.added}</strong><span>added lines</span></div>
                                <div className="git-diff-stat"><strong>{selectedGitStatus.diff.changed}</strong><span>changed lines</span></div>
                                <div className="git-diff-stat"><strong>-{selectedGitStatus.diff.deleted}</strong><span>deleted lines</span></div>
                              </div>
                            </div>
                            <div className="git-status-card">
                              <h3>Commit graph</h3>
                              <div className="commit-graph">
                                {selectedGitStatus.commits.map(commit => (
                                  <div className="commit-row" key={commit.hash}>
                                    <div className="commit-dot">{commit.hash.slice(0, 2)}</div>
                                    <div>
                                      <div className="commit-title">{commit.title}</div>
                                      <div className="commit-meta">{commit.hash} · {commit.author} · {commit.time}</div>
                                    </div>
                                    <span className="commit-badge">{commit.tag}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* TAB: TOKENS — Core token_detail snapshot, cost hidden in v1 (spec §11) */}
                        {projectTab === "tokens" && (
                          <div className="token-breakdown-container">
                            {(() => {
                              const td = projectDetail?.token_detail || { rows: [], by_agent: [], by_model: [] };
                              const agentMax = Math.max(1, ...td.by_agent.map(e => e.token_total));
                              const modelMax = Math.max(1, ...td.by_model.map(e => e.token_total));
                              return (
                                <div className="token-breakdown-grid">
                                  <div className="token-chart-card">
                                    <div className="token-chart-title">
                                      <span>📊 依 Agent 分布</span>
                                      <small>{workspaceRangeLabel} tokens</small>
                                    </div>
                                    {td.by_agent.map(({ key, token_total }) => (
                                      <div key={key} className="token-bar-row">
                                        <span className="token-bar-label">{key}</span>
                                        <div className="token-bar-track">
                                          <div className="token-bar-fill" style={{ width: `${(token_total / agentMax) * 100}%` }}></div>
                                        </div>
                                        <span className="token-bar-value">{token_total.toLocaleString()}</span>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="token-chart-card">
                                    <div className="token-chart-title">
                                      <span>🧠 依 Model 分布</span>
                                      <small>{workspaceRangeLabel} tokens</small>
                                    </div>
                                    {td.by_model.map(({ key, token_total }) => (
                                      <div key={key} className="token-bar-row">
                                        <span className="token-bar-label">{key}</span>
                                        <div className="token-bar-track">
                                          <div className="token-bar-fill purple" style={{ width: `${(token_total / modelMax) * 100}%` }}></div>
                                        </div>
                                        <span className="token-bar-value">{token_total.toLocaleString()}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
                            <div className="panel" style={{ padding: 'var(--space-4)' }}>
                              <table className="token-table">
                                <thead>
                                  <tr>
                                    <th>掃描日期</th>
                                    <th>呼叫 CLI Agent</th>
                                    <th>輸入 Tokens</th>
                                    <th>輸出 Tokens</th>
                                    <th>合計 Tokens</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(projectDetail?.token_detail?.rows || []).map(t => (
                                    <tr key={t.id}>
                                      <td>{t.date}</td>
                                      <td>{t.agent_name}</td>
                                      <td>{t.token_input.toLocaleString()}</td>
                                      <td>{t.token_output.toLocaleString()}</td>
                                      <td style={{ color: 'var(--accent-neon)', fontWeight: '600' }}>{t.token_total.toLocaleString()}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* TAB: COMMENTS */}
                        {projectTab === "comments" && (
                          <div className="comments-tab-layout">
                            {/* Input Form */}
                            <div className="comment-input-area">
                              <label style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>新增手動註記 / 留言</label>
                              <textarea 
                                className="comment-textarea" 
                                placeholder="輸入給 Agent 的提醒、開發靈感，或是本專案的特別標記..." 
                                value={newCommentText}
                                onChange={(e) => setNewCommentText(e.target.value)}
                              />
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>標籤分類:</span>
                                  <select className="select-filter" style={{ width: '100px' }} value={newCommentTag} onChange={(e) => setNewCommentTag(e.target.value)}>
                                    <option value="Global">Global</option>
                                    <option value="UI/UX">UI/UX</option>
                                    <option value="Bug">Bug</option>
                                    <option value="Feature">Feature</option>
                                    <option value="Info">Info</option>
                                  </select>
                                </div>
                                <button className="btn btn-primary" onClick={handleAddComment}>新增留言備忘</button>
                              </div>
                            </div>

                            {/* Category Filter (spec §6.3 G) */}
                            <div className="comment-filter-row">
                              {[
                                { key: 'all', label: '全部' },
                                { key: 'global', label: '🌐 Global' },
                                { key: 'project', label: '📁 本專案' },
                                { key: 'pinned', label: '📌 置頂' },
                                { key: 'UI/UX', label: 'UI/UX' },
                                { key: 'Bug', label: 'Bug' },
                                { key: 'Feature', label: 'Feature' },
                                { key: 'Info', label: 'Info' },
                              ].map(f => (
                                <button
                                  key={f.key}
                                  className={`comment-filter-pill ${commentFilter === f.key ? 'active' : ''}`}
                                  onClick={() => setCommentFilter(f.key)}
                                >
                                  {f.label}
                                </button>
                              ))}
                            </div>

                            {/* Comments Cards */}
                            <div className="comments-grid">
                              {(projectDetail?.comments || []).filter(c => {
                                if (commentFilter === 'all') return true;
                                if (commentFilter === 'pinned') return c.pinned;
                                const tags = Array.isArray(c.tags) ? c.tags : [];
                                if (commentFilter === 'global') return tags.includes('Global');
                                if (commentFilter === 'project') return !tags.includes('Global');
                                if (['UI/UX', 'Bug', 'Feature', 'Info'].includes(commentFilter)) return tags.includes(commentFilter);
                                return true;
                              }).map(c => (
                                <div key={c.id} className={`comment-card ${c.pinned ? 'pinned' : ''}`}>
                                  <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                      <span className="agent-tag" style={{ background: c.tags?.[0] === 'Bug' ? 'var(--danger-glow)' : 'var(--accent-glow)', color: c.tags?.[0] === 'Bug' ? 'var(--danger)' : 'var(--accent-neon)' }}>
                                        {c.tags?.[0] || 'Info'}
                                      </span>
                                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <button className={`pin-btn ${c.pinned ? 'pinned' : ''}`} onClick={() => togglePinComment(c.id)} title="置頂留言">
                                          置頂
                                        </button>
                                        <button className="pin-btn danger" onClick={() => deleteComment(c.id)} title="刪除留言">
                                          刪除
                                        </button>
                                      </div>
                                    </div>
                                    <div className="comment-body">{c.content}</div>
                                  </div>
                                  <div className="comment-meta-row">
                                    <span>建立於 {formatTs(c.created_at)}</span>
                                    <span>● Core 已儲存</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* TAB: DOCS */}
                        {projectTab === "docs" && (
                          <div className="docs-tab-shell">
                            <label className="docs-search-control">
                              <span>搜尋文件</span>
                              <input value={docsQuery} onChange={(event) => setDocsQuery(event.target.value)} placeholder="依檔名或內容搜尋" aria-label="依檔名或內容搜尋專案文件" />
                            </label>
                            {groupedDocs.length > 0 ? groupedDocs.map((group) => (
                              <section className="docs-path-group" key={group.name}>
                                <h3>{group.name}</h3>
                                <div className="docs-tab-grid">
                                  {group.docs.map(doc => (
                                    <div key={doc.id} className="doc-summary-card" onClick={() => setActiveDocPreview(doc)}>
                                      <h3>
                                        <svg className="nav-icon" style={{ width: '16px', height: '16px' }} viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
                                        <span>{doc.name}</span>
                                      </h3>
                                      <div className={`doc-source-badge ${docScanSource(doc.name)}`}>{docScanSource(doc.name) === 'folder' ? '資料夾全掃描' : '特定檔名掃描'}</div>
                                      <div className="doc-summary-content">{doc.content.split('\n')[1] || "無細節摘要"}</div>
                                      <div style={{ fontSize: '11px', color: 'var(--accent-neon)', marginTop: '12px', textAlign: 'right', fontWeight: '500' }}>點擊預覽全文 ›</div>
                                    </div>
                                  ))}
                                </div>
                              </section>
                            )) : <div className="doc-empty-state">{(projectDetail?.docs || []).length ? '沒有符合搜尋條件的文件。' : '目前還沒有掃描到專案主文件；到 Settings 設定特定檔名或資料夾全掃描後重新掃描此專案。'}</div>}
                          </div>
                        )}

                        {/* TAB: SESSIONS */}
                        {projectTab === "sessions" && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            {(projectDetail?.sessions?.length || 0) > 0 ? (
                              projectDetail.sessions.map(s => (
                                <div key={s.id} className="panel" style={{ padding: 'var(--space-4)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                      <span className="agent-tag" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--fg)' }}>Session #{s.id}</span>
                                      <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--accent-neon)' }}>{s.command || '—'}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{formatTs(s.start_time)}</span>
                                      <span className={`status-badge ${s.status === 'completed' || s.status === 'success' ? 'active' : 'idle'}`} style={{ textTransform: 'capitalize' }}>
                                        {s.status}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="session-excerpt-panel">
                                    <div className="session-excerpt-meta">
                                      <span>耗時: {formatDuration(s.duration)}</span>
                                      <span>Tokens: {formatTokens(s.token_total)}</span>
                                    </div>
                                    <pre className="session-excerpt-text">
                                      {s.excerpt || '此 session 無 redacted log 摘要。'}
                                    </pre>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div style={{ color: 'var(--muted)', fontSize: '12px', textAlign: 'center', padding: '40px', background: 'rgba(255,255,255,0.01)', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)' }}>
                                無本機 CLI 執行對話歷史 Session 紀錄。
                              </div>
                            )}
                          </div>
                        )}

                      </div>
                    </React.Fragment>
                  ) : (
                    <div className="workspace-empty-state">
                      <svg className="empty-state-icon" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                      <h3>尚未選取專案</h3>
                      <p>請從左側列表點選任一專案目錄以開啟工作區監控面版。</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 3. AGENTS PAGE */}
            {currentPage === 'agents' && (
              <React.Fragment>
                <div className="page-header">
                  <div className="page-title">
                    <h1>CLI Coding Agents (AI 命令行代理)</h1>
                    <p>管理並偵測已在您的 macOS 下註冊或安裝的 Coding CLI 環境</p>
                  </div>
                  <div className="header-actions">
                    <button className="btn" onClick={() => setIsAddAgentOpen(true)}>
                      <span>新增 Agent</span>
                    </button>
                    <button className="btn btn-primary" onClick={() => reloadAgentDetection()} disabled={agentDetectionLoading}>
                      <span>{agentDetectionLoading ? '偵測中...' : '重新偵測'}</span>
                    </button>
                  </div>
                </div>

                <div className="page-body">
                  <section className="agent-config-strip">
                    <div>
                      <div className="settings-kicker">Diary Agent</div>
                      <h3>預設用哪個 Agent 產生日記</h3>
                      <p>Workspace AI 重新總結、Daily diary regenerate 與 scheduler 會先看這裡；未支援的 Agent 會自動 fallback，不會破壞手動摘要。</p>
                    </div>
                    <select
                      className="wizard-input agent-diary-select"
                      value={settingsSnapshot?.default_diary_agent || ''}
                      onChange={(e) => updateDiaryAgent(e.target.value)}
                      aria-label="Default diary agent"
                    >
                      <option value="">不指定</option>
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id} disabled={!agent.diaryCapability?.supported}>
                          {agent.name}{agent.kind === 'custom' ? ' (Custom)' : ''}{agent.diaryCapability?.supported ? '' : '（尚未支援 Diary Agent）'}
                        </option>
                      ))}
                    </select>
                  </section>
                  <div className="agents-grid">
                    {agents.map(ag => {
                      const modelOptions = DEFAULT_AGENT_MODEL_OPTIONS[ag.id] || ['Default (CLI config)'];
                      const visibleModelOptions = ag.kind === 'canonical' && ag.model && !modelOptions.includes(ag.model)
                        ? [ag.model, ...modelOptions]
                        : modelOptions;
                      return (
                      <div key={ag.id} className="agent-card">
                        <div>
                          <div className="agent-card-header">
                            <div className="agent-card-title">
                              <h3><AgentGlyph />{ag.name}</h3>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span className={`status-badge ${ag.status === 'connected' ? 'active' : 'idle'}`}>
                                {ag.status === 'connected' ? 'Connected' : 'Offline'}
                              </span>
                              <button
                                className="agent-delete-btn"
                                onClick={() => removeAgent(ag.id)}
                                title={ag.removable ? `移除 ${ag.name}` : `${ag.name} 可停用，但不可移除`}
                              >
                                <svg viewBox="0 0 24 24" style={{ width: '13px', height: '13px', stroke: 'currentColor', strokeWidth: '2', fill: 'none' }}>
                                  <polyline points="3 6 5 6 21 6"/>
                                  <path d="M19 6l-1 14H6L5 6"/>
                                  <path d="M10 11v6M14 11v6"/>
                                  <path d="M9 6V4h6v2"/>
                                </svg>
                              </button>
                            </div>
                          </div>

                          <div className="agent-card-body">
                            <div className="agent-path-row">
                              <span>偵測狀態</span>
                              <span style={{ color: ag.status === 'connected' ? 'var(--success)' : 'var(--muted)' }}>
                                {ag.status === 'connected' ? '可用' : '未偵測'}
                              </span>
                            </div>
                            {ag.kind === 'canonical' && (
                              <div className="agent-source-controls">
                                <details>
                                  <summary>CLI 執行檔</summary>
                                  <p className="agent-source-help">這是 DevDiary 用來確認 CLI 已安裝、並在需要時呼叫 CLI 的執行檔，不是 Terminal app。</p>
                                  <div className="agent-path-row"><span>目前模式</span><span>{ag.sourceStatus?.executable?.mode === 'custom' ? '自訂' : '自動偵測'}</span></div>
                                  <div className="agent-path-row agent-path-wrap"><span>Version</span><span>{ag.version || '—'}</span></div>
                                  <div className="agent-path-row agent-path-wrap"><span>實際使用</span><span>{ag.sourceStatus?.executable?.resolved_path || '未找到執行檔'}</span></div>
                                  <input id={`agent-executable-${ag.id}`} className="wizard-input" defaultValue={ag.sources?.executable?.configured_path || ''} placeholder="輸入絕對 executable path" />
                                  <div className="settings-actions">
                                    <button className="btn" onClick={() => pickAgentSourcePath(ag, 'file')}>選擇執行檔</button>
                                    <button className="btn btn-primary" onClick={() => saveAgentExecutableSource(ag, 'custom')}>測試並儲存</button>
                                    <button className="btn" onClick={() => saveAgentExecutableSource(ag, 'auto')}>恢復自動偵測</button>
                                  </div>
                                </details>
                                <section className="agent-source-section" aria-label={`${ag.name} 活動記錄資料夾`}>
                                  <div className="agent-source-title-row">
                                    <div>
                                      <strong>活動記錄資料夾</strong>
                                      <span className="agent-mode-status">目前：{ag.sourceStatus?.activity_logs?.mode === 'custom' ? '只用自訂' : ag.sourceStatus?.activity_logs?.mode === 'auto_plus_custom' ? '自動＋自訂' : '自動偵測'}</span>
                                    </div>
                                    <div className="agent-mode-actions" role="group" aria-label="活動記錄資料夾模式">
                                      <button className={`btn ${ag.sourceStatus?.activity_logs?.mode === 'auto_plus_custom' ? 'btn-primary' : ''}`} onClick={() => saveAgentLogRoots(ag, 'auto_plus_custom')}>自動＋自訂（建議）</button>
                                      <button className={`btn ${ag.sourceStatus?.activity_logs?.mode === 'custom' ? 'btn-primary' : ''}`} onClick={() => saveAgentLogRoots(ag, 'custom')}>只用自訂</button>
                                      <button className={`btn ${ag.sourceStatus?.activity_logs?.mode === 'auto' ? 'btn-primary' : ''}`} onClick={() => saveAgentLogRoots(ag, 'auto')}>恢復自動偵測</button>
                                    </div>
                                  </div>
                                  <p className="agent-source-help">設定 product data root；Core 會依 Agent 規則衍生實際掃描位置。即使 CLI 執行檔未找到，只要資料夾可讀仍可掃描既有資料。</p>
                                  <div className="agent-data-root-list">
                                    {rootsForAgent(ag).map((root, index) => (
                                      <div className="path-row" key={`${ag.id}-root-${index}`}>
                                        <input className="wizard-input path-row-input" value={root} onChange={(e) => changeAgentLogRow(ag, 'update', index, e.target.value)} placeholder="product data root，例如 ~/.codex" aria-label={`${ag.name} data root ${index + 1}`} />
                                        <button className="icon-btn path-row-btn" type="button" title="選擇資料夾" onClick={() => pickAgentSourcePath(ag, 'directory', index)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg></button>
                                        <button className="icon-btn path-row-btn danger" type="button" title="刪除此列" onClick={() => changeAgentLogRow(ag, 'remove', index)}>×</button>
                                      </div>
                                    ))}
                                    <button className="btn path-add-btn" type="button" onClick={() => changeAgentLogRow(ag, 'add')}>＋ 新增路徑</button>
                                  </div>
                                  <div className="agent-source-readonly-group">
                                    <strong>Product data roots（Core 讀取狀態）</strong>
                                    {(ag.sourceStatus?.activity_logs?.resolved_data_roots || []).map((root) => <div key={root.path} className="agent-path-row agent-path-wrap"><span>{root.source === 'default' ? '預設 root' : '自訂 root'}</span><span>{root.path} · {root.readable ? '可讀' : root.warning || '不可讀'}</span></div>)}
                                  </div>
                                  <details className="agent-derived-locations">
                                    <summary>Core 實際衍生掃描位置（{(ag.sourceStatus?.activity_logs?.derived_scan_locations || []).length}）</summary>
                                    <p className="agent-source-help">這些是由 product data root 與 Project Roots 算出的唯讀位置，不需要也不能在此直接編輯。</p>
                                    {(ag.sourceStatus?.activity_logs?.derived_scan_locations || []).map((location) => (
                                      <div key={`${location.role}-${location.project_id}-${location.encoding_variant}-${location.path}`} className="agent-path-row agent-path-wrap">
                                        <span>{location.role}{location.project_root ? ` · ${location.encoding_variant}` : ''}</span>
                                        <span>{location.path} · {location.readable ? '可讀' : location.warning || '不可讀'}</span>
                                      </div>
                                    ))}
                                  </details>
                                </section>
                              </div>
                            )}
                            <div className="agent-path-row">
                              <span>設定狀態</span>
                              <span style={{ color: ag.active ? 'var(--success)' : 'var(--muted)' }}>
                                {ag.active ? "Settings 已啟用" : "Settings 已停用"}
                              </span>
                            </div>
                            <div className="agent-preference-panel">
                              <label>
                                <span>Model</span>
                                {ag.kind === 'canonical' ? (
                                  <select
                                    className="wizard-input"
                                    value={ag.model || 'Default (CLI config)'}
                                    onChange={(e) => updateAgentRuntimePreference(ag.id, { model: e.target.value })}
                                  >
                                    {visibleModelOptions.map((model) => (
                                      <option key={model} value={model}>{model}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    className="wizard-input"
                                    defaultValue={ag.model || ''}
                                    onBlur={(e) => updateAgentRuntimePreference(ag.id, { model: e.target.value })}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') e.currentTarget.blur();
                                    }}
                                    placeholder="例如 qwen3.6:27b"
                                  />
                                )}
                              </label>
                              <label>
                                <span>Reasoning</span>
                                <select
                                  className="wizard-input"
                                  value={ag.reasoning || 'default'}
                                  onChange={(e) => updateAgentRuntimePreference(ag.id, { reasoning: e.target.value })}
                                >
                                  {REASONING_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                                </select>
                              </label>
                            </div>
                            {ag.detectionError && (
                              <div className="agent-detection-error">{ag.detectionError}</div>
                            )}
                            {ag.checkedAt && (
                              <div className="agent-checked-at">checked {formatTs(ag.checkedAt)}</div>
                            )}
                          </div>
                        </div>

                        <div className="agent-status-toggle">
                          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>啟用自動背景日誌掃描</span>
                          <label className="switch">
                            <input 
                              type="checkbox" 
                              checked={ag.active}
                              onChange={() => toggleAgentActive(ag.id)}
                            />
                            <span className="slider"></span>
                          </label>
                        </div>
                      </div>
                    )})}
                  </div>
                </div>
              </React.Fragment>
            )}

            {/* 4. SETTINGS PAGE */}
            {currentPage === 'settings' && (
              <React.Fragment>
                <div className="page-header">
                  <div className="page-title">
                    <h1>偏好與系統設定 (Settings)</h1>
                    <p>變更 DevDiary Core process、in-app scheduler 與日記 UI 外觀設定</p>
                  </div>
                </div>

                <div className="page-body">
                  <SettingsView 
                    settings={settingsSnapshot}
                    form={settingsForm}
                    setForm={setSettingsForm}
                    loading={settingsLoading}
                    saving={settingsSaving}
                    error={settingsError}
                    onReload={reloadSettings}
                    onSave={handleSaveSettings}
                    runtimeHealth={runtimeHealth}
                    runtimeStatus={runtimeStatus}
                    schedulerStatus={schedulerStatus}
                    schedulerRunning={schedulerRunning}
                    onRunDailyScheduler={handleRunDailyScheduler}
                    dailyExporting={dailyExporting}
                    backupExporting={backupExporting}
                    onDailyMarkdownExport={handleDailyMarkdownExport}
                    onRedactedBackupExport={handleRedactedBackupExport}
                    themeMode={themeMode}
                    setThemeMode={setThemeMode}
                    projectPaths={projects.map((project) => project.path)}
                    settingsRefreshNotice={settingsRefreshNotice}
                    triggerToast={triggerToast}
                  />
                </div>
              </React.Fragment>
            )}

          </div>

          {/* Doc View Modal */}
          {activeDocPreview && (
            <div className="modal-overlay" onClick={() => setActiveDocPreview(null)}>
              <div className="modal-window doc-preview-window" onClick={(e) => e.stopPropagation()}>
                <div className="doc-preview-head">
                  <h3 className="doc-preview-title">📄 {activeDocPreview.name}</h3>
                  <button className="btn" onClick={() => setActiveDocPreview(null)}>關閉</button>
                </div>
                <div className="doc-preview-body markdown-preview">
                  {renderMarkdown(activeDocPreview.content)}
                </div>
              </div>
            </div>
          )}

          {/* Add Agent wizard modal */}
          {isAddAgentOpen && (
            <div className="modal-overlay">
              <div className="modal-window">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600' }}>新增 CLI Coding Agent</h3>
                  <button className="btn" onClick={closeAgentWizard}>取消</button>
                </div>

                {/* Steps indicator */}
                <div className="wizard-steps">
                  <span className={`wizard-step-indicator ${wizardStep === 1 ? 'active' : ''}`}>1. 命名與類型</span>
                  <span className={`wizard-step-indicator ${wizardStep === 2 ? 'active' : ''}`}>2. 路徑設定</span>
                  <span className={`wizard-step-indicator ${wizardStep === 3 ? 'active' : ''}`}>3. 連線測試</span>
                  <span className={`wizard-step-indicator ${wizardStep === 4 ? 'active' : ''}`}>4. 完成</span>
                </div>

                {/* Step 1 Content */}
                {wizardStep === 1 && (
                  <div className="wizard-form">
                    <label>Agent 命名</label>
                    <input 
                      type="text" 
                      className="wizard-input" 
                      placeholder="例如: DeepSeek R1 Engine" 
                      value={newAgentName}
                      onChange={(e) => setNewAgentName(e.target.value)}
                    />
                    <label>背景 AI 引擎型號</label>
                    <select className="wizard-input" value={newAgentModel} onChange={(e) => setNewAgentModel(e.target.value)}>
                      <option value="Gemini-2.0-Flash">Gemini 2.0 Flash (預設)</option>
                      <option value="Claude-3.5-Sonnet">Claude 3.5 Sonnet</option>
                      <option value="DeepSeek-R1">DeepSeek R1</option>
                      <option value="custom">自訂 Custom CLI</option>
                    </select>
                  </div>
                )}

                {/* Step 2 Content */}
                {wizardStep === 2 && (
                  <div className="wizard-form">
                    <label>本機 Terminal 執行檔路徑或 PATH command</label>
                    <input 
                      type="text" 
                      className="wizard-input" 
                      placeholder="例如: /usr/local/bin/deepseek-cli" 
                      value={newAgentPath}
                      onChange={(e) => setNewAgentPath(e.target.value)}
                    />
                    <div style={{ fontSize: '11px', color: 'var(--muted)', background: 'var(--surface-hover)', padding: '10px', borderRadius: 'var(--radius-sm)' }}>
                      DevDiary Core 只會使用 safe probe argv（預設 --version），不接受 shell string，也不會在 project folder 內執行。
                    </div>
                  </div>
                )}

                {/* Step 3 Content (Core safe probe) */}
                {wizardStep === 3 && (
                  <div style={{ textAlign: 'center', padding: '30px', color: 'var(--muted)' }}>
                    {agentProbeRunning ? (
                      <React.Fragment>
                        <svg className="nav-icon scanning-spinner" style={{ width: '32px', height: '32px', marginBottom: '12px' }} viewBox="0 0 24 24">
                          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                        </svg>
                        <div>Core 正在執行 safe probe...</div>
                      </React.Fragment>
                    ) : (
                      <React.Fragment>
                        <div className="agent-detection-error" style={{ marginBottom: '12px' }}>
                          {newAgentProbe?.error_message || 'Custom Agent probe 未通過。'}
                        </div>
                        <button className="btn btn-primary" onClick={runCustomAgentProbe}>重新測試</button>
                      </React.Fragment>
                    )}
                  </div>
                )}

                {/* Step 4 Content (Success) */}
                {wizardStep === 4 && (
                  <div style={{ textAlign: 'center', padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--success-glow)', border: '2px solid var(--success)', color: 'var(--success)', display: 'grid', placeItems: 'center', fontSize: '24px' }}>
                      ✓
                    </div>
                    <h3 style={{ fontSize: '15px', color: 'var(--fg)', fontWeight: '600' }}>連線測試成功！</h3>
                    <p style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      {newAgentProbe?.version || '已確認該執行路徑可用；正式保存會透過 DevDiary Core API 管理。'}
                    </p>
                  </div>
                )}

                {/* Wizard Footer Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid var(--border-soft)', paddingTop: '15px', marginTop: '10px' }}>
                  {wizardStep > 1 && wizardStep < 4 && (
                    <button className="btn" onClick={() => setWizardStep(wizardStep - 1)}>上一步</button>
                  )}
                  
                  {wizardStep < 3 && (
                    <button className="btn btn-primary" onClick={handleWizardNext}>下一步</button>
                  )}

                  {wizardStep === 4 && (
                    <button className="btn btn-primary" onClick={handleWizardFinish}>完成新增</button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Toast Notification Mount */}
          <div className="toast-container">
            {toasts.map(t => (
              <div key={t.id} className="toast">
                <span>💬</span>
                <span>{t.text}</span>
              </div>
            ))}
          </div>

        </div>
      );
    }

    // --- Settings View Component ---
    function SettingsView({
      settings,
      form,
      setForm,
      loading,
      saving,
      error,
      onReload,
      onSave,
      runtimeHealth,
      runtimeStatus,
      schedulerStatus,
      schedulerRunning,
      onRunDailyScheduler,
      dailyExporting,
      backupExporting,
      onDailyMarkdownExport,
      onRedactedBackupExport,
      themeMode,
      setThemeMode,
      projectPaths = [],
      settingsRefreshNotice = '',
    }) {
      const [activeSettingsTab, setActiveSettingsTab] = useState('projects');
      const [pathPickerNotice, setPathPickerNotice] = useState('');
      const updateForm = (patch) => setForm((prev) => ({ ...prev, ...patch }));
      const restartRequired = settings?.data_storage?.restart_required ||
        (settings?.data_storage?.active_db_path && form.desiredDbPath && settings.data_storage.active_db_path !== form.desiredDbPath.trim());
      const runtimeTitle = runtimeStatus?.status === 'connected'
        ? 'Core runtime 已連線'
        : runtimeStatus?.status === 'stale'
          ? 'Core runtime 可能過舊'
          : 'Core runtime 未連線';
      const storagePath = settings?.data_storage?.active_db_path || '載入中';
      const settingsTabs = [
        { id: 'projects', label: 'Projects' },
        { id: 'prompts', label: 'Prompts' },
        { id: 'automation', label: 'Automation' },
        { id: 'preferences', label: 'Preferences' },
        { id: 'storage', label: 'Storage' },
      ];
      const updateArrayRow = (field, index, value) => {
        setForm((prev) => {
          const rows = Array.isArray(prev[field]) && prev[field].length ? [...prev[field]] : [''];
          rows[index] = value;
          return { ...prev, [field]: rows };
        });
      };
      const addArrayRow = (field) => {
        setForm((prev) => {
          const rows = Array.isArray(prev[field]) && prev[field].length ? [...prev[field]] : [''];
          return { ...prev, [field]: [...rows, ''] };
        });
      };
      const removeArrayRow = (field, index) => {
        setForm((prev) => {
          const rows = Array.isArray(prev[field]) && prev[field].length ? [...prev[field]] : [''];
          const next = rows.filter((_, rowIndex) => rowIndex !== index);
          return { ...prev, [field]: next.length ? next : [''] };
        });
      };
      const updatePrompt = (key, value) => {
        setForm((prev) => ({
          ...prev,
          aiPrompts: { ...(prev.aiPrompts || {}), [key]: value },
        }));
      };
      const choosePath = async (field, index, options = {}) => {
        setPathPickerNotice('');
        const isTauriRuntime = Boolean(window.__TAURI_INTERNALS__) || window.location.protocol.startsWith('tauri');
        if (isTauriRuntime) {
          try {
            const { open } = await import('@tauri-apps/plugin-dialog');
            const selected = await open({
              directory: true,
              multiple: false,
              title: '選擇 DevDiary 要掃描的資料夾',
            });
            if (typeof selected === 'string' && selected.trim()) {
              if (options.relativeToProjectRoots) {
                const result = selectedFolderToProjectDocFolder(selected, form.projectRoots, projectPaths);
                if (result.error) {
                  setPathPickerNotice(result.error);
                  return;
                }
                updateArrayRow(field, index, result.value);
                return;
              }
              updateArrayRow(field, index, selected);
            }
            return;
          } catch (err) {
            setPathPickerNotice(`無法開啟 macOS 資料夾選擇器：${err?.message || String(err)}。請先手動貼上路徑。`);
            return;
          }
        }
        setPathPickerNotice('目前 Web dev runtime 無法回傳 macOS 絕對路徑；請先手動貼上路徑。');
      };
      const pathList = (field, label, description, placeholder, options = {}) => {
        const rows = Array.isArray(form[field]) && form[field].length ? form[field] : [''];
        const showFolderPicker = options.folderPicker !== false;
        const addLabel = options.addLabel || '新增路徑';
        return (
          <div className="settings-row settings-row-stack">
            <div className="settings-info">
              <h3>{label}</h3>
              <p>{description}</p>
            </div>
            <div className="path-list-control">
              {rows.map((value, index) => (
                <div className={`path-row ${showFolderPicker ? '' : 'no-picker'}`} key={`${field}-${index}`}>
                  <input
                    type="text"
                    className="wizard-input path-row-input"
                    value={value}
                    onChange={(e) => updateArrayRow(field, index, e.target.value)}
                    placeholder={placeholder}
                    aria-label={`${label} ${index + 1}`}
                  />
                  {showFolderPicker && (
                    <button className="icon-btn path-row-btn" type="button" title="選擇資料夾" onClick={() => choosePath(field, index, options)}>
                      <svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                    </button>
                  )}
                  <button className="icon-btn path-row-btn danger" type="button" title="刪除此列" onClick={() => removeArrayRow(field, index)}>
                    <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
                  </button>
                </div>
              ))}
              <button className="btn path-add-btn" type="button" onClick={() => addArrayRow(field)}>+ {addLabel}</button>
            </div>
          </div>
        );
      };
      const promptEditor = (key, title, description) => (
        <div className="prompt-card">
          <div className="settings-info">
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
          <textarea
            className="ai-summary-editor prompt-editor"
            value={form.aiPrompts?.[key] || ''}
            onChange={(e) => updatePrompt(key, e.target.value)}
          />
        </div>
      );
      return (
        <div className="settings-layout">
          <div className="settings-toolbar">
            <div>
              <div className="settings-kicker">Core Settings API</div>
              <div className="settings-status">
                {loading ? '正在載入 Settings snapshot...' : `最後更新：${settings?.updated_at ? formatTs(settings.updated_at) : '尚未持久化'}`}
              </div>
            </div>
            <div className="settings-actions">
              <button className="btn" onClick={onReload} disabled={loading || saving}>重新載入</button>
              <button className="btn btn-primary" onClick={onSave} disabled={loading || saving}>
                {saving ? '儲存中...' : '儲存設定'}
              </button>
            </div>
          </div>

          {error && (
            <div className="settings-alert" role="alert">
              <strong>Settings API 發生錯誤</strong>
              <span>{error}</span>
            </div>
          )}
          {settingsRefreshNotice && <div className="settings-alert" role="status"><strong>Settings 有更新</strong><span>{settingsRefreshNotice}</span></div>}

          <div className="settings-runtime-summary">
            <section className={`settings-overview-card ${runtimeStatus?.status || 'unreachable'}`}>
              <div className="settings-kicker">Runtime</div>
              <h3>{runtimeTitle}</h3>
              <p>{runtimeStatus?.message}。這裡只顯示目前 Core Local HTTP API 的運作狀態，不能直接編輯。</p>
              <div className="settings-meta-grid">
                <span>Port <strong>{runtimeStatus?.port ? `127.0.0.1:${runtimeStatus.port}` : '未知'}</strong></span>
                <span>Contract <strong>{runtimeStatus?.contractVersion ? `v${runtimeStatus.contractVersion}` : 'legacy'}</strong></span>
                <span>Checked <strong>{runtimeStatus?.checkedAt ? formatTs(runtimeStatus.checkedAt) : '尚未檢查'}</strong></span>
              </div>
              {runtimeStatus?.missingCapabilities?.length > 0 && (
                <div className="runtime-missing">缺少 capabilities：{runtimeStatus.missingCapabilities.join(', ')}</div>
              )}
            </section>
          </div>

          <div className="settings-tabs" role="tablist" aria-label="Settings sections">
            {settingsTabs.map((tab) => (
              <button
                key={tab.id}
                className={`settings-tab-btn ${activeSettingsTab === tab.id ? 'active' : ''}`}
                type="button"
                role="tab"
                aria-selected={activeSettingsTab === tab.id}
                onClick={() => setActiveSettingsTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="settings-grid">
            {activeSettingsTab === 'projects' && <section className="settings-section settings-section-wide">
              <div className="settings-section-head">
                <div>
                  <div className="settings-kicker">Projects</div>
                  <h3>專案與掃描</h3>
                </div>
                <select
                  className="wizard-input settings-compact-control"
                  value={form.scanIntervalMinutes}
                  onChange={(e) => updateForm({ scanIntervalMinutes: Number(e.target.value) })}
                  aria-label="背景自動掃描週期"
                >
                  <option value="5">每 5 分鐘</option>
                  <option value="15">每 15 分鐘</option>
                  <option value="30">每 30 分鐘</option>
                  <option value="60">每一小時</option>
                  <option value="120">每兩小時</option>
                </select>
              </div>

              <div className="settings-hint background-scan-status">
                <strong>背景掃描狀態</strong>
                <span>{settings?.background_scan?.last_status === 'success' ? '最近一次成功' : settings?.background_scan?.last_status === 'failed' ? '最近一次失敗' : settings?.background_scan?.last_status === 'skipped' ? '最近一次略過' : '尚未完成背景掃描'}</span>
                <span>完成：{settings?.background_scan?.last_completed_at ? formatTs(settings.background_scan.last_completed_at) : '—'}</span>
                <span>掃描 {settings?.background_scan?.last_scanned_projects ?? 0} 個專案／新增 {settings?.background_scan?.last_inserted_sessions ?? 0} 個 session</span>
                <span>下次週期：{settings?.background_scan?.next_interval_ms ? `${Math.round(settings.background_scan.next_interval_ms / 60_000)} 分鐘` : '依目前設定啟動後顯示'}</span>
                {settings?.background_scan?.last_error && <span>原因：{settings.background_scan.last_error}</span>}
              </div>

              {pathList('projectRoots', 'Project Roots', 'Core `/api/scan` 使用的專案根目錄白名單。', '/path/to/projects')}
              {pathList('excludedPaths', 'Excluded Paths', '掃描時排除的路徑或 pattern。', '**/node_modules/**')}
              <div className="docs-scan-mode-grid">
                {pathList('projectDocFilenames', 'Project Docs Scan：特定檔名', 'Scan 時讀取的相對檔名 allowlist，例如 README.md 或 docs/specs/MASTER.md。', 'README.md', { folderPicker: false, addLabel: '新增相對檔名' })}
                {pathList('projectDocFolders', 'Project Docs Scan：資料夾全掃描', 'Scan 時讀取每個 project root 內指定相對資料夾底下的安全文字檔；例如 docs 或 docs/specs。資料夾按鈕會優先用已偵測專案路徑換算成相對路徑。', 'docs/specs', { relativeToProjectRoots: true, addLabel: '新增相對資料夾' })}
              </div>
              {pathPickerNotice && <div className="settings-hint">{pathPickerNotice}</div>}
            </section>}

            {activeSettingsTab === 'prompts' && <section className="settings-section settings-section-wide">
              <div className="settings-section-head">
                <div>
                  <div className="settings-kicker">AI Prompts</div>
                  <h3>預設 prompt</h3>
                </div>
              </div>

              <div className="prompt-grid">
                {promptEditor('project_diary', 'Project diary prompt', 'Workspace project summary / AI draft 使用。')}
                {promptEditor('daily_diary_entry', 'Daily diary prompt', '單日 diary regenerate 使用。')}
                {promptEditor('daily_highlight', 'Daily highlight prompt', 'Daily Scheduler 全域重點使用。')}
              </div>
            </section>}

            {activeSettingsTab === 'automation' && <section className="settings-section settings-section-wide">
              <div className="settings-section-head">
                <div>
                  <div className="settings-kicker">Automation</div>
                  <h3>Daily automation</h3>
                </div>
              </div>

              <div className="settings-row compact">
                <div className="settings-info">
                  <h3>Daily Scheduler</h3>
                  <p>每日產生日誌、project AI draft 與 Kanban synthesis。</p>
                </div>
                <div className="settings-control">
                  <label className="settings-toggle-row">
                    <span>Enabled</span>
                    <span className="switch">
                      <input
                        type="checkbox"
                        checked={form.dailySchedulerEnabled}
                        onChange={(e) => updateForm({ dailySchedulerEnabled: e.target.checked })}
                      />
                      <span className="slider"></span>
                    </span>
                  </label>
                  <div className="settings-inline-controls">
                    <input
                      type="time"
                      className="wizard-input settings-time-input"
                      value={form.dailySchedulerRunTime}
                      onChange={(e) => updateForm({ dailySchedulerRunTime: e.target.value })}
                    />
                    <button className="btn" onClick={onRunDailyScheduler} disabled={schedulerRunning}>
                      {schedulerRunning ? '執行中...' : 'Run now'}
                    </button>
                  </div>
                </div>
              </div>
            </section>}

            {activeSettingsTab === 'preferences' && <section className="settings-section settings-section-wide">
              <div className="settings-section-head">
                <div>
                  <div className="settings-kicker">Preferences</div>
                  <h3>外觀、匯出與隱私</h3>
                </div>
              </div>

              <div className="settings-row compact">
                <div className="settings-info">
                  <h3>Appearance</h3>
                  <p>主題會立即預覽，儲存後持久化。</p>
                </div>
                <div className="theme-selector-group">
                  {['light', 'dark', 'system'].map((mode) => (
                    <button
                      key={mode}
                      className={`theme-selector-btn ${themeMode === mode ? 'active' : ''}`}
                      onClick={() => {
                        setThemeMode(mode);
                        updateForm({ appearance: mode });
                      }}
                    >
                      {mode === 'light' ? '亮色' : mode === 'dark' ? '深色' : '跟隨系統'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-row compact">
                <div className="settings-info">
                  <h3>Privacy</h3>
                  <p>匯出時的 redaction 與 comments inclusion。</p>
                </div>
                <div className="settings-toggle-stack">
                  <label className="settings-toggle-row">
                    <span>Redact sensitive values</span>
                    <span className="switch">
                      <input
                        type="checkbox"
                        checked={form.redactSensitiveValues}
                        onChange={(e) => updateForm({ redactSensitiveValues: e.target.checked })}
                      />
                      <span className="slider"></span>
                    </span>
                  </label>
                  <label className="settings-toggle-row">
                    <span>Include comments in exports</span>
                    <span className="switch">
                      <input
                        type="checkbox"
                        checked={form.includeCommentsInExports}
                        onChange={(e) => updateForm({ includeCommentsInExports: e.target.checked })}
                      />
                      <span className="slider"></span>
                    </span>
                  </label>
                </div>
              </div>

              <div className="settings-row compact">
                <div className="settings-info">
                  <h3>Export</h3>
                  <p>Markdown daily diary 與 redacted JSON backup。</p>
                </div>
                <div className="settings-inline-controls">
                  <button className="btn" onClick={onDailyMarkdownExport} disabled={dailyExporting || backupExporting}>
                    {dailyExporting ? '匯出中...' : '匯出 Markdown'}
                  </button>
                  <button className="btn" onClick={onRedactedBackupExport} disabled={dailyExporting || backupExporting}>
                    {backupExporting ? '匯出中...' : '匯出 Backup JSON'}
                  </button>
                </div>
              </div>
            </section>}

            {activeSettingsTab === 'storage' && <section className="settings-section settings-section-wide">
              <div className="settings-section-head">
                <div>
                  <div className="settings-kicker">Storage</div>
                  <h3>資料儲存</h3>
                </div>
                {restartRequired && <span className="settings-status-pill">Restart required</span>}
              </div>

              <div className="settings-row">
                <div className="settings-info">
                  <h3>Active SQLite Path</h3>
                  <p>目前 Core process 使用中的 SQLite 檔案。</p>
                </div>
                <code className="settings-path">{storagePath}</code>
              </div>
              <div className="settings-row">
                <div className="settings-info">
                  <h3>Desired DB Path</h3>
                  <p>儲存後作為下次啟動的期望路徑。</p>
                </div>
                <div className="settings-control">
                  <input
                    type="text"
                    className="wizard-input"
                    value={form.desiredDbPath}
                    onChange={(e) => updateForm({ desiredDbPath: e.target.value })}
                    placeholder="~/Library/Application Support/DevDiary/DevDiary.sqlite"
                  />
                  {restartRequired && <div className="settings-hint">需要重啟 Core 才會套用新的 DB path。</div>}
                </div>
              </div>
            </section>}
          </div>
        </div>
      );
    }

export default App;
