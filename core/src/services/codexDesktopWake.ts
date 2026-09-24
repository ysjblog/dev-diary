import { spawn } from 'node:child_process';
import { realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { buildSafeChildEnv } from './agentDetection.js';
import type { ResumeDispatcher, ResumeDispatchResult } from './codexDesktopResumeEngine.js';

const THREAD_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
interface WakeOptions {
  // Injection points are for isolated local tests; production uses only defaults.
  desktopHome?: string;
  openBinary?: string;
  openTimeoutMs?: number;
  terminationGraceMs?: number;
}

function boundedBudget(value: number | undefined, maximum: number): number {
  return Number.isSafeInteger(value) && value! >= 1 && value! <= maximum ? value! : maximum;
}

function openTask(threadId: string, options: WakeOptions): Promise<ResumeDispatchResult> {
  const timeoutMs = boundedBudget(options.openTimeoutMs, 5_000);
  const graceMs = boundedBudget(options.terminationGraceMs, 2_000);
  return new Promise(resolve => {
    const deadline = performance.now() + timeoutMs;
    const child = spawn(options.openBinary ?? '/usr/bin/open', ['-b', 'com.openai.codex', `codex://threads/${threadId}`], {
      cwd: '/', shell: false, detached: true, stdio: 'ignore',
      env: buildSafeChildEnv(process.env, homedir()),
    });
    let settled = false; let closed = false; let terminating = false;
    const finish = (result: ResumeDispatchResult) => {
      if (settled) return;
      settled = true; clearTimeout(timer); child.unref(); resolve(result);
    };
    const absent = () => {
      if (!child.pid) return closed;
      try { process.kill(-child.pid, 0); return false; }
      catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH'; }
    };
    const stopped = () => closed && absent();
    const waitForStop = async () => {
      const until = performance.now() + graceMs;
      while (!stopped() && performance.now() < until) await new Promise(r => setTimeout(r, Math.min(20, Math.max(1, until - performance.now()))));
      return stopped();
    };
    const signal = (value: NodeJS.Signals) => {
      if (child.pid) { try { process.kill(-child.pid, value); } catch { /* absence is checked independently */ } }
    };
    async function terminate(code: string, normalExit = false) {
      if (settled || terminating) return;
      terminating = true; signal('SIGTERM');
      let confirmed = await waitForStop();
      if (!confirmed) { signal('SIGKILL'); confirmed = await waitForStop(); }
      if (confirmed && normalExit) finish({ accepted: true, code: 'queued' });
      else finish({ accepted: false, code: confirmed ? code : `${code}_process_unterminated`, releaseLease: confirmed });
    }
    const timer = setTimeout(() => { void terminate('codex_resume_queued_wake_timeout'); }, timeoutMs);
    child.once('error', () => {
      if (!child.pid) { closed = true; finish({ accepted: false, code: 'codex_resume_queued_wake_failed' }); }
      else void terminate('codex_resume_queued_wake_failed');
    });
    child.once('close', (code, signal) => {
      closed = true;
      if (settled || terminating) return;
      if (performance.now() > deadline) { void terminate('codex_resume_queued_wake_timeout'); return; }
      const normalExit = code === 0 && signal === null;
      if (!absent()) { void terminate('codex_resume_queued_wake_failed', normalExit); return; }
      finish({ accepted: normalExit, code: normalExit ? 'queued' : 'codex_resume_queued_wake_failed' });
    });
  });
}

/** Queue once, then navigate once. Neither acknowledgement proves turn start. */
export function createCodexDesktopWakeDispatcher(queue: ResumeDispatcher, options: WakeOptions = {}): ResumeDispatcher {
  return async (threadId, context) => {
    if (threadId.length !== 36 || !THREAD_UUID.test(threadId)) return { accepted: false, code: 'invalid_codex_thread_id' };
    try {
      const desktop = realpathSync(options.desktopHome ?? join(homedir(), '.codex'));
      if (!context || !isAbsolute(context.codexHome) || realpathSync(context.codexHome) !== context.codexHome
        || context.codexHome !== desktop || !statSync(desktop).isDirectory()) throw new Error('store mismatch');
    } catch { return { accepted: false, code: 'codex_resume_desktop_store_mismatch' }; }
    const queued = await queue(threadId, context);
    if (!queued.accepted) return queued;
    if (queued.code !== 'queued' || queued.releaseLease === false) return { accepted: false, code: 'codex_resume_queue_receipt_invalid', releaseLease: false };
    return openTask(threadId, options);
  };
}
