import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codexTargetKeyDigest } from './codexDesktopResumeContracts.js';
import type { ResumeDispatcher } from './codexDesktopResumeEngine.js';

interface Source { root: string; locator: string; threadId: string }
interface Baseline { dev: number; ino: number; offset: number; partial: boolean }
interface Snapshot {
  processes: Array<{ pid: number; ppid: number; state: string; kind: string }>;
  process_status: string; responses: number; slow_responses: number; queue_rejections: number; log_files: number; log_status: string;
}
interface Observation {
  id: string; target: string; requested_at: number; deadline: number; checked_at: number;
  status: 'pending' | 'new_turn_observed' | 'not_observed' | 'source_unavailable';
  dispatch: 'unknown' | 'accepted' | 'failed'; baseline: Baseline | null; turn: string | null; snapshot: Snapshot | null;
}
interface Options { directory: string; resolveSource: (target: string) => Source | null; now?: () => number; logRoot?: string }
const worker = fileURLToPath(new URL('./codexResumeObservationWorker.mjs', import.meta.url));
const MAX_BYTES = 256 * 1024;
const hex = /^[a-f0-9]{64}$/;
const numeric = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
function keys(v: any, names: string[]): boolean {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join(',') === [...names].sort().join(',');
}
function baseline(v: any): v is Baseline {
  return keys(v,['dev','ino','offset','partial']) && numeric(v.dev) && numeric(v.ino) && numeric(v.offset) && typeof v.partial === 'boolean';
}
function snapshot(v: any): v is Snapshot {
  return keys(v,['processes','process_status','responses','slow_responses','queue_rejections','log_files','log_status'])
    && ['sampled','unavailable'].includes(v.process_status) && ['sampled','unavailable'].includes(v.log_status)
    && [v.responses,v.slow_responses,v.queue_rejections,v.log_files].every(numeric)
    && Array.isArray(v.processes) && v.processes.length <= 16 && v.processes.every((p: any) => keys(p,['pid','ppid','state','kind'])
      && numeric(p.pid) && numeric(p.ppid) && typeof p.state === 'string' && /^[A-Za-z+<NstWX-]{1,12}$/.test(p.state)
      && ['desktop','codex','helper'].includes(p.kind));
}
function valid(v: any): v is Observation {
  return keys(v,['id','target','requested_at','deadline','checked_at','status','dispatch','baseline','turn','snapshot'])
    && typeof v.id === 'string' && /^[a-f0-9]{32}$/.test(v.id) && typeof v.target === 'string' && hex.test(v.target)
    && [v.requested_at,v.deadline,v.checked_at].every(numeric) && v.deadline === v.requested_at + 600_000
    && ['pending','new_turn_observed','not_observed','source_unavailable'].includes(v.status)
    && ['unknown','accepted','failed'].includes(v.dispatch) && (v.baseline === null || baseline(v.baseline))
    && (v.turn === null || (typeof v.turn === 'string' && hex.test(v.turn))) && (v.snapshot === null || snapshot(v.snapshot));
}
function probe(input: object, timeout = 2000): any {
  const result = spawnSync(process.execPath,[worker], { input: JSON.stringify(input), encoding:'utf8', timeout,
    maxBuffer: 16 * 1024, shell:false, env: { PATH:'/usr/bin:/bin' } });
  if (result.error || result.status !== 0) throw new Error('observation_probe_failed');
  return JSON.parse(result.stdout);
}

