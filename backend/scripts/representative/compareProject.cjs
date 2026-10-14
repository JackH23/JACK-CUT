const fs=require('node:fs'),path=require('node:path');
const {spawn,execFileSync}=require('node:child_process');
const crypto=require('node:crypto');
const {verifyBundle}=require('./compileGraph.cjs');
const ffmpeg=process.env.FFMPEG_PATH||'ffmpeg',ffprobe=process.env.FFPROBE_PATH||'ffprobe';
const hashFile=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function probe(file){return JSON.parse(execFileSync(ffprobe,['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8',maxBuffer:2*1024*1024,windowsHide:true}));}
async function execute(args,logFile){
  const log=fs.createWriteStream(logFile,{mode:0o600});const finished=new Promise(resolve=>log.once('finish',resolve));
  const child=spawn(ffmpeg,args,{cwd:path.dirname(logFile),windowsHide:true,stdio:['ignore','ignore','pipe']});
  let spawnCode;child.stderr.pipe(log);child.once('error',error=>{spawnCode=error.code;});
  const code=await new Promise(resolve=>child.once('close',resolve));
  await finished;
  if(code!==0)throw Error('Output comparison failed; inspect the private log. '+(spawnCode||''));
  return fs.readFileSync(logFile,'utf8');
}
async function compare({outputDir,snapshot,digest}){
  const directory=path.resolve(outputDir),results=JSON.parse(fs.readFileSync(path.join(directory,'results.json'),'utf8'));
  if(digest && digest!==results.snapshotSha256)throw Error('Comparison snapshot differs from the renderer input');
  const pairs=results.variants.baseline?.jobs?.map((before,index)=>[before,results.variants.optimized?.jobs?.[index]])||[];
  if(!pairs.length || pairs.some(([before,after])=>!after||before.exitCode!==0||after.exitCode!==0||before.timedOut||after.timedOut))throw Error('Complete baseline and optimized outputs are required; censored runs cannot pass validation');
  const duration=Math.max(...snapshot.items.map(item=>Number(item.start_time)+Number(item.duration)));
  const checked=[];
  for(const [index,[before,after]] of pairs.entries()){
    const b=probe(before.output),a=probe(after.output),bv=b.streams.find(s=>s.codec_type==='video'),av=a.streams.find(s=>s.codec_type==='video');
    const aa=a.streams.find(s=>s.codec_type==='audio'),ba=b.streams.find(s=>s.codec_type==='audio');
    if(!bv||!av||!aa||!ba||Math.abs(Number(a.format.duration)-duration)>.08||Math.abs(Number(b.format.duration)-duration)>.08)throw Error('Duration or required streams differ from the actual timeline');
    for(const field of ['width','height','r_frame_rate','nb_frames'])if(bv[field]!==av[field])throw Error('Video metadata mismatch: '+field);
    if(Number(av.nb_frames)!==Math.ceil(duration*30))throw Error('Unexpected frame count');
    for(const field of ['sample_rate','channels','duration'])if(aa[field]!==ba[field])throw Error('Audio metadata mismatch: '+field);
    const frameLog=await execute(['-hide_banner','-nostats','-i',before.output,'-i',after.output,'-filter_complex','[0:v][1:v]psnr=stats_file='+path.basename('frames-'+index+'.txt'),'-an','-f','null','-'],path.join(directory,'frame-compare-'+index+'.log'));
    const psnr=frameLog.match(/PSNR[^\r\n]*/)?.[0];
    if(!psnr?.includes('average:inf'))throw Error('Output frames differ; representative export is not validated');
    for(const [side,job] of [['baseline',before],['optimized',after]]){
      await execute(['-v','error','-i',job.output,'-f','null','-'],path.join(directory,side+'-decode-'+index+'.log'));
      const pcm=path.join(directory,side+'-audio-'+index+'.md5');
      await execute(['-v','error','-i',job.output,'-map','0:a:0','-c:a','pcm_s16le','-f','framemd5','-y',pcm],path.join(directory,side+'-audio-'+index+'.log'));
    }
    if(hashFile(path.join(directory,'baseline-audio-'+index+'.md5'))!==hashFile(path.join(directory,'optimized-audio-'+index+'.md5')))throw Error('Decoded audio differs');
    const beforeAss=fs.readdirSync(path.join(directory,'baseline-'+index)).filter(file=>file.endsWith('.ass'));
    const afterAss=fs.readdirSync(path.join(directory,'optimized-'+index)).filter(file=>file.endsWith('.ass'));
    if(snapshot.items.some(item=>item.item_type==='TEXT') && (beforeAss.length!==1||afterAss.length!==1||hashFile(path.join(directory,'baseline-'+index,beforeAss[0]))!==hashFile(path.join(directory,'optimized-'+index,afterAss[0]))))throw Error('Caption text/style/timing differs');
    const frameNumbers=[...new Set(snapshot.items.flatMap(item=>[Math.round(Number(item.start_time)*30),Math.round((Number(item.start_time)+Math.min(Number(item.duration)/2,.5))*30),Math.floor((Number(item.start_time)+Number(item.duration))*30)-1]).filter(n=>n>=0&&n<Number(av.nb_frames)))].sort((a,b)=>a-b);
    fs.writeFileSync(path.join(directory,'representative-frame-indices-'+index+'.json'),JSON.stringify(frameNumbers),{mode:0o600});
    // Full-frame PSNR already checks every transition and every text frame;
    // record source frame indices for later private visual review.
    checked.push({cohortIndex:index,duration,frames:Number(av.nb_frames),everyFrameIdentical:true,decodedAudioIdentical:true,
      textAssIdentical:true,fullDecodePassed:true,psnr,representativeFrameCount:frameNumbers.length});
  }
  results.validation={passed:true,pairs:checked};
  results.representativeOptimizedRendererWithinTwoHours=results.variants.optimized.completedWithinTwoHours;
  results.productionFixed=false;results.applicationDeadlineCompletionVerified=false;
  fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify(results,null,2),{mode:0o600});
  console.log(JSON.stringify({validated:true,representativeOptimizedRendererWithinTwoHours:results.representativeOptimizedRendererWithinTwoHours,
    improvementPercent:results.improvementPercent,productionFixed:false}));
  return results;
}
module.exports={compare};
if(require.main===module){const [outputDir,bundleDir]=process.argv.slice(2);
  verifyBundle(bundleDir).then(({snapshot,digest})=>compare({outputDir,snapshot,digest})).catch(error=>{console.error(error.message);process.exitCode=1;});}
