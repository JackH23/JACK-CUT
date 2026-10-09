const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const root=path.resolve(__dirname,'..');
async function create(extra={}){
 const item={id:'media-item',item_type:'MEDIA',media_id:'source',start_time:2,duration:4,source_start:1,
  media_scale:.55,media_x:-65,media_y:-40,animation_preset:'none',animation_amount:50,
  animation_in_preset:'none',animation_in_duration:1,animation_in_amount:50,animation_out_preset:'none',animation_out_duration:1,animation_out_amount:50,...extra};
 const row={}; let args, assContent;const logs=[];const child=new EventEmitter();child.stderr=new EventEmitter();child.stdout=new EventEmitter();
 const mockFs={existsSync:()=>true,mkdirSync(){},writeFileSync(_, content){assContent=content;},renameSync(){}};
 const load=n=>{
  if(n==='../utils/mediaStreams')return {hasAudioStream:async()=>extra.hasAudio !== false};
  if(n==='../models/ExportJob')return {create:async data=>Object.assign(row,{cancel_requested_at:null,...data}),findOne:async()=>null,findByPk:async()=>row,update:async data=>{Object.assign(row,data);return [1];}};
  if(n==='../models/Project')return {sequelize:{transaction:async callback=>callback({LOCK:{UPDATE:'UPDATE'}})},findOne:async()=>({})};
  if(n==='../models/ProjectMedia')return {findOne:async()=>({})};
  if(n==='../services/fileAccess')return {};
  if(n==='../services/storage')return {referenceFor:key=>'r2:/'+key,workspace:async()=>root+'/tmp/render-test',materialize:async()=>root+'/uploads/media/source.mp4',persist:async()=> 'r2:/exports/test.mp4',cleanup:async()=>{}};
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
 await new Promise(resolve=>setImmediate(resolve));
 child.stderr.emit('data',Buffer.from('frame= 180 fps= 30 speed=1x'));
 child.emit('close',0);
 return {args,assContent,videoMap:args[args.indexOf('-map')+1],graph:args[args.indexOf('-filter_complex')+1],clip:logs.find(e=>e[0]==='EXPORT CLIP')?.[1],response};
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
  const audio=path.join(scratch,'tone.wav'),video=path.join(scratch,'silent.mp4'),soundVideo=path.join(scratch,'sound.mp4');
  execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:duration=0.6',audio]);
  execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=purple:s=160x90:r=30:d=0.6','-an','-c:v','libx264',video]);
  execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=purple:s=160x90:r=30:d=0.6','-f','lavfi','-i','sine=frequency=440:duration=0.6','-c:v','libx264','-c:a','aac',soundVideo]);
  const base={item_type:'MEDIA',start_time:0,duration:0.6,source_start:0,media_scale:1,media_x:0,media_y:0};
  const cases=[
   {name:'video-with-audio',items:[{...base,id:'v',media_id:'v'}],media:[{id:'v',media_type:'video',file_path:soundVideo}],inputs:[soundVideo],videoLabel:'composed0',hasAudio:true},
   {name:'video-only',items:[{...base,id:'v',media_id:'v'}],media:[{id:'v',media_type:'video',file_path:video}],inputs:[video],videoLabel:'composed0',hasAudio:false,silent:true},
   {name:'audio-only',items:[{...base,id:'a',media_id:'a'}],media:[{id:'a',media_type:'audio',file_url:audio}],inputs:[audio],videoLabel:'0:v'},
   {name:'mixed',items:[{...base,id:'v',media_id:'v'},{...base,id:'a',media_id:'a'}],media:[{id:'v',media_type:'video',file_url:video},{id:'a',media_type:'audio',file_url:audio}],inputs:[video,audio],videoLabel:'composed0',hasAudio:false},
  ];
  for(const example of cases){
   const {graph,videoMap}=await create(example);
   if(example.name==='audio-only') assert.ok(graph.includes('[2:a]atrim='));
   else if(example.name==='mixed') {assert.ok(!graph.includes('[2:a]'));assert.ok(graph.includes('[3:a]atrim='));}
   else assert.equal(graph.includes('[2:a]'),!example.silent);
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
   assert.ok(mean && (example.silent ? Number(mean[1]) < -60 : Number(mean[1])>-40),example.name+' must retain the expected source audio');
   const playback=spawnSync(ffmpeg,['-v','error','-i',output,'-f','null','-'],{encoding:'utf8',timeout:30000});assert.equal(playback.status,0,playback.stderr);
  }
 } finally { fs.rmSync(scratch,{recursive:true,force:true}); }
});

