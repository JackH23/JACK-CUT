const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawn,execFileSync}=require('node:child_process');
const {verifyBundle,compile}=require('./compileGraph.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const binary=name=>process.env[name+'_PATH'] || name.toLowerCase();
function read(file){try{return fs.readFileSync(file,'utf8').trim();}catch{return null;}}
function cgroupRoot(){
  const relative=read('/proc/self/cgroup')?.split('\n').find(line=>line.startsWith('0::'))?.slice(3);
  const full=relative?path.join('/sys/fs/cgroup',relative):'/sys/fs/cgroup';
  return fs.existsSync(path.join(full,'cpu.max'))?full:'/sys/fs/cgroup';
}
function observe(){
  const ffmpegVersion=execFileSync(binary('FFMPEG'),['-version'],{encoding:'utf8',windowsHide:true});
  const ffprobeVersion=execFileSync(binary('FFPROBE'),['-version'],{encoding:'utf8',windowsHide:true});
  const group=cgroupRoot(),cpuMax=read(path.join(group,'cpu.max')),memoryMax=read(path.join(group,'memory.max'));
  const [quota,period]=(cpuMax||'max 1').split(/\s+/);
  const settings={threads:Math.max(1,Math.min(8,Math.floor(Number(process.env.FFMPEG_THREADS)||1))),
    preset:process.env.FFMPEG_PRESET||'medium',encoder:process.env.FFMPEG_VIDEO_ENCODER||'libx264',prepareConcurrency:Math.min(8,Math.max(1,Number(process.env.EXPORT_PREPARE_CONCURRENCY)||3))};
  let fontFingerprint=null;
  if(os.platform()==='linux'){
    try{const files=[...new Set(execFileSync('fc-list',['-f','%{file}\n'],{encoding:'utf8'}).trim().split('\n'))].sort();
      fontFingerprint=hash(files.map(file=>path.basename(file)+':'+hash(fs.readFileSync(file))).sort().join('\n'));}catch{}
  }else if(os.platform()==='win32'){
    try{const folder=path.join(process.env.WINDIR||'C:/Windows','Fonts');
      fontFingerprint=hash(fs.readdirSync(folder).filter(file=>/\.(ttf|ttc|otf)$/i.test(file)).sort().map(file=>file+':'+hash(fs.readFileSync(path.join(folder,file)))).join('\n'));}catch{}
  }
  return {platform:os.platform(),architecture:os.arch(),cpuModel:os.cpus()[0]?.model,
    cpuCores:quota!=='max'?Number(quota)/Number(period):os.availableParallelism(),
    ramBytes:memoryMax && memoryMax!=='max'?Number(memoryMax):os.totalmem(),
    cpuLimitSource:quota!=='max'?'cgroup-v2':'host-affinity',memoryLimitSource:memoryMax&&memoryMax!=='max'?'cgroup-v2':'host',
    ffmpegVersionSha256:hash(ffmpegVersion),ffprobeVersionSha256:hash(ffprobeVersion),ffmpegVersion,ffprobeVersion,
    fontFingerprint,nodeVersion:process.version,settings,
    exportTimeoutMs:process.env.EXPORT_TIMEOUT_MS?Number(process.env.EXPORT_TIMEOUT_MS):null,
    maxConcurrentRenders:Math.max(1,Math.floor(Number(process.env.EXPORT_MAX_CONCURRENT_RENDERS)||1)),
    baselineRef:process.env.RENDER_GIT_COMMIT||null,concurrency:null,isolatedExecutionConfirmed:false,
    projectJobAssociationVerified:false,failureTimeSnapshotVerified:false,renderTieOrderVerified:false};
}
function checkProfile(profile,observed,snapshot){
  if(profile.exportTimeoutMs!==7200000 || (process.env.EXPORT_TIMEOUT_MS && Number(process.env.EXPORT_TIMEOUT_MS)!==7200000))throw Error('EXPORT_TIMEOUT_MS must remain 7200000');
  for(const field of ['platform','architecture','cpuModel','cpuCores','ramBytes','ffmpegVersionSha256','ffprobeVersionSha256','nodeVersion']){
    if(profile[field]==null || profile[field]!==observed[field])throw Error('Production comparison blocked: '+field+' is missing or does not match');
  }
  if(snapshot.items.some(item=>item.item_type==='TEXT') && (!profile.fontFingerprint || profile.fontFingerprint!==observed.fontFingerprint))throw Error('Production fonts are not verified');
  if(['threads','preset','encoder','prepareConcurrency'].some(key=>profile.settings?.[key]!==observed.settings[key]))throw Error('Renderer environment differs from production settings');
  if(!Number.isInteger(profile.concurrency)||profile.concurrency<1||profile.concurrency>profile.maxConcurrentRenders||profile.maxConcurrentRenders!==observed.maxConcurrentRenders)throw Error('Production concurrency is not verified');
  if(profile.isolatedExecutionConfirmed!==true || profile.projectJobAssociationVerified!==true || profile.failureTimeSnapshotVerified!==true)throw Error('Isolation, failing-job project association, and failure-time snapshot require verified read-only evidence');
  if(snapshot.provenance.renderTieOrderUnverified && profile.renderTieOrderVerified!==true)throw Error('Original rendering order for simultaneous clips is unverified');
  if(!/^[a-f0-9]{40}$/i.test(profile.baselineRef||''))throw Error('Verified production baseline revision is required');
}
async function render(ffmpeg,prepared,folder,deadline){
  const stderr=fs.createWriteStream(path.join(folder,'ffmpeg.log'),{mode:0o600});
  const started=Date.now();
  const child=spawn(ffmpeg,['-hide_banner','-benchmark',...prepared.args],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let buffer='',last={},benchmarkPeakKiB=null,peakSampleKiB=0,timedOut=false,spawnCode=null;
  child.stdout.on('data',chunk=>{
    buffer+=chunk.toString();const lines=buffer.split(/\r?\n/);buffer=lines.pop();
    for(const line of lines){const separator=line.indexOf('=');if(separator>=0)last[line.slice(0,separator)]=line.slice(separator+1);}
  });
  child.stderr.on('data',chunk=>{stderr.write(chunk);const match=chunk.toString().match(/maxrss=(\d+)KiB/);if(match)benchmarkPeakKiB=Number(match[1]);});
  child.once('error',error=>{spawnCode=error.code||'SPAWN_FAILED';});
  const sample=setInterval(()=>{const status=read('/proc/'+child.pid+'/status');const values=[...(status||'').matchAll(/Vm(?:HWM|RSS):\s+(\d+)/g)].map(m=>Number(m[1]));peakSampleKiB=Math.max(peakSampleKiB,...values);},200);
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},Math.max(1,deadline-Date.now()));
  let killTimer;
  child.once('exit',()=>{clearTimeout(killTimer);});
  // Stop only this isolated benchmark child; application settings are untouched.
  timer.unref();
  const forced=setInterval(()=>{if(timedOut&&!killTimer){killTimer=setTimeout(()=>child.kill('SIGKILL'),5000);}},200);
  const {exitCode,signal}=await new Promise(resolve=>child.once('close',(exitCode,signal)=>resolve({exitCode,signal})));
  clearTimeout(timer);clearTimeout(killTimer);clearInterval(sample);clearInterval(forced);
  await new Promise(resolve=>stderr.end(resolve));
  const finalLog=read(path.join(folder,'ffmpeg.log'));
  const peakMatch=finalLog?.match(/maxrss=(\d+)KiB/);
  if(peakMatch)benchmarkPeakKiB=Number(peakMatch[1]);
  const seconds=(Date.now()-started)/1000;
  return {exitCode,signal,spawnCode,timedOut,renderSeconds:seconds,
    peakMemoryKiB:benchmarkPeakKiB??(peakSampleKiB||null),peakMemorySource:benchmarkPeakKiB!=null?'ffmpeg-maxrss':'proc-sampled',
    ffmpegSpeed:Number.parseFloat(last.speed)||null,renderedSeconds:Number(last.out_time_us||0)/1e6,
    measuredAverageSpeed:Number(last.out_time_us||0)/1e6/seconds,frames:Number(last.frame)||null,output:prepared.output};
}
async function run({repository,bundleDir,profileFile,outputDir}){
  const {snapshot,digest}=await verifyBundle(bundleDir);
  const profile=JSON.parse(fs.readFileSync(profileFile,'utf8')),observed=observe();
  checkProfile(profile,observed,snapshot);
  const output=path.resolve(outputDir);fs.mkdirSync(path.dirname(output),{recursive:true,mode:0o700});fs.mkdirSync(output,{mode:0o700});
  fs.writeFileSync(path.join(output,'observed-profile.json'),JSON.stringify(observed,null,2),{mode:0o600});
  const results={snapshotSha256:digest,projectId:snapshot.projectId,jobId:snapshot.jobId,profile,observed,
    clipCount:snapshot.items.length,assetCount:snapshot.assets.length,variants:{},productionFixed:false};
  for(const variant of ['baseline','optimized']){
    const start=Date.now(),deadline=start+7200000;
    const checked=await verifyBundle(bundleDir);
    if(checked.digest!==digest)throw Error('Snapshot changed between variants');
    const prepared=[];
    for(let index=0;index<profile.concurrency;index++){
      const folder=path.join(output,variant+'-'+index);
      prepared.push(await compile({repository:path.resolve(repository),bundle:snapshot,workDir:folder,variant,baselineRef:profile.baselineRef,settings:profile.settings,ffprobe:binary('FFPROBE')}));
    }
    let cgroupPeakBytes=null;
    const sample=setInterval(()=>{const value=Number(read(path.join(cgroupRoot(),'memory.current')));if(value>0)cgroupPeakBytes=Math.max(cgroupPeakBytes||0,value);},200);
    const jobs=await Promise.all(prepared.map((graph,index)=>render(binary('FFMPEG'),graph,path.join(output,variant+'-'+index),deadline)));
    clearInterval(sample);
    await verifyBundle(bundleDir); // Detect input changes during the run.
    const elapsed=(Date.now()-start)/1000;
    results.variants[variant]={totalOfflineWorkSeconds:elapsed,prepare:prepared.map(({args,...data})=>data),jobs,cgroupPeakBytes,
      completedWithinTwoHours:elapsed<=7200 && jobs.every(job=>job.exitCode===0&&!job.timedOut),
      censoredAtDeadline:jobs.some(job=>job.timedOut)};
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2),{mode:0o600});
    console.log(JSON.stringify({variant,completedWithinTwoHours:results.variants[variant].completedWithinTwoHours,totalOfflineWorkSeconds:elapsed,cohortCount:jobs.length}));
  }
  const before=results.variants.baseline,after=results.variants.optimized;
  if(before.jobs.every(job=>job.exitCode===0)&&after.jobs.every(job=>job.exitCode===0)){
    results.improvementPercent=100*(1-after.totalOfflineWorkSeconds/before.totalOfflineWorkSeconds);
    results.speedup=before.totalOfflineWorkSeconds/after.totalOfflineWorkSeconds;
  }else if(before.censoredAtDeadline&&after.completedWithinTwoHours){
    results.improvementLowerBoundPercent=100*(1-after.totalOfflineWorkSeconds/7200);
  }
  results.applicationDeadlineCompletionVerified=false; // Downloads, upload, DB and slot waits were not run.
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2),{mode:0o600});
  return results;
}
module.exports={observe,checkProfile,run,render};
if(require.main===module){
  if(process.argv[2]==='--inspect')console.log(JSON.stringify(observe(),null,2));
  else {const [bundleDir,profileFile,outputDir]=process.argv.slice(2);run({repository:path.resolve(__dirname,'../../..'),bundleDir,profileFile,outputDir})
    .catch(error=>{console.error(error.message);process.exitCode=1;});}
}
