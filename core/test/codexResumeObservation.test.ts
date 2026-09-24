import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCodexResumeObserver } from '../src/services/codexResumeObservation.js';

const id = '0190abcd-ef00-7000-8000-000000000003';
const turn = '0190abcd-ef00-7000-8000-000000000004';
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(p => rmSync(p,{recursive:true,force:true})));
function setup() {
 const dir=mkdtempSync(join(tmpdir(),'resume-observer-')); dirs.push(dir);
 const root=join(dir,'home'); mkdirSync(join(root,'sessions'),{recursive:true});
 const path=join(root,'sessions','test.jsonl');
 writeFileSync(path,JSON.stringify({type:'session_meta',payload:{id}})+'\n');
 let time=Date.parse('2026-09-23T00:00:00Z');
 const options={directory:join(dir,'diagnostics'),resolveSource:()=>({root,locator:'sessions/test.jsonl',threadId:id}),now:()=>time,logRoot:join(dir,'logs')};
 const make=()=>createCodexResumeObserver(options);
 const records=()=>JSON.parse(readFileSync(join(options.directory,'observations.json'),'utf8'));
 const event=(stamp=time)=>JSON.stringify({timestamp:new Date(stamp).toISOString(),type:'event_msg',payload:{type:'task_started',turn_id:turn,private:'SECRET_SENTINEL'}})+'\n';
 return {dir,root,path,options,make,records,event,advance:(n:number)=>time+=n};
}
describe('bounded local resume observation',()=>{
 it('observes only appended genuine start evidence and persists no private content',async()=>{
  const f=setup(); appendFileSync(f.path,f.event()); const obs=f.make(); let calls=0;
  const result=await obs.wrap(async()=>{calls++;appendFileSync(f.path,f.event());return {accepted:true,code:'queued'};})(id,{codexHome:f.root});
  expect(result.accepted).toBe(true);obs.tick();
  expect(f.records()[0].status).toBe('new_turn_observed'); expect(calls).toBe(1);
  const raw=JSON.stringify(f.records());for(const s of [id,turn,'SECRET_SENTINEL',f.root])expect(raw).not.toContain(s);
  expect(statSync(join(f.options.directory,'observations.json')).mode & 0o777).toBe(0o600);
 });
 it('ignores old starts and quoted events, survives restart then captures once at deadline',async()=>{
  const f=setup();const obs=f.make();await obs.wrap(async()=>({accepted:true,code:'queued'}))(id,{codexHome:f.root});
  appendFileSync(f.path,f.event(Date.parse('2026-09-22T00:00:00Z'))+JSON.stringify({type:'response_item',payload:{type:'task_started',turn_id:turn}})+'\n');
  obs.tick();expect(f.records()[0].status).toBe('pending');f.advance(600_000);
  const restarted=f.make();restarted.tick();expect(f.records()[0].status).toBe('not_observed');
  expect(f.records()[0].snapshot).toBeDefined();const saved=f.records(); restarted.tick();expect(f.records()).toEqual(saved);
 });
 it.each(['truncate','replace','symlink','overflow'])('marks %s as uncertain, never as start',async mode=>{
  const f=setup();const obs=f.make();await obs.wrap(async()=>({accepted:true,code:'queued'}))(id,{codexHome:f.root});
  if(mode==='truncate')writeFileSync(f.path,'');
  if(mode==='replace'){rmSync(f.path);writeFileSync(f.path,f.event());}
  if(mode==='symlink'){rmSync(f.path);symlinkSync('/etc/hosts',f.path);}
  if(mode==='overflow')appendFileSync(f.path,'x'.repeat(1024*1024+1));
  obs.tick();expect(f.records()[0].status).toBe('source_unavailable');
 });
 it('diagnostic write failure cannot change or duplicate dispatch',async()=>{
  const f=setup();writeFileSync(f.options.directory,'not a directory'); const obs=f.make();let calls=0;
  const result={accepted:false,code:'dispatch_failed',releaseLease:false};
  expect(await obs.wrap(async()=>{calls++;return result;})(id,{codexHome:f.root})).toEqual(result);obs.tick();expect(calls).toBe(1);
 });
 it('rejects traversal and does not follow diagnostic file symlinks',async()=>{
  const f=setup();f.options.resolveSource=()=>({root:f.root,locator:'../secret',threadId:id});
  const obs=f.make();await obs.wrap(async()=>({accepted:true,code:'queued'}))(id,{codexHome:f.root});expect(f.records()[0].status).toBe('source_unavailable');
  const victim=join(f.dir,'victim');writeFileSync(victim,'SECRET_SENTINEL');rmSync(join(f.options.directory,'observations.json'));symlinkSync(victim,join(f.options.directory,'observations.json'));
  f.make().tick();expect(readFileSync(victim,'utf8')).toBe('SECRET_SENTINEL');
 });
 it('refuses malformed persistent state without reading injected sources',()=>{
  const f=setup();f.make();writeFileSync(join(f.options.directory,'observations.json'),JSON.stringify([{status:'pending',target:'../../SECRET_SENTINEL'}]));let reads=0;
  f.options.resolveSource=()=>{reads++;throw new Error('SECRET_SENTINEL');};f.make().tick();expect(reads).toBe(0);
 });
 it('aggregates real-shaped vendor log metadata without retaining raw log content',async()=>{
  const f=setup(),logDir=join(f.options.logRoot,'2026','09','10');mkdirSync(logDir,{recursive:true});
  writeFileSync(join(logDir,'codex-desktop-test.log'),[
   '2026-09-23T00:01:00.000Z info [AppServerConnection] response_routed durationMs=70000 method=configRequirements/read SECRET_SENTINEL',
   '2026-09-23T00:02:00.000Z info app_server_client_request_queue_rejected SECRET_SENTINEL',
   '2026-09-22T00:00:00.000Z info response_routed durationMs=1',
   ''
  ].join('\n'));
  const obs=f.make();await obs.wrap(async()=>({accepted:true,code:'queued'}))(id,{codexHome:f.root});f.advance(600_000);obs.tick();
  expect(f.records()[0].snapshot).toMatchObject({responses:1,slow_responses:1,queue_rejections:1,log_files:1,log_status:'sampled'});
  expect(JSON.stringify(f.records())).not.toContain('SECRET_SENTINEL');
 });
 it('preserves partial appended lines until complete, without accepting a pre-dispatch partial line',async()=>{
  const f=setup();appendFileSync(f.path,f.event().slice(0,-2));const obs=f.make();
  await obs.wrap(async()=>({accepted:true,code:'queued'}))(id,{codexHome:f.root});appendFileSync(f.path,'}\n');obs.tick();expect(f.records()[0].status).toBe('pending');
  const line=f.event();appendFileSync(f.path,line.slice(0,20));obs.tick();expect(f.records()[0].status).toBe('pending');
  appendFileSync(f.path,line.slice(20));obs.tick();expect(f.records()[0].status).toBe('new_turn_observed');
 });
 it('bounds retained history and never persists untrusted dispatcher error text',async()=>{
  const f=setup();f.options.resolveSource=()=>{throw new Error('SECRET_SENTINEL');};const obs=f.make();
  for(let n=0;n<105;n++)await obs.wrap(async()=>({accepted:false,code:'SECRET_SENTINEL'}))(id,{codexHome:f.root});
  expect(f.records()).toHaveLength(100);const raw=readFileSync(join(f.options.directory,'observations.json'),'utf8');
  expect(Buffer.byteLength(raw)).toBeLessThan(256*1024);expect(raw).not.toContain('SECRET_SENTINEL');
 });
 it('propagates original dispatcher exceptions without retry or private logging',async()=>{
  const f=setup(),obs=f.make();let calls=0;const error=new Error('SECRET_SENTINEL');
  await expect(obs.wrap(async()=>{calls++;throw error;})(id,{codexHome:f.root})).rejects.toBe(error);
  expect(calls).toBe(1);expect(f.records()[0].dispatch).toBe('failed');expect(JSON.stringify(f.records())).not.toContain('SECRET_SENTINEL');
 });

 it('does not count a start after the deadline when a delayed tick finally runs',async()=>{
  const f=setup(),obs=f.make();await obs.wrap(async()=>({accepted:true,code:'queued'}))(id,{codexHome:f.root});
  f.advance(600_001);appendFileSync(f.path,f.event());obs.tick();expect(f.records()[0].status).toBe('not_observed');expect(f.records()[0].turn).toBeNull();
 });
 it('accepts evidence at the exact deadline even when the observer runs later',async()=>{
  const f=setup(),obs=f.make();await obs.wrap(async()=>({accepted:true,code:'queued'}))(id,{codexHome:f.root});
  f.advance(600_000);appendFileSync(f.path,f.event());f.advance(1);obs.tick();expect(f.records()[0].status).toBe('new_turn_observed');
 });

 it('rejects dot traversal even when it stays inside the Codex home',async()=>{
  const f=setup();writeFileSync(join(f.root,'outside.jsonl'),JSON.stringify({type:'session_meta',payload:{id}})+'\n');
  f.options.resolveSource=()=>({root:f.root,locator:'sessions/../outside.jsonl',threadId:id});
  const obs=f.make();await obs.wrap(async()=>({accepted:true,code:'queued'}))(id,{codexHome:f.root});expect(f.records()[0].status).toBe('source_unavailable');
 });

});