test('real controller exports image storytelling with animated captions to a decodable MP4', async () => {
 const {execFileSync,spawnSync}=require('node:child_process');
 const scratch=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'jackcut-story-export-'));
 const ffmpeg=process.env.FFMPEG_PATH || 'ffmpeg';
 try {
  const image=path.join(scratch,'photo.png'), output=path.join(scratch,'story.mp4');
  execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=purple:s=160x90','-frames:v','1',image]);
  const {args,assContent}=await create({mediaType:'image',items:[
   {item_type:'MEDIA',media_id:'source',start_time:0,duration:0.6,media_scale:1},
   {item_type:'TEXT',text_content:'Story caption',start_time:0,duration:0.6,text_x:50,text_y:70,font_family:'Arial',animation_in_preset:'fade',animation_in_duration:0.3,animation_in_amount:100},
  ]});
  assert.match(assContent,/Story caption/); assert.match(assContent,/\\1a&H/);
  fs.writeFileSync(path.join(scratch,'captions.ass'),assContent);
  const actual=args.map(value=>value.endsWith('/uploads/media/source.mp4')?image:value);
  actual[actual.indexOf('-filter_complex')+1]=actual[actual.indexOf('-filter_complex')+1].replace(/ass='[^']*'/,"ass='captions.ass'");
  actual[actual.indexOf('-preset')+1]='ultrafast'; actual[actual.length-1]=output;
  const rendered=spawnSync(ffmpeg,['-hide_banner','-loglevel','error',...actual],{cwd:scratch,encoding:'utf8',timeout:30000});
  assert.equal(rendered.status,0,rendered.stderr);
  const probe=JSON.parse(execFileSync(process.env.FFPROBE_PATH || 'ffprobe',['-v','error','-show_streams','-show_format','-of','json',output],{encoding:'utf8'}));
  assert.ok(probe.streams.some(s=>s.codec_name==='h264')); assert.ok(probe.streams.some(s=>s.codec_name==='aac'));
  assert.ok(Math.abs(Number(probe.format.duration)-0.6)<0.08);
  const decoded=spawnSync(ffmpeg,['-v','error','-i',output,'-f','null','-'],{encoding:'utf8',timeout:30000});
  assert.equal(decoded.status,0,decoded.stderr);
 } finally { fs.rmSync(scratch,{recursive:true,force:true}); }
});

test('still-image branches cache scaled frames before animation while retaining fractional geometry', async () => {
 const {args,graph}=await create({mediaType:'image',animation_in_preset:'zoom-in',animation_out_preset:'slide-right'});
 assert.ok(!args.includes('-loop'), 'Do not repeatedly decode the source image');
 assert.equal(args[args.indexOf('-framerate')+1],'30');
 assert.ok(graph.includes('scale=1056:594:force_original_aspect_ratio=decrease,format=yuva444p,loop=loop=-1:size=1:start=0,trim=duration=4'));
 const cached=graph.indexOf('pad=1920:1080');
 const loop=graph.indexOf('loop=loop=-1:size=1:start=0',cached);
 assert.ok(cached<loop && loop<graph.indexOf('geq=',loop));
 assert.ok(graph.includes("enable='lt(t,1)+gte(t,3)'"), 'Animation evaluates clip-local time on repeated frames');
 assert.ok(graph.includes('setpts=PTS+2/TB[animated0]'));
 assert.equal(args[args.indexOf('-filter_complex_threads')+1],'1');
 assert.equal(args[args.lastIndexOf('-threads')+1],'1');
});
