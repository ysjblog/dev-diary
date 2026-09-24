import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { parseStrictCodexQuotaLine } from '../src/services/codexQuotaEvidence.js';
import { createCodexDesktopResumeEngine } from '../src/services/codexDesktopResumeEngine.js';
import { createCodexDesktopResumeRepository } from '../src/services/codexDesktopResumeRepository.js';
import { resolveCodexDesktopRegistration } from '../src/services/codexDesktopSessionLookup.js';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const base = Date.parse('2026-09-21T00:00:00.000Z');
const quota = (at: number, reset = '8:03 AM') => JSON.stringify({ type: 'event_msg', timestamp: new Date(at).toISOString(), payload: { type: 'task_complete', error: { codex_error_info: 'usage_limit_exceeded', message: `You’ve hit your usage limit. Upgrade or try again at ${reset}.` } } }) + '\n';
const meta = (at: number) => JSON.stringify({ type: 'session_meta', timestamp: new Date(at).toISOString(), payload: { id } }) + '\n';
const cleanup: Array<() => void> = [];
afterEach(() => { while (cleanup.length) cleanup.pop()!(); });
function fixture() {
 const root = mkdtempSync(join(tmpdir(), 'diary-recovery-')); mkdirSync(join(root, 'sessions'));
 const path = join(root, 'sessions/old.jsonl'); writeFileSync(path, meta(base));
 const db = openDb(join(root, 'test.sqlite')); cleanup.push(() => { db.close(); rmSync(root, { recursive: true, force: true }); });
 let clock = base + 60_000; const now = () => clock;
 const repo = createCodexDesktopResumeRepository(db, now); repo.registerVerifiedTarget(resolveCodexDesktopRegistration(id, 'fixture', [root])); repo.setGlobalEnabled(true);
 const calls: string[] = []; const dispatcher = async (thread: string) => { calls.push(thread); return { accepted: true, code: 'accepted' }; };
 const engine = () => createCodexDesktopResumeEngine(db, () => [root], dispatcher, now);
 return { root, path, db, repo, calls, engine, set: (at: number) => { clock = at; } };
}
describe('recovery timing and sequential segments', () => {
 it.each(['8:03 AM', 'Sep 21st, 2026 8:03 AM'])('keeps a just-expired reset in its actual day: %s', reset => {
  expect(parseStrictCodexQuotaLine(Buffer.from(quota(base + 215_000, reset)), 'Asia/Taipei')?.reset_at_ms).toBe(base + 180_000);
 });
 it('recognizes a recent past reset across midnight without changing its day', () => {
  const at = Date.parse('2026-09-20T16:00:35.000Z');
  expect(parseStrictCodexQuotaLine(Buffer.from(quota(at, '11:59 PM')), 'Asia/Taipei')?.reset_at_ms).toBe(Date.parse('2026-09-20T15:59:00.000Z'));
 });
 it('bounds recent-past interpretation and rejects malformed vendor evidence', () => {
  expect(parseStrictCodexQuotaLine(Buffer.from(quota(base+3_780_000,'Sep 21st, 2026 8:03 AM')), 'Asia/Taipei')?.reset_at_ms).toBe(base+180_000);
  expect(parseStrictCodexQuotaLine(Buffer.from(quota(base+3_780_001,'Sep 21st, 2026 8:03 AM')), 'Asia/Taipei')).toBeNull();
  expect(parseStrictCodexQuotaLine(Buffer.from(quota(base+215_000).replace('usage_limit_exceeded','other')), 'Asia/Taipei')).toBeNull();
  expect(parseStrictCodexQuotaLine(Buffer.from(quota(base+215_000).replace('8:03 AM','8:03 AM; or try again at 8:04 AM')), 'Asia/Taipei')).toBeNull();
 });
 it('waits the initial grace and delays fresh failures, with restart-safe retry exhaustion', async () => {
  const f=fixture(); appendFileSync(f.path, quota(base+120_000));
  f.set(base+180_000); await f.engine().tick(); expect(f.calls).toHaveLength(0);
  f.set(base+240_000); await f.engine().tick(); expect(f.calls).toEqual([id]);
  for(let n=0;n<4;n++) {
   const errorAt=base+250_000+n*310_000;
   appendFileSync(f.path,quota(errorAt)); f.set(errorAt); await f.engine().tick(); expect(f.calls).toHaveLength(1+Math.min(n,3));
   f.set(errorAt+299_999); await f.engine().tick(); expect(f.calls).toHaveLength(1+Math.min(n,3));
   f.set(errorAt+300_000); await f.engine().tick(); expect(f.calls).toHaveLength(1+Math.min(n+1,3));
  }
  expect(f.repo.snapshot().targets[0]).toMatchObject({state:'needs_attention',last_error_code:'quota_retry_exhausted'});
 });
 it('adopts a later segment, ignores copied old quota, and consumes fresh quota once', async () => {
  const f=fixture(); const next=join(f.root,'sessions/new.jsonl');
  writeFileSync(next,meta(base+600_000)+quota(base+120_000)); f.set(base+780_000);
  await f.engine().tick(); expect(f.calls).toHaveLength(0);
  appendFileSync(next,quota(base+660_000,'8:12 AM')); await f.engine().tick(); expect(f.calls).toEqual([id]);
  await f.engine().tick(); expect(f.calls).toHaveLength(1);
  expect(f.db.prepare('SELECT session_locator,registered_at_ms FROM codex_desktop_resume_targets').get()).toEqual({session_locator:'r0/sessions/new.jsonl',registered_at_ms:base+60_000});
 });
 it('recovers a previously safe uniqueness failure into the new segment', async () => {
  const f=fixture(); f.db.prepare("UPDATE codex_desktop_resume_targets SET state='needs_attention',last_error_code='session_uniqueness_unproven'").run();
  writeFileSync(join(f.root,'sessions/new.jsonl'),meta(base+600_000)+quota(base+660_000,'8:12 AM')); f.set(base+780_000);
  await f.engine().tick(); expect(f.calls).toEqual([id]);
 });
 it.each(['prefix','quarantine','disabled'])('does not adopt or dispatch through %s protection', async mode => {
  const f=fixture();
  if(mode==='prefix') writeFileSync(f.path,meta(base).replace('session_meta','session_fake'));
  if(mode==='quarantine') f.db.prepare("UPDATE codex_desktop_resume_targets SET state='needs_attention',lock_quarantine_required=1,last_error_code='previous_dispatch_outcome_unknown'").run();
  if(mode==='disabled') f.db.prepare('UPDATE codex_desktop_resume_targets SET enabled=0').run();
  writeFileSync(join(f.root,'sessions/new.jsonl'),meta(base+600_000)+quota(base+660_000,'8:12 AM')); f.set(base+780_000);
  await f.engine().tick(); expect(f.calls).toHaveLength(0);
  expect(f.db.prepare('SELECT session_locator FROM codex_desktop_resume_targets').get()).toEqual({session_locator:'r0/sessions/old.jsonl'});
 });
 it('keeps a retry budget across repeated segment transfers and restarts', async () => {
  const f=fixture(); let path=f.path;
  appendFileSync(path, quota(base+215_000)); f.set(base+515_000); await f.engine().tick(); expect(f.calls).toHaveLength(1);
  for(let n=1;n<=3;n++) {
   const start=base+600_000*n; path=join(f.root,`sessions/new-${n}.jsonl`);
   writeFileSync(path,meta(start)+quota(start+35_000)); f.set(start+335_000);
   await f.engine().tick(); expect(f.calls).toHaveLength(Math.min(n+1,3));
  }
  expect(f.repo.snapshot().targets[0]!.last_error_code).toBe('quota_retry_exhausted');
 });
 it('rejects a segment starting at a consumed event time, including copied non-last evidence', async () => {
  const f=fixture(); appendFileSync(f.path,quota(base+215_000)+quota(base+216_000));
  f.set(base+516_000); await f.engine().tick(); expect(f.calls).toHaveLength(1);
  writeFileSync(join(f.root,'sessions/overlap.jsonl'),meta(base+215_000)+quota(base+215_000));
  await f.engine().tick(); expect(f.calls).toHaveLength(1);
  expect(f.repo.snapshot().targets[0]!.state).toBe('needs_attention');
 });
 it.each(['pause','replace','checkpoint'])('fences %s from a second connection after target snapshot', async mode => {
  const f=fixture(); appendFileSync(f.path,quota(base+120_000)); f.set(base+300_000);
  const other=openDb(join(f.root,'test.sqlite'));
  const engine=createCodexDesktopResumeEngine(f.db,()=>{
   if(mode==='pause') other.prepare('UPDATE codex_desktop_resume_targets SET enabled=0').run();
   if(mode==='replace') other.prepare('UPDATE codex_desktop_resume_targets SET registered_at_ms=registered_at_ms+1').run();
   if(mode==='checkpoint') other.prepare("UPDATE codex_desktop_resume_targets SET completed_evidence_id='changed'").run();
   return [f.root];
  },async()=>{f.calls.push(id);return {accepted:true,code:'accepted'};},()=>base+300_000);
  try {await engine.tick(); expect(f.calls).toHaveLength(0); expect(f.repo.snapshot().action_in_progress).toBe(false);} finally {other.close();}
 });

 it('does not replenish the retry budget when stale reset values alternate', async () => {
  const f=fixture();
  for(let n=0;n<5;n++) {
   const at=base+215_000+n*310_000;
   appendFileSync(f.path,quota(at,n===3?'8:04 AM':'8:03 AM'));f.set(at+300_000);
   await f.engine().tick();expect(f.calls).toHaveLength(Math.min(n+1,3));
  }
  expect(f.repo.snapshot().targets[0]!.last_error_code).toBe('quota_retry_exhausted');
 });

 it('resets a spent retry budget only for a later future reset', async () => {
  const f=fixture();appendFileSync(f.path,quota(base+215_000));f.set(base+515_000);await f.engine().tick();
  appendFileSync(f.path,quota(base+600_000,'8:20 AM'));f.set(base+1_260_000);await f.engine().tick();
  const watermark=JSON.parse((f.db.prepare('SELECT action_high_watermark FROM codex_desktop_resume_targets').get() as {action_high_watermark:string}).action_high_watermark);
  expect(watermark.quota_retry_count).toBe(0);expect(f.calls).toHaveLength(2);
 });

});
