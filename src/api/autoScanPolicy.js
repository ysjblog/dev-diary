export function hasConfiguredProjectRoots(settingsSnapshot) {
  return Array.isArray(settingsSnapshot?.project_roots) && settingsSnapshot.project_roots.some((root) => String(root || '').trim());
}

export function shouldAutoScanOnStartup({ alreadyStarted, isAnyScanRunning, settingsSnapshot, runtimeStatus }) {
  if (alreadyStarted || isAnyScanRunning) return false;
  if (!hasConfiguredProjectRoots(settingsSnapshot)) return false;
  return runtimeStatus?.status === 'connected';
}
