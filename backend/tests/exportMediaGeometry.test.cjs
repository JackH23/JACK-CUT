const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const root=path.resolve(__dirname,'..');
async function create(extra={}){
 const item={id:'media-item',item_type:'MEDIA',media_id:'source',start_time:2,duration:4,source_start:1,
  media_scale:.55,media_x:-65,media_y:-40,animation_preset:'none',animation_amount:50,
  animation_in_preset:'none',animation_in_duration:1,animation_in_amount:50,animation_out_preset:'none',animation_out_duration:1,animation_out_amount:50,...extra};
 let args;const logs=[];const child=new EventEmitter();child.stderr=new EventEmitter();child.stdout=new EventEmitter();
 const mockFs={existsSync:()=>true,mkdirSync(){},writeFileSync(){},renameSync(){}};
 const load=n=>{
  if(n==='../utils/mediaStreams')return {hasAudioStream:async()=>extra.hasAudio !== false};
  if(n==='../models/ExportJob')return {create:async()=>{},update:async()=>{}};
  if(n==='../models/Project')return {sequelize:{transaction:async callback=>callback({LOCK:{UPDATE:'UPDATE'}})},findOne:async()=>({})};
  if(n==='../models/ProjectMedia')return {findOne:async()=>({})};
  if(n==='../services/fileAccess')return {};
  if(n==='../services/storage')return {workspace:async()=>root+'/tmp/render-test',materialize:async()=>root+'/uploads/media/source.mp4',persist:async()=> 'r2:/exports/test.mp4',cleanup:async()=>{}};
  if(n==='../models/TimelineItem')return {findAll:async()=>extra.items || [item]};
  if(n==='../models/Media')return {findAll:async()=>extra.media || [{id:'source',media_type:extra.mediaType || 'video',file_url:'/uploads/media/source.mp4'}]};
  if(n==='sequelize')return {Op:{in:Symbol('in')}};
  if(n==='node:fs')return mockFs;
  if(n==='node:child_process')return {spawn:(_,a)=>{args=a;return child;}};
  return n.startsWith('.')?require(path.resolve(root,'controllers',n)):require(n);
 };
 const m={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'controllers/exportController.js'),'utf8'),{require:load,module:m,exports:m.exports,process:{cwd:()=>root,env:{}},console:{log:(...a)=>logs.push(a),error(){}},Date,Number,String,Map,Set,JSON});
 let response;const res={status(code){assert.equal(code,202);return this;},json(v){response=v;}};
 await m.exports.createExport({body:{projectId:'66ec12e5-244b-43e2-b36e-57bec761ade8'},user:{id:'owner'}},res);
 child.stderr.emit('data',Buffer.from('frame= 180 fps= 30 speed=1x'));
 child.emit('close',0);
 return {videoMap:args[args.indexOf('-map')+1],graph:args[args.indexOf('-filter_complex')+1],clip:logs.find(e=>e[0]==='EXPORT CLIP')?.[1],response};
}
test('real controller carries database transform values into a fitted static media graph',async()=>{
 const {graph,clip}=await create();assert.equal(clip.mediaScale,.55);assert.equal(clip.mediaX,-65);assert.equal(clip.mediaY,-40);assert.equal(clip.sourceStart,1);
 assert.ok(graph.includes('trim=start=1:duration=4,setpts=PTS-STARTPTS,fps=30'));
 assert.ok(graph.includes('scale=1056:594:force_original_aspect_ratio=decrease'));
 assert.ok(graph.includes("x='765-overlay_w/2':y='420-overlay_h/2'"));
 assert.ok(graph.includes('atrim=start=1:duration=4,asetpts=PTS-STARTPTS,adelay=2000|2000'));
 assert.ok(!graph.includes('geq='));assert.ok(!graph.includes('pad='));assert.ok(!graph.includes('split='));
});
test('real controller composes local animated geometry with complementary timeline windows',async()=>{
 const {graph}=await create({animation_in_preset:'zoom-in',animation_out_preset:'slide-right'});
 assert.ok(graph.includes('setpts=PTS-STARTPTS,fps=30,split=2'));
 assert.ok(graph.includes('pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black@0'));
 assert.ok(graph.includes('st(1,1/((0.55)*('));assert.ok(graph.includes('/100+(-195)'));
 assert.ok(graph.includes("enable='lt(t,1)+gte(t,3)'"));
 assert.ok(graph.includes("enable='between(t,2,6)*not(lt((t-2),1)+gte((t-2),3))'"));
 assert.ok(graph.includes("enable='between(t,2,6)*(lt((t-2),1)+gte((t-2),3))'"));
 assert.ok(graph.indexOf('geq=')<graph.indexOf('setpts=PTS+2/TB[animated0]'));
});

