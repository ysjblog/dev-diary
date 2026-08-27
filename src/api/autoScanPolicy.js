export function hasConfiguredProjectRoots(settingsSnapshot) {
  return Array.isArray(settingsSnapshot?.project_roots) && settingsSnapshot.project_roots.some((root) => String(root || '').trim());
}

export function shouldAutoScanOnStartup({ alreadyStarted, isAnyScanRunning, settingsSnapshot, runtimeStatus, packagedRuntime = false }) {
  // The packaged App already installs a separate LaunchAgent runner. Starting
  // the same synchronous filesystem scan through the App Core can block every
  // health/settings request when a configured root is on a slow external disk.
  if (packagedRuntime) return false;
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
