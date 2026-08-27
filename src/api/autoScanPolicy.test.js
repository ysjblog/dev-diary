import assert from 'node:assert/strict';
import test from 'node:test';
import { hasConfiguredProjectRoots, scanActivityPresentation, shouldAutoScanOnStartup } from './autoScanPolicy.js';

test('hasConfiguredProjectRoots requires at least one non-empty persisted root', () => {
  assert.equal(hasConfiguredProjectRoots(null), false);
  assert.equal(hasConfiguredProjectRoots({ project_roots: [] }), false);
  assert.equal(hasConfiguredProjectRoots({ project_roots: ['  '] }), false);
  assert.equal(hasConfiguredProjectRoots({ project_roots: ['/Users/demo/Developer/projects'] }), true);
});

test('startup auto scan runs once only after Core is connected and roots are configured', () => {
  const settingsSnapshot = { project_roots: ['/Users/demo/Developer/projects'] };
  assert.equal(shouldAutoScanOnStartup({
    alreadyStarted: false,
    isAnyScanRunning: false,
    settingsSnapshot,
    runtimeStatus: { status: 'connected' },
  }), true);

  assert.equal(shouldAutoScanOnStartup({
    alreadyStarted: true,
    isAnyScanRunning: false,
    settingsSnapshot,
    runtimeStatus: { status: 'connected' },
  }), false);

  assert.equal(shouldAutoScanOnStartup({
    alreadyStarted: false,
    isAnyScanRunning: true,
    settingsSnapshot,
    runtimeStatus: { status: 'connected' },
  }), false);

  assert.equal(shouldAutoScanOnStartup({
    alreadyStarted: false,
    isAnyScanRunning: false,
    settingsSnapshot,
    runtimeStatus: { status: 'unreachable' },
  }), false);
});

test('packaged runtime delegates startup scanning to LaunchAgent instead of blocking the App Core', () => {
  const settingsSnapshot = { project_roots: ['/Users/demo/Developer/projects'] };
  assert.equal(shouldAutoScanOnStartup({
    alreadyStarted: false,
    isAnyScanRunning: false,
    settingsSnapshot,
    runtimeStatus: { status: 'connected' },
    packagedRuntime: true,
  }), false);

  assert.equal(shouldAutoScanOnStartup({
    alreadyStarted: false,
    isAnyScanRunning: false,
    settingsSnapshot,
    runtimeStatus: { status: 'connected' },
    packagedRuntime: false,
  }), true);
});

test('scan activity label only represents Core scan or inline AI work, not response refresh', () => {
  assert.deepEqual(scanActivityPresentation({ activeWorkPending: true, coreScanRunning: true }), {
    label: '正在掃描...',
    actionLabel: '更新中...',
    title: '正在掃描...',
    busy: true,
  });
  assert.deepEqual(scanActivityPresentation({ activeWorkPending: true, coreScanRunning: false }), {
    label: '正在掃描...',
    actionLabel: '更新中...',
    title: '正在掃描...',
    busy: true,
  });
  assert.deepEqual(scanActivityPresentation({ activeWorkPending: false, refreshPending: true, coreScanRunning: false }), {
    label: 'Scan Now',
    actionLabel: '更新日誌',
    title: 'Scan Now',
    busy: false,
  });
});