/** Local diagnostics only: no dispatch retry, DB write, task navigation or remote access. */
export function createCodexResumeObserver(options: Options) {
  const now = options.now ?? Date.now;
  const file = join(options.directory,'observations.json');
  let records: Observation[] = []; let healthy = true; let warned = false;
  const warn = () => { if (!warned) { warned = true; process.stderr.write('DevDiary resume diagnostics unavailable; continuation behavior unchanged.\n'); } };
  const ensureDirectory = () => {
    mkdirSync(options.directory,{recursive:true,mode:0o700});
    const stat = lstatSync(options.directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('diagnostic_directory_invalid');
  };
  const safeExisting = () => {
    try { const s=lstatSync(file); if(!s.isFile() || s.isSymbolicLink() || s.nlink!==1) throw new Error('diagnostic_file_invalid'); }
    catch(e) { if ((e as NodeJS.ErrnoException).code!=='ENOENT') throw e; }
  };
  const save = () => {
    ensureDirectory();safeExisting();
    const raw=JSON.stringify(records)+'\n';if(Buffer.byteLength(raw)>MAX_BYTES)throw new Error('diagnostic_limit');
    const temporary=join(options.directory,`.observations-${randomBytes(12).toString('hex')}.tmp`);
    try { writeFileSync(temporary,raw,{flag:'wx',mode:0o600});renameSync(temporary,file); }
    finally { try { unlinkSync(temporary); } catch { /* rename consumed the temporary file */ } }
  };
  try {
    ensureDirectory();safeExisting();
    let fd: number | undefined;
    try {
      fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
      const s=fstatSync(fd);if(!s.isFile()||s.size>MAX_BYTES)throw new Error('diagnostic_state_invalid');
      const b=Buffer.alloc(s.size);let at=0;while(at<b.length){const n=readSync(fd,b,at,b.length-at,at);if(!n)throw new Error('short_read');at+=n;}
      const value: unknown=JSON.parse(b.toString('utf8'));
      if(!Array.isArray(value)||value.length>100||!value.every(valid))throw new Error('diagnostic_state_invalid');
      records=value;
    } catch(e) { if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e; }
    finally { if(fd!==undefined)closeSync(fd); }
    save();
  } catch { healthy=false;warn(); }
  const capture = (record: Observation) => {
    try {
      const value=probe({mode:'snapshot',since:record.requested_at,now:now(),logRoot:options.logRoot??join(homedir(),'Library/Logs/com.openai.codex')},4000);
      if(!snapshot(value))throw new Error('invalid_snapshot');record.snapshot=value;
    } catch { record.snapshot={processes:[],process_status:'unavailable',responses:0,slow_responses:0,queue_rejections:0,log_files:0,log_status:'unavailable'};warn(); }
  };
  const begin = (threadId: string): Observation | null => {
    if(!healthy)return null;
    if(records.filter(r=>r.status==='pending').length>=32){warn();return null;}
    const at=now(),target=codexTargetKeyDigest(threadId);
    const record: Observation={id:randomBytes(16).toString('hex'),target,requested_at:at,deadline:at+600_000,checked_at:at,status:'pending',dispatch:'unknown',baseline:null,turn:null,snapshot:null};
    try {
      const source=options.resolveSource(target);if(!source||source.threadId!==threadId)throw new Error('missing_source');
      const value=probe({mode:'baseline',...source});if(!baseline(value))throw new Error('invalid_baseline');record.baseline=value;
    }catch{record.status='source_unavailable';}
    if(records.length===100){const index=records.findIndex(r=>r.status!=='pending');if(index<0)throw new Error('diagnostic_limit');records.splice(index,1);}
    records.push(record);save();return record;
  };
  const wrap = (dispatch: ResumeDispatcher): ResumeDispatcher => async (threadId,context) => {
    let record: Observation | null=null;
    try{record=begin(threadId);}catch{healthy=false;warn();}
    try {
      const result=await dispatch(threadId,context);
      if(record){record.dispatch=result.accepted?'accepted':'failed';try{if(record.status==='source_unavailable')capture(record);save();}catch{healthy=false;warn();}}
      return result;
    } catch(error) {
      if(record){record.dispatch='failed';try{save();}catch{healthy=false;warn();}}
      throw error;
    }
  };
  const tick = () => {
    if(!healthy)return;
    // Two sources per tick bound overhead; oldest checked sources get priority.
    const pending=records.filter(r=>r.status==='pending').sort((a,b)=>a.checked_at-b.checked_at).slice(0,2);
    for(const record of pending){
      record.checked_at=now();
      try{
        const source=options.resolveSource(record.target);if(!source||codexTargetKeyDigest(source.threadId)!==record.target||!record.baseline)throw new Error('missing_source');
        const value=probe({mode:'observe',...source,baseline:record.baseline,since:record.requested_at,now:Math.min(now(),record.deadline)});
        if(!keys(value,['offset','partial','turn'])||!numeric(value.offset)||value.offset<record.baseline.offset||typeof value.partial!=='boolean'
          ||!(value.turn===null||(typeof value.turn==='string'&&hex.test(value.turn))))throw new Error('invalid_observation');
        record.baseline.offset=value.offset;record.baseline.partial=value.partial;
        if(value.turn){record.turn=value.turn;record.status='new_turn_observed';}
        else if(now()>=record.deadline)record.status='not_observed';
      }catch{record.status='source_unavailable';}
      if(record.status==='source_unavailable'||record.status==='not_observed')capture(record);
    }
    if(pending.length)try{save();}catch{healthy=false;warn();}
  };
  return {wrap,tick};
}
