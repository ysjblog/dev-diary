// Isolated, bounded reader. Only allowlisted metadata leaves this process.
import { openSync, closeSync, fstatSync, readSync, realpathSync, lstatSync, readdirSync, constants } from 'node:fs';
import { resolve, sep, join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const digest=s=>createHash('sha256').update(s).digest('hex');
function safePath(root, locator) {
 if(typeof locator!=='string'||locator.split('/').some(part=>!part||part==='.'||part==='..'))throw Error();
 const base=realpathSync(root), path=resolve(base,locator);
 if(!path.startsWith(base+sep)||!/^(?:sessions|archived_sessions)\//.test(locator)||realpathSync(path)!==path)throw Error();
 return path;
}
function read(fd,start,length) {
 const b=Buffer.alloc(length);let n=0;
 while(n<length){const got=readSync(fd,b,n,length-n,start+n);if(!got)throw Error();n+=got;}
 return b;
}
function session(input) {
 if(!uuid.test(input.threadId))throw Error();
 const fd=openSync(safePath(input.root,input.locator),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try {
  const stat=fstatSync(fd);if(!stat.isFile())throw Error();
  const prefix=read(fd,0,Math.min(stat.size,512*1024)).toString('utf8').split('\n');prefix.pop();
  const metas=prefix.flatMap(l=>{try{const v=JSON.parse(l);return v.type==='session_meta'?[v.payload?.id]:[];}catch{return [];}});
  if(metas.length!==1||metas[0]!==input.threadId)throw Error();
  if(input.mode==='baseline')return {dev:stat.dev,ino:stat.ino,offset:stat.size,partial:stat.size>0&&read(fd,stat.size-1,1)[0]!==10};
  const b=input.baseline;
  if(stat.dev!==b.dev||stat.ino!==b.ino||stat.size<b.offset||stat.size-b.offset>1024*1024)throw Error();
  const raw=read(fd,b.offset,stat.size-b.offset); const end=raw.lastIndexOf(10);
  if(end<0)return {offset:b.offset,partial:b.partial,turn:null};
  const lines=raw.subarray(0,end).toString('utf8').split('\n');if(b.partial)lines.shift();
  let turn=null;
  for(const line of lines){
   try{const v=JSON.parse(line),at=Date.parse(v.timestamp);
    if(v.type==='event_msg'&&v.payload?.type==='task_started'&&uuid.test(v.payload.turn_id)
      &&Number.isFinite(at)&&at>=input.since&&at<=input.now){turn=digest(v.payload.turn_id);break;}
   }catch{/* incomplete or malformed records are not evidence */}
  }
  const after=fstatSync(fd);if(after.size<stat.size)throw Error();
  return {offset:b.offset+end+1,partial:false,turn};
 }finally{closeSync(fd);}
}
function snapshot(input) {
 const out={processes:[],process_status:'unavailable',responses:0,slow_responses:0,queue_rejections:0,log_files:0,log_status:'unavailable'};
 const ps=spawnSync('/bin/ps',['-axo','pid=,ppid=,stat=,comm='],{encoding:'utf8',timeout:1000,maxBuffer:256*1024,env:{PATH:'/usr/bin:/bin'},shell:false});
 if(ps.status===0&&!ps.error){
  out.process_status='sampled';
  for(const l of ps.stdout.split('\n')){
   const m=/^\s*(\d+)\s+(\d+)\s+([A-Za-z+<NstWX-]{1,12})\s+(.+)$/.exec(l);if(!m)continue;
   const name=m[4];let kind;
   if(name==='/Applications/ChatGPT.app/Contents/MacOS/ChatGPT'||name==='/Applications/ChatGPT.app/Contents/MacOS/Codex')kind='desktop';
   else if(name==='/Applications/ChatGPT.app/Contents/Resources/codex')kind='codex';
   else if(name.startsWith('/Applications/ChatGPT.app/Contents/Frameworks/')&&/Helper.*\.app\/Contents\/MacOS\//.test(name))kind='helper';
   if(kind&&out.processes.length<16)out.processes.push({pid:Number(m[1]),ppid:Number(m[2]),state:m[3],kind});
  }
 }
 try{
  const files=[];
  const children=(dir,pattern)=>{
   if(realpathSync(dir)!==resolve(dir))throw Error();
   const entries=readdirSync(dir);if(entries.length>100)throw Error();
   return entries.filter(n=>pattern.test(n)).sort().reverse();
  };
  const dates=[],logRoot=realpathSync(input.logRoot);
  // Discover recent actual log directories: a long-lived Desktop keeps writing
  // a file under its launch date, which may precede yesterday.
  outer:for(const year of children(logRoot,/^\d{4}$/).slice(0,2)){
   for(const month of children(join(logRoot,year),/^\d{2}$/)){
    for(const day of children(join(logRoot,year,month),/^\d{2}$/)){
     dates.push(join(logRoot,year,month,day));if(dates.length===2)break outer;
    }
   }
  }
  for(const dir of dates){
   for(const name of children(dir,/^codex-desktop-[a-zA-Z0-9-]+\.log$/)){
    const path=join(dir,name),s=lstatSync(path);if(s.isFile()&&!s.isSymbolicLink())files.push({path,time:s.mtimeMs});}
  }
  for(const f of files.sort((a,b)=>b.time-a.time).slice(0,4)){
   const fd=openSync(f.path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
   try{
    const s=fstatSync(fd);if(!s.isFile())throw Error();
    const len=Math.min(s.size,256*1024),start=s.size-len,lines=read(fd,start,len).toString('utf8').split('\n');lines.pop();if(start)lines.shift();
    out.log_files++;
    for(const l of lines){const t=/^\S*?(\d{4}-\d\d-\d\dT[0-9:.]+Z)/.exec(l);const at=t?Date.parse(t[1]):NaN;
     if(!Number.isFinite(at)||at<input.since||at>input.now)continue;
     if(/\bresponse_routed\b/.test(l)){out.responses++;const d=/\bdurationMs=(\d+)\b/.exec(l);if(d&&Number(d[1])>60000)out.slow_responses++;}
     if(/\bapp_server_client_request_queue_rejected\b/.test(l))out.queue_rejections++;
    }
   }finally{closeSync(fd);}
  }
  out.log_status='sampled';
 }catch{/* missing or incomplete sources are explicitly unavailable */}
 return out;
}
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>{input+=s;if(input.length>8192)process.exit(2);});
process.stdin.on('end',()=>{try{const v=JSON.parse(input);const result=v.mode==='snapshot'?snapshot(v):session(v);process.stdout.write(JSON.stringify(result));}catch{process.exitCode=2;}});
