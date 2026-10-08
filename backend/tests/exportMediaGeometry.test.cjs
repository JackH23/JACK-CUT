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
  if(n==='../models/ExportJob')return {create:async()=>{},update:async()=>{}};
  if(n==='../models/Project')return {};
  if(n==='../models/ProjectMedia')return {findOne:async()=>({})};
  if(n==='../services/fileAccess')return {};
  if(n==='../services/storage')return {workspace:async()=>root+'/tmp/render-test',materialize:async()=>root+'/uploads/media/source.mp4',persist:async()=> 'r2:/exports/test.mp4',cleanup:async()=>{}};
  if(n==='../models/TimelineItem')return {findAll:async()=>[item]};
  if(n==='../models/Media')return {findAll:async()=>[{id:'source',media_type:'video',file_url:'/uploads/media/source.mp4'}]};
  if(n==='sequelize')return {Op:{in:Symbol('in')}};
  if(n==='node:fs')return mockFs;
  if(n==='node:child_process')return {spawn:(_,a)=>{args=a;return child;}};
  return n.startsWith('.')?require(path.resolve(root,'controllers',n)):require(n);
 };
 const m={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'controllers/exportController.js'),'utf8'),{require:load,module:m,exports:m.exports,process:{cwd:()=>root,env:{}},console:{log:(...a)=>logs.push(a),error(){}},Date,Number,String,Map,Set,JSON});
 let response;const res={status(code){assert.equal(code,202);return this;},json(v){response=v;}};
 await m.exports.createExport({body:{projectId:'66ec12e5-244b-43e2-b36e-57bec761ade8'}},res);
 child.stderr.emit('data',Buffer.from('frame= 180 fps= 30 speed=1x'));
 child.emit('close',0);
 return {graph:args[args.indexOf('-filter_complex')+1],clip:logs.find(e=>e[0]==='EXPORT CLIP')[1],response};
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
