import assert from 'node:assert/strict';
import test from 'node:test';
import { hasConfiguredProjectRoots, shouldAutoScanOnStartup } from './autoScanPolicy.js';

test('hasConfiguredProjectRoots requires at least one non-empty persisted root', () => {
  assert.equal(hasConfiguredProjectRoots(null), false);
  assert.equal(hasConfiguredProjectRoots({ project_roots: [] }), false);
  assert.equal(hasConfiguredProjectRoots({ project_roots: ['  '] }), false);
  assert.equal(hasConfiguredProjectRoots({ project_roots: ['~/Projects'] }), true);
});

test('startup auto scan runs once only after Core is connected and roots are configured', () => {
  const settingsSnapshot = { project_roots: ['~/Workspace/side-projects'] };
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