test('silent video does not create a nonexistent audio filter input', async () => {
 const {graph}=await create({hasAudio:false});
 assert.ok(!graph.includes('[2:a]'));
 assert.ok(graph.includes('[1:a]amix=inputs=1'));
});

test('real FFmpeg reproduces missing audio and accepts the fixed controller graph', async () => {
 const {execFileSync,spawnSync}=require('node:child_process');
 const scratch=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'jackcut-audio-regression-'));
 try {
  const video=path.join(scratch,'silent.mp4');
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=purple:s=160x90:r=30:d=0.4','-an','-c:v','libx264',video]);
  const run=graph=>spawnSync(process.env.FFMPEG_PATH || 'ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=black:s=1920x1080:r=30:d=0.4','-f','lavfi','-i','anullsrc=r=48000:cl=stereo:d=0.4','-i',video,'-filter_complex',graph,'-map','[composed0]','-map','[outa]','-t','0.4','-f','null','-'],{encoding:'utf8',timeout:30000});
  const oldGraph=(await create({hasAudio:true,start_time:0,duration:0.4,source_start:0})).graph;
  const broken=run(oldGraph); assert.notEqual(broken.status,0); assert.match(broken.stderr,/matches no streams/);
  const graph=(await create({hasAudio:false,start_time:0,duration:0.4,source_start:0})).graph;
  const fixed=run(graph); assert.equal(fixed.status,0,fixed.stderr);
  const {hasAudioStream}=require('../utils/mediaStreams');
  assert.equal(await hasAudioStream(video),false);
  const sound=path.join(scratch,'sound.mp4');
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=purple:s=160x90:r=30:d=0.4','-f','lavfi','-i','sine=frequency=440:duration=0.4','-c:v','libx264','-c:a','aac',sound]);
  assert.equal(await hasAudioStream(sound),true);
 } finally { fs.rmSync(scratch,{recursive:true,force:true}); }
});

test('real FFmpeg renders audio-only and mixed silent/sounding video timelines without losing audio', async () => {
 const {execFileSync,spawnSync}=require('node:child_process');
 const scratch=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'jackcut-media-combinations-'));
 const ffmpeg=process.env.FFMPEG_PATH || 'ffmpeg';
 try {
  const audio=path.join(scratch,'tone.wav'),video=path.join(scratch,'silent.mp4');
  execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:duration=0.6',audio]);
  execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=purple:s=160x90:r=30:d=0.6','-an','-c:v','libx264',video]);
  const base={item_type:'MEDIA',start_time:0,duration:0.6,source_start:0,media_scale:1,media_x:0,media_y:0};
  const cases=[
   {name:'audio-only',items:[{...base,id:'a',media_id:'a'}],media:[{id:'a',media_type:'audio',file_url:audio}],inputs:[audio],videoLabel:'0:v'},
   {name:'mixed',items:[{...base,id:'v',media_id:'v'},{...base,id:'a',media_id:'a'}],media:[{id:'v',media_type:'video',file_url:video},{id:'a',media_type:'audio',file_url:audio}],inputs:[video,audio],videoLabel:'composed0',hasAudio:false},
  ];
  for(const example of cases){
   const {graph,videoMap}=await create(example);
   if(example.name==='audio-only') assert.ok(graph.includes('[2:a]atrim='));
   else {assert.ok(!graph.includes('[2:a]'));assert.ok(graph.includes('[3:a]atrim='));}
   const output=path.join(scratch,example.name+'.mp4');
   const args=['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=black:s=1920x1080:r=30:d=0.6','-f','lavfi','-i','anullsrc=r=48000:cl=stereo:d=0.6'];
   for(const input of example.inputs)args.push('-i',input);
   const rendered=spawnSync(ffmpeg,[...args,'-filter_complex',graph,'-map',videoMap,'-map','[outa]','-t','0.6','-c:v','libx264','-preset','ultrafast','-c:a','aac',output],{encoding:'utf8',timeout:30000});
   assert.equal(rendered.status,0,example.name+': '+rendered.stderr);
   const probe=JSON.parse(execFileSync(process.env.FFPROBE_PATH || 'ffprobe',['-v','error','-show_streams','-show_format','-of','json',output],{encoding:'utf8'}));
   assert.ok(probe.streams.some(s=>s.codec_name==='h264'));
   assert.ok(probe.streams.some(s=>s.codec_name==='aac'));
   assert.ok(Math.abs(Number(probe.format.duration)-0.6)<0.08);
   const volume=spawnSync(ffmpeg,['-hide_banner','-i',output,'-vn','-af','volumedetect','-f','null','-'],{encoding:'utf8',timeout:30000});
   assert.equal(volume.status,0,volume.stderr);
   const mean=volume.stderr.match(/mean_volume: (-?[\d.]+) dB/);
   assert.ok(mean && Number(mean[1])>-40,example.name+' must retain the audible source');
  }
 } finally { fs.rmSync(scratch,{recursive:true,force:true}); }
});
