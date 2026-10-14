// Run the real controller's graph preparation, with no database/network/job writes.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const {EventEmitter}=require('node:events');
const {execFileSync}=require('node:child_process');
const crypto=require('node:crypto');
async function sha256(file){const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex');}
async function verifyBundle(directory){
  const root=fs.realpathSync(directory),encoded=fs.readFileSync(path.join(root,'snapshot.json'));
  const digest=crypto.createHash('sha256').update(encoded).digest('hex');
  if(fs.readFileSync(path.join(root,'snapshot.sha256'),'utf8').trim()!==digest)throw Error('Snapshot checksum mismatch');
  const snapshot=JSON.parse(encoded);
  if(snapshot.schemaVersion!==1 || !Array.isArray(snapshot.items) || !snapshot.items.length || !Array.isArray(snapshot.assets))throw Error('Invalid snapshot');
  const ids=new Set();
  for(const asset of snapshot.assets){
    if(ids.has(asset.id))throw Error('Duplicate asset identity');ids.add(asset.id);
    const file=fs.realpathSync(path.resolve(root,asset.file));
    if(!file.startsWith(root+path.sep) || !fs.statSync(file).isFile() || fs.statSync(file).size!==asset.bytes || await sha256(file)!==asset.sha256)throw Error('Asset checksum/path mismatch');
    asset.localPath=file;
  }
  for(const item of snapshot.items)if(item.item_type==='MEDIA'&&!ids.has(item.media_id))throw Error('Missing timeline asset');
  return {snapshot,digest};
}
async function compile({repository,bundle,workDir,variant,baselineRef,settings,ffprobe}){
  const controllerPath=path.join(repository,'backend/controllers/exportController.js');
  const nativeRequire=createRequire(controllerPath);
  const gitFile=relative=>execFileSync('git',['show',baselineRef+':'+relative],{cwd:repository,encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true});
  const source=variant==='baseline'?gitFile('backend/controllers/exportController.js'):fs.readFileSync(controllerPath,'utf8');
  const clipPath=path.join(repository,'backend/utils/clipAnimationFilter.js');
  const clipSource=variant==='baseline'?gitFile('backend/utils/clipAnimationFilter.js'):fs.readFileSync(clipPath,'utf8');
  const clipModule={exports:{}};
  vm.runInNewContext(clipSource,{require:createRequire(clipPath),module:clipModule,exports:clipModule.exports},{filename:clipPath});
  // Other renderer dependencies must be identical to baseline; do not silently
  // benchmark a mixed historical implementation if unrelated helpers changed.
  for(const relative of ['backend/utils/mediaLayout.js','backend/utils/textAnimationAss.js','backend/utils/textFontMetrics.js','backend/utils/mediaEffectFilter.js','frontend/lib/mediaAnimation.js','frontend/lib/textAnimation.js','frontend/lib/textLayout.json']){
    if(gitFile(relative).replace(/\r\n/g,'\n')!==fs.readFileSync(path.join(repository,relative),'utf8').replace(/\r\n/g,'\n'))throw Error('Renderer dependency differs from baseline: '+relative);
  }
  fs.mkdirSync(workDir,{recursive:true,mode:0o700});
  const linked=new Set(bundle.assets.map(asset=>asset.id));
  const media=bundle.assets.map(asset=>({...asset,file_path:asset.localPath}));
  const allowedPaths=new Set(media.map(asset=>asset.file_path));
  const lifecycle={jobs:new Map(),checkpoint:async()=>{},assertRunning(){},trace(){},release(){},
    withStartLock:async(job,callback)=>callback(),finish:async()=>{throw Error('Job persistence is disabled');},stop(job){job.abort.abort();}};
  let args;const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();
  const blocked=()=>{throw Error('Production mutation/network operation is disabled');};
  const requireMock=name=>{
    if(name==='../services/exportLifecycle')return {createExportLifecycle:()=>lifecycle};
    if(name==='../services/renderSlots')return {slots:{acquire:async()=>()=>{}}};
    if(name==='../models/Project')return {sequelize:{}};
    if(name==='../models/Media')return {findAll:async()=>media};
    if(name==='../models/ProjectMedia')return {findOne:async({where})=>where.project_id===bundle.projectId&&linked.has(where.media_id)?{}:null};
    if(name==='../models/TimelineItem'||name==='../models/ExportJob')return new Proxy({}, {get:()=>blocked});
    if(name==='../services/fileAccess')return {fileUrl:blocked};
    if(name==='../services/storage')return {workspace:async()=>workDir,materialize:async file=>{if(!allowedPaths.has(file))throw Error('Uncaptured source');return file;},persist:blocked,cleanup:blocked,referenceFor:blocked};
    if(name==='../utils/clipAnimationFilter')return clipModule.exports;
    if(name==='../utils/mediaStreams')return {hasAudioStream:async file=>{
      const result=JSON.parse(execFileSync(ffprobe,['-v','error','-select_streams','a','-show_entries','stream=index','-of','json',file],{encoding:'utf8',maxBuffer:1024*1024,windowsHide:true}));
      return result.streams.length>0;
    }};
    if(name==='node:child_process')return {spawn:(_,captured)=>{if(args)throw Error('Multiple renderer spawns');args=captured;return child;}};
    return nativeRequire(name);
  };
  const module={exports:{}};
  const rendererEnv={EXPORT_TIMEOUT_MS:'7200000',EXPORT_PREPARE_CONCURRENCY:String(settings.prepareConcurrency),FFMPEG_THREADS:String(settings.threads),FFMPEG_PRESET:settings.preset,FFMPEG_VIDEO_ENCODER:settings.encoder};
  vm.runInNewContext(source+'\nmodule.exports.__benchmarkRender=renderExport;',{require:requireMock,module,exports:module.exports,
    process:{env:rendererEnv,cwd:()=>path.join(repository,'backend')},console:{log(){},error(){}},Date,Number,String,Map,Set,JSON},{filename:controllerPath});
  const job={id:'00000000-0000-4000-8000-000000000001',projectId:bundle.projectId,createdAt:Date.now(),deadlineAt:Date.now()+7200000,
    status:'processing',progress:0,abort:new AbortController()};
  const started=Date.now();await module.exports.__benchmarkRender(job,bundle.items);
  if(!args)throw Error('The real controller could not prepare this snapshot');
  const duration=Math.max(...bundle.items.map(item=>Number(item.start_time)+Number(item.duration)));
  const graph=args[args.indexOf('-filter_complex')+1];
  fs.writeFileSync(path.join(workDir,'ffmpeg-args.json'),JSON.stringify(args,null,2),{mode:0o600});
  return {args,duration,prepareSeconds:(Date.now()-started)/1000,
    sourceHashes:{controller:crypto.createHash('sha256').update(source).digest('hex'),animation:crypto.createHash('sha256').update(clipSource).digest('hex')},
    graph:{characters:graph.length,overlays:(graph.match(/\boverlay=/g)||[]).length,geq:(graph.match(/\bgeq=/g)||[]).length,luts:(graph.match(/\blutyuv@/g)||[]).length},output:args.at(-1)};
}
module.exports={verifyBundle,compile,sha256};
