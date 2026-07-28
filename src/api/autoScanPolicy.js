export function hasConfiguredProjectRoots(settingsSnapshot) {
  return Array.isArray(settingsSnapshot?.project_roots) && settingsSnapshot.project_roots.some((root) => String(root || '').trim());
}

export function shouldAutoScanOnStartup({ alreadyStarted, isAnyScanRunning, settingsSnapshot, runtimeStatus }) {
  if (alreadyStarted || isAnyScanRunning) return false;
  if (!hasConfiguredProjectRoots(settingsSnapshot)) return false;
  return runtimeStatus?.status === 'connected';
}

export function scanActivityPresentation({ activeWorkPending, coreScanRunning }) {
  if (coreScanRunning || activeWorkPending) {
    return { label: '正在掃描...', actionLabel: '更新中...', title: '正在掃描...', busy: true };
  }
  return { label: 'Scan Now', actionLabel: '更新日誌', title: 'Scan Now', busy: false };
}
