import { afterEach, describe, expect, it } from 'vitest';
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCodexDesktopWakeDispatcher } from '../src/services/codexDesktopWake.js';
import { createCodexCliResumeDispatcher, createCodexDesktopResumeEngine } from '../src/services/codexDesktopResumeEngine.js';
import { createCodexDesktopResumeRepository } from '../src/services/codexDesktopResumeRepository.js';
import { resolveCodexDesktopRegistration } from '../src/services/codexDesktopSessionLookup.js';
import { openDb } from '../src/db/index.js';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const dirs: string[] = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
function fixture(body = 'exit 0') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'codex-wake-'))); dirs.push(root);
  const opener = join(root, 'open');
  writeFileSync(opener, `#!/bin/sh\nprintf '%s\\n' "$@" > '${root}/open-argv'\n${body}\n`); chmodSync(opener, 0o700);
  return { root, opener, context: { codexHome: root }, options: { desktopHome: root, openBinary: opener } };
}
describe('foreground-assisted queue continuation', () => {
  it('waits for queue acknowledgement, then opens the exact UUID with fixed bundle argv', async () => {
    const f = fixture(); let release!: (r: {accepted: boolean; code: string}) => void;
    const dispatch = createCodexDesktopWakeDispatcher(() => new Promise(r => { release = r; }), f.options);
    const result = dispatch(id, f.context);
    expect(existsSync(join(f.root, 'open-argv'))).toBe(false);
    release({ accepted: true, code: 'queued' });
    expect(await result).toEqual({ accepted: true, code: 'queued' });
    expect(readFileSync(join(f.root, 'open-argv'), 'utf8').trim().split('\n')).toEqual(['-b', 'com.openai.codex', `codex://threads/${id}`]);
  });
  it.each([{accepted:false,code:'codex_resume_command_failed'}, {accepted:false,code:'unknown',releaseLease:false}])('never opens on failed or uncertain queue result %j', async result => {
    const f = fixture(); expect(await createCodexDesktopWakeDispatcher(async () => result, f.options)(id,f.context)).toEqual(result);
    expect(existsSync(join(f.root,'open-argv'))).toBe(false);
  });
  it.each([id.toUpperCase(), `${id}?x=1`, `${id};touch bad`, '', 'not-a-uuid'])('rejects malformed identity before any command: %s', async target => {
    const f=fixture(); let calls=0;
    expect((await createCodexDesktopWakeDispatcher(async()=>{calls++;return {accepted:true,code:'queued'};},f.options)(target,f.context)).accepted).toBe(false);
    expect(calls).toBe(0); expect(existsSync(join(f.root,'open-argv'))).toBe(false);
  });
  it('rejects alternate and noncanonical stores before queue', async () => {
    const f=fixture(); const other=fixture(); let calls=0;
    const dispatch=createCodexDesktopWakeDispatcher(async()=>{calls++;return {accepted:true,code:'queued'};},f.options);
    for(const codexHome of [other.root, `${f.root}/.`, 'relative']) expect(await dispatch(id,{codexHome})).toEqual({accepted:false,code:'codex_resume_desktop_store_mismatch'});
    expect(calls).toBe(0);
  });
  it('returns only sanitized error when the opener fails', async () => {
    const f=fixture('echo private-diagnostic >&2\nexit 1');
    expect(await createCodexDesktopWakeDispatcher(async()=>({accepted:true,code:'queued'}),f.options)(id,f.context)).toEqual({accepted:false,code:'codex_resume_queued_wake_failed'});
  });
  it('terminates a timed-out opener before releasing its lease', async () => {
    const f=fixture(`trap '' TERM\nwhile :; do :; done`);
    const r=await createCodexDesktopWakeDispatcher(async()=>({accepted:true,code:'queued'}),{...f.options,openTimeoutMs:100,terminationGraceMs:100})(id,f.context);
    expect(r).toEqual({accepted:false,code:'codex_resume_queued_wake_timeout',releaseLease:true});
  });
  it('cleans a pipe-detached descendant before accepting navigation', async () => {
    const f=fixture(`/bin/sh -c 'trap "" TERM; exec >/dev/null 2>&1; while :; do :; done' &\nsleep 0.03\nexit 0`);
    expect(await createCodexDesktopWakeDispatcher(async()=>({accepted:true,code:'queued'}),{...f.options,terminationGraceMs:200})(id,f.context)).toMatchObject({accepted:true,code:'queued'});
  });
  it.each([['exit 0','resumed'],['exit 1','needs_attention']])('runs real queue/open child processes once across engine restart: %s', async(body,state)=>{
    const f=fixture(body); mkdirSync(join(f.root,'sessions'));
    const path=join(f.root,'sessions','target.jsonl');writeFileSync(path,JSON.stringify({type:'session_meta',payload:{id}})+'\n');
    const db=openDb(':memory:');const now=Date.parse('2026-09-09T02:00:00.000Z');
    const repo=createCodexDesktopResumeRepository(db,()=>now);repo.registerVerifiedTarget(resolveCodexDesktopRegistration(id,'fixture',[f.root]));repo.setGlobalEnabled(true);
    appendFileSync(path,JSON.stringify({type:'event_msg',timestamp:'2026-09-09T00:00:00.000Z',payload:{type:'task_complete',error:{codex_error_info:'usage_limit_exceeded',message:"You've hit your usage limit. Upgrade or try again at 9:30 AM."}}})+'\n');
    const binary=join(f.root,'queue');writeFileSync(binary,`#!/bin/sh\nprintf x >> "$CODEX_HOME/count"\nprintf 'Queued message bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb for thread ${id}.\\n'\n`);chmodSync(binary,0o700);
    const dispatch=createCodexDesktopWakeDispatcher(createCodexCliResumeDispatcher(binary),f.options);
    expect(await createCodexDesktopResumeEngine(db,()=>[f.root],dispatch,()=>now).tick()).toBe(state);
    const row=db.prepare('SELECT completed_evidence_id,action_high_watermark FROM codex_desktop_resume_targets').get();
    await createCodexDesktopResumeEngine(db,()=>[f.root],dispatch,()=>now).tick();
    expect(readFileSync(join(f.root,'count'),'utf8')).toBe('x');
    expect(db.prepare('SELECT completed_evidence_id,action_high_watermark FROM codex_desktop_resume_targets').get()).toEqual(row);
    expect(repo.snapshot().action_in_progress).toBe(false);db.close();
  }, 20_000); // real child processes: first exec of fresh scripts is policy-scanned by macOS and slow under load
});
